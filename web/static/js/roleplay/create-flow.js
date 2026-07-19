// === Section: 角色创建流程 ===
// 创建角色 + 刷新世界观/角色 + 系统消息

App.addSystemMessage = function(text) {
    const msg = {
        id: 'msg_' + Date.now(),
        role: 'system',
        type: 'system',
        content: text,
        timestamp: new Date().toISOString()
    };
    state.messages.push(msg);
    renderMessage(msg);
    saveMessages().catch(() => {});
}

App.createCharacter = async function() {
    const chatKey = document.getElementById('setup-chat-key').value.trim();
    const storyPrompt = document.getElementById('story-prompt').value.trim();
    const playerGender = document.querySelector('input[name="player-gender"]:checked')?.value || '男';
    const rawPlayerName = document.getElementById('setup-player-name')?.value.trim() || '';

    if (!chatKey) {
        App.showErrorModal('请先填写对话 API Key', '⚠️ 提示');
        return;
    }

    // 校验 API Key 有效性（复用 validateApiKey）
    App.showKeyCheckOverlay();
    try {
        const valid = await App.validateApiKey(chatKey);
        if (!valid) {
            App.hideKeyCheckOverlay();
            App.showErrorModal('API Key 无效，请检查后重试', '❌ 校验失败');
            return;
        }
    } catch (e) {
        App.hideKeyCheckOverlay();
        App.showErrorModal('API Key 校验失败，请检查网络连接或 Key 是否正确', '❌ 网络错误');
        return;
    } finally {
        App.hideKeyCheckOverlay();
    }

    state.apiKeys.chat = chatKey;
    localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));

    // 从灵感中提取玩家名字（如"扮演林渊"），否则使用用户输入或默认名
    const defaultName = '无名旅者';
    let playerName = rawPlayerName;
    if (!playerName) {
        try {
            const identityModule = await import('./system-prompt/player-identity.js');
            playerName = identityModule.extractPlayerName(storyPrompt, defaultName);
        } catch (e) {
            playerName = defaultName;
        }
    }
    if (!playerName) playerName = defaultName;

    state.player = { name: playerName, gender: playerGender, faceImageUrl: '' };
    state.characters = [];
    state.activeCharIndex = 0;
    state.emotions = {};
    state.revealed = {};

    // 画面风格优先级：LLM 灵感检测 > 用户手动选择 > 默认 cel shaded anime style
    // 用户选"🎲 随机"时，完全交给 LLM 从灵感中识别
    const setupSelect = document.getElementById('setup-art-style');
    const userSelectedStyle = setupSelect && setupSelect.value ? setupSelect.value : null;
    
    // 立即切换到聊天界面，避免用户看到卡死
    state.story = {
        title: '',
        worldview: '',
        mainArc: [],
        openingScene: '',
        toneKeywords: [],
        worldviewNotes: '',
        factors: null,
        userInspiration: '',
        phase: 'idle',
        imageStyle: userSelectedStyle || 'cel shaded anime style'
    };
    state.messages = [];

    try {
        await openDB();
    } catch(e) { /* IndexedDB 不可用，使用 localStorage 回退 */ }
    await saveState();
    await saveMessages();

    showChatScreen();
    renderMessages();
    document.getElementById('send-btn').disabled = true;
    addSystemMessage('正在初始化故事世界...');

    // ===== 并行执行：风格识别 + 故事初始化（互不阻塞）=====
    const storyPromise = (async () => {
        try {
            rpLog('info', 'CREATE', `开始两阶段初始化，玩家: ${playerName} (${playerGender})`);
            await App.initializeStory(storyPrompt, playerGender, playerName);
            rpLog('info', 'CREATE', '初始化完成，进入聊天阶段');
        } catch (err) {
            rpLog('error', 'CREATE', '初始化失败: ' + (err.message || String(err)));
            addSystemMessage('❌ 初始化失败: ' + (err.message || String(err)));
        }
    })();

    const stylePromise = (async () => {
        // LLM 语义识别画面风格（异步，失败则 fallback 到用户选择）
        let detectedStyle = null;
        try {
            detectedStyle = await App.extractStyleFromInspiration(storyPrompt, userSelectedStyle);
        } catch (e) {
            rpLog('warn', 'STYLE', `LLM 风格识别异常: ${e.message}，使用用户选择`);
        }
        
        // 优先级链：灵感检测（LLM 返回的任何结果都直接用） > 用户手动选择 > 默认随机
        // 只要灵感中强调了画风/画面风格，LLM 返回的结果就是有效识别，不视为 fallback
        let imageStyle;
        if (detectedStyle) {
            imageStyle = detectedStyle;
            rpLog('info', 'STYLE', `从灵感中检测到画面风格: ${detectedStyle}`);
            if (userSelectedStyle && userSelectedStyle !== detectedStyle) {
                rpLog('info', 'STYLE', `用户手动选择 "${userSelectedStyle}" 被灵感检测结果 "${detectedStyle}" 覆盖（灵感优先）`);
            }
        } else {
            imageStyle = userSelectedStyle || '';
            if (!imageStyle) {
                rpLog('info', 'STYLE', `灵感未检测到风格且用户未选择，使用随机`);
            } else {
                rpLog('info', 'STYLE', `灵感未检测到风格，使用用户选择: ${imageStyle}`);
            }
        }
        state.story.imageStyle = imageStyle;

        // ⭐ 画风识别完成后立即启动锚点校准，不等待故事初始化/角色生成
        try {
            if (typeof App.startStyleCalibrationBg === 'function' && !state.story?.styleAnchor) {
                App.startStyleCalibrationBg('', imageStyle);
                rpLog('info', 'STYLE', `🚀 风格校准已启动（不依赖场景描述）`);
            }
        } catch (e) {
            rpLog('warn', 'STYLE', `风格校准启动异常: ${e.message}`);
        }
    })();

    // 并行等待两个任务完成
    await Promise.all([storyPromise, stylePromise]);
};

