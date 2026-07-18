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
        alert('请先填写对话 API Key');
        return;
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
        // LLM 从灵感中识别到了风格，直接使用
        imageStyle = detectedStyle;
        rpLog('info', 'STYLE', `从灵感中检测到画面风格: ${detectedStyle}`);
        if (userSelectedStyle && userSelectedStyle !== detectedStyle) {
            rpLog('info', 'STYLE', `用户手动选择 "${userSelectedStyle}" 被灵感检测结果 "${detectedStyle}" 覆盖（灵感优先）`);
        }
    } else {
        // LLM 未能识别（灵感为空或无法判断） → 使用用户选择或默认随机
        imageStyle = userSelectedStyle || '';
        if (!imageStyle) {
            rpLog('info', 'STYLE', `灵感未检测到风格且用户未选择，使用随机`);
        } else {
            rpLog('info', 'STYLE', `灵感未检测到风格，使用用户选择: ${imageStyle}`);
        }
    }
    state.story.imageStyle = imageStyle;

    try {
        rpLog('info', 'CREATE', `开始两阶段初始化，玩家: ${playerName} (${playerGender})`);
        await App.initializeStory(storyPrompt, playerGender, playerName);
        rpLog('info', 'CREATE', '初始化完成，进入聊天阶段');
    } catch (err) {
        rpLog('error', 'CREATE', '初始化失败: ' + (err.message || String(err)));
        addSystemMessage('❌ 初始化失败: ' + (err.message || String(err)));
    } finally {
        document.getElementById('send-btn').disabled = false;
    }
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
            rpLog('info', 'IMG', `━━━ 开始生图阶段（按出场顺序）: ${chars.length} 个角色 + 主角 ━━━`);
            rpLog('info', 'IMG', `  生图 API Key 已配置`);
            rpLog('info', 'IMG', `  角色列表: ${chars.map(c => `${c.name}(faceImgUrl=${!!c.faceImageUrl}, portraitImgUrl=${!!c.portraitImageUrl})`).join(', ')}`);

            try {
                // 第一步：生成序章（不生成头像，头像等出场后再生成）
                rpLog('info', 'OPENING', '开始生成序章（头像延迟到出场时生成）');
                addSystemMessage('✍️ 正在生成序章...');
                
                const openingResult = await App.generateOpeningScene();
                openingRaw = openingResult?.rawText || '';
                openingStructured = openingResult?.structured || null;

                if (openingRaw) {
                    rpLog('info', 'OPENING', '序章生成完成，立即渲染序章场景消息（不渲染角色消息）');
                    
                    // 只渲染场景消息，不渲染角色消息（角色头像生成后再渲染）
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

                // 第二步：先渲染所有角色消息（用首字母占位头像），然后异步并行生成头像

                // 2a. 立即渲染所有角色消息（不等待头像）
                if (openingStructured && openingStructured.characters?.length > 0) {
                    const appearingChars = openingStructured.characters;
                    rpLog('info', 'OPENING', `序章出场 ${appearingChars.length} 个角色，立即渲染消息（头像异步生成）`);

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
                        rpLog('info', 'OPENING', `${charData.name} 角色消息已渲染（头像待生成）`);
                    }
                    saveMessages().catch(() => {});
                    rpLog('info', 'TIMING', '✅ 所有角色消息已渲染');
                }

                // 2b. 异步并行生成主角头像 + 所有出场角色头像（不阻塞对话）
                if (openingStructured && openingStructured.characters?.length > 0) {
                    const appearingChars = openingStructured.characters;
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

                    // 每个出场角色的头像
                    for (const charInfo of appearingChars) {
                        const charName = charInfo.name;
                        const charObj = chars.find(c => c.name === charName);
                        if (!charObj) continue;

                        rpLog('info', 'IMG', `后台生成 ${charName} 头像`);
                        avatarTasks.push((async () => {
                            try {
                                addSystemMessage(`🎨 正在生成 ${charName} 的头像...`);
                                const result = await App.generateCharacterFaceSilent(charObj);
                                if (result) {
                                    rpLog('info', 'IMG', `${charName} 头像生成成功`);
                                    addSystemMessage(`✅ ${charName} 头像生成完成`);
                                    App.updateAvatarInExistingMessages(charName, result);
                                } else {
                                    rpLog('warn', 'IMG', `${charName} 头像生成失败`);
                                }
                            } catch (e) {
                                rpLog('error', 'IMG', `${charName} 头像生成异常: ${e.message}`);
                            }
                        })());
                    }

                    // 场景图也异步生成
                    for (const charInfo of appearingChars) {
                        const charName = charInfo.name;
                        const charObj = chars.find(c => c.name === charName);
                        if (!charObj) continue;

                        rpLog('info', 'SCENE', `后台为 ${charName} 生成场景图`);
                        avatarTasks.push((async () => {
                            try {
                                const sceneForImage = openingStructured.scene || openingRaw;
                                const metadata = openingStructured ? {
                                    presentCharacters: [charName]
                                } : null;
                                App.generateSceneImage(charName, sceneForImage, charObj, openingRaw, metadata).catch(e => {
                                    rpLog('error', 'SCENE', `${charName} 场景图生成失败: ${e.message}`);
                                });
                            } catch (e) {
                                rpLog('error', 'SCENE', `${charName} 场景图生成失败: ${e.message}`);
                            }
                        })());
                    }

                    Promise.allSettled(avatarTasks).then(() => {
                        rpLog('info', 'IMG', '所有头像/场景图生成完成');
                    });
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
            rpLog('info', 'IMG', `━━━ 开始重新生图阶段（按出场顺序）: ${chars.length} 个角色 + 主角 ━━━`);
            rpLog('info', 'IMG', `  生图 API Key 已配置`);
            rpLog('info', 'IMG', `  角色列表: ${chars.map(c => `${c.name}(faceImgUrl=${!!c.faceImageUrl}, portraitImgUrl=${!!c.portraitImageUrl})`).join(', ')}`);

            try {
                // 第一步：生成序章（不生成头像，头像等出场后再生成）
                rpLog('info', 'OPENING', '开始生成序章（头像延迟到出场时生成）');
                addSystemMessage('✍️ 正在生成序章...');
                
                const openingResult = await App.generateOpeningScene();
                openingRaw = openingResult?.rawText || '';
                openingStructured = openingResult?.structured || null;

                if (openingRaw) {
                    rpLog('info', 'OPENING', '序章重新生成完成，立即渲染序章场景消息（不渲染角色消息）');
                    
                    // 只渲染场景消息，不渲染角色消息（角色头像生成后再渲染）
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

                // 第二步：先渲染所有角色消息（用首字母占位头像），然后异步并行生成头像

                // 2a. 立即渲染所有角色消息（不等待头像）
                if (openingStructured && openingStructured.characters?.length > 0) {
                    const appearingChars = openingStructured.characters;
                    rpLog('info', 'OPENING', `序章出场 ${appearingChars.length} 个角色，立即渲染消息（头像异步生成）`);

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
                        rpLog('info', 'OPENING', `${charData.name} 角色消息已渲染（头像待生成）`);
                    }
                    saveMessages().catch(() => {});
                    rpLog('info', 'TIMING', '✅ 所有角色消息已渲染');
                }

                // 2b. 异步并行生成主角头像 + 所有出场角色头像（不阻塞对话）
                if (openingStructured && openingStructured.characters?.length > 0) {
                    const appearingChars = openingStructured.characters;
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

                    // 每个出场角色的头像
                    for (const charInfo of appearingChars) {
                        const charName = charInfo.name;
                        const charObj = chars.find(c => c.name === charName);
                        if (!charObj) continue;

                        rpLog('info', 'IMG', `后台生成 ${charName} 头像`);
                        avatarTasks.push((async () => {
                            try {
                                addSystemMessage(`🎨 正在生成 ${charName} 的头像...`);
                                const result = await App.generateCharacterFaceSilent(charObj);
                                if (result) {
                                    rpLog('info', 'IMG', `${charName} 头像重新生成成功`);
                                    addSystemMessage(`✅ ${charName} 头像重新生成完成`);
                                    App.updateAvatarInExistingMessages(charName, result);
                                } else {
                                    rpLog('warn', 'IMG', `${charName} 头像重新生成失败`);
                                }
                            } catch (e) {
                                rpLog('error', 'IMG', `${charName} 头像重新生成异常: ${e.message}`);
                            }
                        })());
                    }

                    // 场景图也异步生成
                    for (const charInfo of appearingChars) {
                        const charName = charInfo.name;
                        const charObj = chars.find(c => c.name === charName);
                        if (!charObj) continue;

                        rpLog('info', 'SCENE', `后台为 ${charName} 生成场景图`);
                        avatarTasks.push((async () => {
                            try {
                                const sceneForImage = openingStructured.scene || openingRaw;
                                const metadata = openingStructured ? {
                                    presentCharacters: [charName]
                                } : null;
                                App.generateSceneImage(charName, sceneForImage, charObj, openingRaw, metadata).catch(e => {
                                    rpLog('error', 'SCENE', `${charName} 场景图重新生成失败: ${e.message}`);
                                });
                            } catch (e) {
                                rpLog('error', 'SCENE', `${charName} 场景图重新生成失败: ${e.message}`);
                            }
                        })());
                    }

                    Promise.allSettled(avatarTasks).then(() => {
                        rpLog('info', 'IMG', '所有头像/场景图生成完成');
                    });
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