App.generateCharactersAndStart = async function() {
    document.getElementById('send-btn').disabled = true;
    addSystemMessage('正在生成角色...');
    state.story.phase = 'regenerating_chars';
    await saveState();

    try {
        const chars = await App.generateCharacters(state.characters.length, state.player?.gender, state.story.userInspiration || '', '');
        addSystemMessage(`✅ 角色生成完成！共 ${chars.length} 个角色。`);
        rpLog('info', 'CHARS', `generateCharactersAndStart chars.length=${chars.length}, state.characters.length=${state.characters.length}`);
        let openingRaw = '';
        let openingStructured = null;

        if (state.apiKeys.chat && chars.length > 0) {
            rpLog('info', 'IMG', `━━━ 立即生成面部特写: ${chars.length} 个角色 ━━━`);
            const faceTasks = chars.map(c => (async () => {
                try {
                    rpLog('info', 'IMG', `📷 面部特写: ${c.name}`);
                    const url = await App.generateCharacterFaceOnly(c);
                    if (url) {
                        rpLog('info', 'IMG', `✅ ${c.name} 面部特写完成`);
                        addSystemMessage(`✅ ${c.name} 头像已生成`);
                    }
                } catch (e) {
                    rpLog('warn', 'IMG', `${c.name} 面部特写失败: ${e.message}`);
                }
            })());
            await Promise.allSettled(faceTasks);
            rpLog('info', 'IMG', '所有面部特写完成');

            try {
                // 第一步：生成序章
                rpLog('info', 'OPENING', '开始生成序章');
                addSystemMessage('✍️ 正在生成序章...');
                
                const openingResult = await App.generateOpeningScene();
                openingRaw = openingResult?.rawText || '';
                openingStructured = openingResult?.structured || null;

                if (openingRaw) {
                    rpLog('info', 'OPENING', '序章生成完成，立即渲染序章场景消息');

                    let parsedMessages = [];
                    if (openingStructured) {
                        parsedMessages = App.structuredToMessages(openingStructured, 'msg_opening_', { skipCharacters: true });
                    }
                    for (const msg of parsedMessages) {
                        state.messages.push(msg);
                        renderMessage(msg);
                    }
                    saveMessages().catch(() => {});
                    rpLog('info', 'TIMING', '✅ 序章场景消息渲染完成');
                } else {
                    rpLog('warn', 'OPENING', '序章生成返回空');
                }

                // 第二步：渲染角色消息 + 异步并行生成全身/半身（含序章动作描写）
                if (openingStructured && openingStructured.characters?.length > 0) {
                    const appearingChars = openingStructured.characters;
                    rpLog('info', 'OPENING', `序章出场 ${appearingChars.length} 个角色`);

                    for (const charData of appearingChars) {
                        let fullContent = '';
                        if (charData.action) fullContent += `(${charData.action})`;
                        if (charData.dialogue) fullContent += charData.dialogue;
                        if (charData.thought) fullContent += `[${charData.thought}]`;
                        if (!fullContent) fullContent = charData.dialogue || '(无内容)';

                        const charMsgObj = {
                            id: 'msg_opening-' + charData.name,
                            role: 'char',
                            type: 'multi_char',
                            charName: charData.name,
                            charIndex: state.characters.findIndex(c => c.name === charData.name),
                            content: fullContent,
                            action: charData.action || '',
                            dialogue: charData.dialogue || '',
                            thought: charData.thought || ''
                        };
                        state.messages.push(charMsgObj);
                        renderMessage(charMsgObj);
                        rpLog('info', 'OPENING', `${charData.name} 角色消息已渲染`);
                    }
                    saveMessages().catch(() => {});
                    rpLog('info', 'TIMING', '✅ 所有角色消息已渲染');

                    const avatarTasks = [];

                    // 主角头像
                    rpLog('info', 'IMG', '后台生成主角头像');
                    avatarTasks.push((async () => {
                        try {
                            const playerUrl = await App.generatePlayerAvatar();
                            rpLog('info', 'IMG', `主角头像生成完成: ${playerUrl ? 'yes' : 'no'}`);
                            App.updateAvatarInExistingMessages(state.player?.name || '玩家', playerUrl);
                        } catch (e) {
                            rpLog('warn', 'IMG', `主角头像生成失败: ${e.message}`);
                        }
                    })());

                    // 每个出场角色的全身/半身 — 用序章动作描写注入 prompt
                    for (const charInfo of appearingChars) {
                        const charName = charInfo.name;
                        const charObj = chars.find(c => c.name === charName);
                        if (!charObj) continue;

                        const actionText = charInfo.action ? charInfo.action.replace(/[（(].*?[）)]/g, '').trim() : '';
                        rpLog('info', 'IMG', `后台生成 ${charName} 全身/半身（动作: ${actionText || '默认站立'}）`);
                        avatarTasks.push((async () => {
                            try {
                                addSystemMessage(`🎨 正在生成 ${charName} 的角色形象...`);
                                const result = await App.generateCharacterImage(charObj, actionText, true);
                                if (result) {
                                    rpLog('info', 'IMG', `${charName} 全身/半身生成成功`);
                                    addSystemMessage(`✅ ${charName} 角色形象生成完成`);
                                    App.updateAvatarInExistingMessages(charName, result);
                                } else {
                                    rpLog('warn', 'IMG', `${charName} 全身/半身生成失败`);
                                }
                            } catch (e) {
                                rpLog('error', 'IMG', `${charName} 全身/半身生成异常: ${e.message}`);
                            }
                        })());
                    }

                    const allCharNames = appearingChars.map(c => c.name);
                    const allCharObjs = allCharNames.map(name => chars.find(c => c.name === name)).filter(Boolean);
                    const metadata = { presentCharacters: allCharNames };

                    const sceneTask = Promise.allSettled(avatarTasks).then(() => {
                        const sceneRefUrls = allCharObjs.map(c => c.faceImageUrl || c.portraitImageUrl).filter(Boolean);
                        if (sceneRefUrls.length > 0) {
                            rpLog('info', 'SCENE', `所有头像就绪 (${allCharNames.join(', ')})，开始生成统一场景图`);
                            return App.generateSceneImage('opening', openingStructured.scene || openingRaw, allCharObjs[0], openingRaw, metadata);
                        } else {
                            rpLog('warn', 'SCENE', '头像全部生成失败，跳过场景图');
                        }
                    }).catch(e => {
                        rpLog('error', 'SCENE', `场景图生成异常: ${e.message}`);
                    });
                    avatarTasks.push(sceneTask);
                }
            } catch (imgErr) {
                rpLog('error', 'IMG', '生图阶段失败: ' + imgErr.message);
                addSystemMessage(`⚠️ 生图阶段失败: ${imgErr.message}`);
            }
        } else if (!state.apiKeys.chat) {
            // 没有生图 API Key，也生成序章
            try {
                const openingResult = await App.generateOpeningScene();
                if (openingResult) {
                    openingRaw = openingResult.rawText || '';
                    openingStructured = openingResult.structured || null;
                    rpLog('info', 'OPENING', '序章生成完成（无生图）');
                }
            } catch (err) {
                rpLog('warn', 'OPENING', '序章生成失败: ' + err.message);
            }
        }

        // 兜底：如果 openingRaw 为空但 structured 有值（不应该发生，但保护一下），在这里渲染
        rpLog('info', 'TIMING', '=== 序章渲染检查 ===');
        if (!openingRaw && openingStructured && openingStructured.characters?.length > 0) {
            rpLog('info', 'INIT-REPLY', 'openingRaw 为空但 structured 有值，兜底渲染');
            let parsedMessages = App.structuredToMessages(openingStructured, 'msg_opening_');
            for (const msg of parsedMessages) {
                state.messages.push(msg);
                renderMessage(msg);
            }
            saveMessages().catch(() => {});
            rpLog('info', 'TIMING', '✅ 序章消息渲染完成（兜底）');
        } else if (!openingStructured || openingStructured.characters?.length === 0) {
            rpLog('error', 'INIT-REPLY', '❌ 序章结构化结果为空，无法渲染');
            addSystemMessage('⚠️ 序章生成失败，请重试');
        }
        // 如果 openingRaw 非空，上面已经渲染过了，不再重复

        // 渲染序章建议选项（此前未渲染，导致玩家在序章后看不到快捷回复按钮）
        App.renderOpeningReplyOptions(openingStructured, openingRaw);

        rpLog('info', 'CHARS', '角色生成完成，进入聊天阶段');
    } catch (err) {
        rpLog('error', 'CHARS', '角色生成失败: ' + (err.message || String(err)));
        addSystemMessage('❌ 角色生成失败: ' + (err.message || String(err)));
    } finally {
        state.story.phase = 'chat';
        await saveState();

        document.getElementById('send-btn').disabled = false;
    }
};

App.regenerateWorldview = async function() {
    const btn = document.getElementById('btn-regen-worldview');
    if (btn) btn.disabled = true;

    addSystemMessage('🔄 正在重新构思故事世界...');
    state.story.phase = 'regenerating_worldview';
    await saveState();

    try {
        const userInspiration = document.getElementById('story-prompt')?.value.trim() || '';
        await App.generateWorldview(userInspiration);
        addSystemMessage('✅ 世界观已重新生成！可以继续生成角色或刷新世界观。');
        rpLog('info', 'REGEN', '世界观重新生成完成');
    } catch (err) {
        rpLog('error', 'REGEN', '世界观重新生成失败: ' + (err.message || String(err)));
        addSystemMessage('❌ 世界观重新生成失败: ' + (err.message || String(err)));
    } finally {
        state.story.phase = 'worldview';
        await saveState();
        if (btn) btn.disabled = false;
    }
};

App.regenerateCharacters = async function() {
    const btn = document.getElementById('btn-regen-chars');
    if (btn) btn.disabled = true;

    addSystemMessage('🔄 正在重新生成角色...');
    state.story.phase = 'regenerating_chars';
    await saveState();

    state.characters = [];
    state.emotions = {};
    state.revealed = {};
    await saveState();

    // 从用户灵感中解析目标角色数，避免硬编码
    const inspiration = state.story.userInspiration || '';
    let targetCount = 3; // fallback
    const cnNums = {'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
    const numMatch = inspiration.match(/([一二两三四五六七八九十\d]+)[名个位]?[男女]/);
    if (numMatch) {
        let parsed = parseInt(numMatch[1]);
        if (isNaN(parsed)) {
            parsed = 0;
            for (const ch of numMatch[1]) {
                parsed += cnNums[ch] || 0;
            }
        }
        targetCount = parsed;
    }

    try {
        let openingRaw = '';
        let openingStructured = null;

        const chars = await App.generateCharacters(targetCount, state.player?.gender, inspiration, '');
        addSystemMessage(`✅ 角色重新生成完成！共 ${chars.length} 个角色。`);
        rpLog('info', 'CHARS', `regenerateCharacters 返回 chars.length=${chars.length}, state.characters.length=${state.characters.length}`);

        if (state.apiKeys.chat && chars.length > 0) {
            rpLog('info', 'IMG', `━━━ 立即生成面部特写: ${chars.length} 个角色 ━━━`);
            const faceTasks = chars.map(c => (async () => {
                try {
                    rpLog('info', 'IMG', `📷 面部特写: ${c.name}`);
                    const url = await App.generateCharacterFaceOnly(c);
                    if (url) {
                        rpLog('info', 'IMG', `✅ ${c.name} 面部特写完成`);
                        addSystemMessage(`✅ ${c.name} 头像已生成`);
                    }
                } catch (e) {
                    rpLog('warn', 'IMG', `${c.name} 面部特写失败: ${e.message}`);
                }
            })());
            await Promise.allSettled(faceTasks);
            rpLog('info', 'IMG', '所有面部特写完成');

            try {
                // 第一步：生成序章
                rpLog('info', 'OPENING', '开始生成序章');
                addSystemMessage('✍️ 正在生成序章...');
                
                const openingResult = await App.generateOpeningScene();
                openingRaw = openingResult?.rawText || '';
                openingStructured = openingResult?.structured || null;

                if (openingRaw) {
                    rpLog('info', 'OPENING', '序章重新生成完成，立即渲染序章场景消息');

                    let parsedMessages = [];
                    if (openingStructured) {
                        parsedMessages = App.structuredToMessages(openingStructured, 'msg_opening_', { skipCharacters: true });
                    }
                    for (const msg of parsedMessages) {
                        state.messages.push(msg);
                        renderMessage(msg);
                    }
                    saveMessages().catch(() => {});
                    rpLog('info', 'TIMING', '✅ 序章场景消息渲染完成');
                } else {
                    rpLog('warn', 'OPENING', '序章重新生成返回空');
                }

                // 第二步：渲染角色消息 + 异步并行生成全身/半身（含序章动作描写）
                if (openingStructured && openingStructured.characters?.length > 0) {
                    const appearingChars = openingStructured.characters;
                    rpLog('info', 'OPENING', `序章出场 ${appearingChars.length} 个角色`);

                    for (const charData of appearingChars) {
                        let fullContent = '';
                        if (charData.action) fullContent += `(${charData.action})`;
                        if (charData.dialogue) fullContent += charData.dialogue;
                        if (charData.thought) fullContent += `[${charData.thought}]`;
                        if (!fullContent) fullContent = charData.dialogue || '(无内容)';

                        const charMsgObj = {
                            id: 'msg_opening-' + charData.name,
                            role: 'char',
                            type: 'multi_char',
                            charName: charData.name,
                            charIndex: state.characters.findIndex(c => c.name === charData.name),
                            content: fullContent,
                            action: charData.action || '',
                            dialogue: charData.dialogue || '',
                            thought: charData.thought || ''
                        };
                        state.messages.push(charMsgObj);
                        renderMessage(charMsgObj);
                        rpLog('info', 'OPENING', `${charData.name} 角色消息已渲染`);
                    }
                    saveMessages().catch(() => {});
                    rpLog('info', 'TIMING', '✅ 所有角色消息已渲染');

                    const avatarTasks = [];

                    // 主角头像
                    rpLog('info', 'IMG', '后台重生成主角头像');
                    avatarTasks.push((async () => {
                        try {
                            const playerUrl = await App.generatePlayerAvatar();
                            rpLog('info', 'IMG', `主角头像生成完成: ${playerUrl ? 'yes' : 'no'}`);
                            App.updateAvatarInExistingMessages(state.player?.name || '玩家', playerUrl);
                        } catch (e) {
                            rpLog('warn', 'IMG', `主角头像生成失败: ${e.message}`);
                        }
                    })());

                    // 每个出场角色的全身/半身 — 用序章动作描写注入 prompt
                    for (const charInfo of appearingChars) {
                        const charName = charInfo.name;
                        const charObj = chars.find(c => c.name === charName);
                        if (!charObj) continue;

                        const actionText = charInfo.action ? charInfo.action.replace(/[（(].*?[）)]/g, '').trim() : '';
                        rpLog('info', 'IMG', `后台重生成 ${charName} 全身/半身（动作: ${actionText || '默认站立'}）`);
                        avatarTasks.push((async () => {
                            try {
                                addSystemMessage(`🎨 正在生成 ${charName} 的角色形象...`);
                                const result = await App.generateCharacterImage(charObj, actionText, true);
                                if (result) {
                                    rpLog('info', 'IMG', `${charName} 全身/半身重新生成成功`);
                                    addSystemMessage(`✅ ${charName} 角色形象重新生成完成`);
                                    App.updateAvatarInExistingMessages(charName, result);
                                } else {
                                    rpLog('warn', 'IMG', `${charName} 全身/半身重新生成失败`);
                                }
                            } catch (e) {
                                rpLog('error', 'IMG', `${charName} 全身/半身重新生成异常: ${e.message}`);
                            }
                        })());
                    }

                    const allCharNames = appearingChars.map(c => c.name);
                    const allCharObjs = allCharNames.map(name => chars.find(c => c.name === name)).filter(Boolean);
                    const metadata = { presentCharacters: allCharNames };

                    const sceneTask = Promise.allSettled(avatarTasks).then(() => {
                        const sceneRefUrls = allCharObjs.map(c => c.faceImageUrl || c.portraitImageUrl).filter(Boolean);
                        if (sceneRefUrls.length > 0) {
                            rpLog('info', 'SCENE', `所有头像就绪 (${allCharNames.join(', ')})，开始生成统一场景图`);
                            return App.generateSceneImage('opening', openingStructured.scene || openingRaw, allCharObjs[0], openingRaw, metadata);
                        } else {
                            rpLog('warn', 'SCENE', '头像全部生成失败，跳过场景图');
                        }
                    }).catch(e => {
                        rpLog('error', 'SCENE', `场景图生成异常: ${e.message}`);
                    });
                    avatarTasks.push(sceneTask);
                }
            } catch (imgErr) {
                rpLog('error', 'IMG', '生图阶段失败: ' + imgErr.message);
                addSystemMessage(`⚠️ 生图阶段失败: ${imgErr.message}`);
            }
        } else if (!state.apiKeys.chat) {
            // 没有生图 API Key，也重新生成序章
            try {
                const openingResult = await App.generateOpeningScene();
                if (openingResult) {
                    openingRaw = openingResult.rawText || '';
                    rpLog('info', 'OPENING', '序章重新生成完成（无生图）');
                }
            } catch (err) {
                rpLog('warn', 'OPENING', '序章重新生成失败: ' + err.message);
            }
        }

        // 兜底：如果 openingRaw 为空但 structured 有值（不应该发生，但保护一下），在这里渲染
        rpLog('info', 'TIMING', '=== 序章渲染检查 ===');
        if (!openingRaw && openingStructured && openingStructured.characters?.length > 0) {
            rpLog('info', 'INIT-REPLY', 'openingRaw 为空但 structured 有值，兜底渲染');
            let parsedMessages = App.structuredToMessages(openingStructured, 'msg_opening_');
            for (const msg of parsedMessages) {
                state.messages.push(msg);
                renderMessage(msg);
            }
            saveMessages().catch(() => {});
            rpLog('info', 'TIMING', '✅ 序章消息渲染完成（兜底）');
        } else if (!openingStructured || openingStructured.characters?.length === 0) {
            rpLog('error', 'INIT-REPLY', '❌ 序章结构化结果为空，无法渲染');
            addSystemMessage('⚠️ 序章生成失败，请重试');
        }
        // 如果 openingRaw 非空，上面已经渲染过了，不再重复

        // 渲染序章建议选项（此前未渲染，导致玩家在序章后看不到快捷回复按钮）
        App.renderOpeningReplyOptions(openingStructured, openingRaw);

        rpLog('info', 'REGEN', '角色重新生成完成，进入聊天阶段');
    } catch (err) {
        rpLog('error', 'REGEN', '角色重新生成失败: ' + (err.message || String(err)));
        addSystemMessage('❌ 角色重新生成失败: ' + (err.message || String(err)));
    } finally {
        state.story.phase = 'chat';
        await saveState();

        if (btn) btn.disabled = false;
    }
};
