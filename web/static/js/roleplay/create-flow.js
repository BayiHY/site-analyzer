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
    const imageKey = document.getElementById('setup-image-key').value.trim();
    const storyPrompt = document.getElementById('story-prompt').value.trim();
    const playerGender = document.querySelector('input[name="player-gender"]:checked')?.value || '男';

    if (!chatKey) {
        alert('请先填写对话 API Key');
        return;
    }

    state.apiKeys.chat = chatKey;
    state.apiKeys.image = imageKey;
    localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));

    state.player = { gender: playerGender, faceImageUrl: '' };
    state.characters = [];
    state.activeCharIndex = 0;
    state.emotions = {};
    state.revealed = {};

    // 画面风格优先级：用户手动选择 > LLM 语义识别 > 默认 akira toriyama style
    // 灵感检测使用 LLM 语义识别，不做转译/映射
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
        imageStyle: userSelectedStyle || 'akira toriyama style'
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
    
    // 优先级链：用户手动选择 > 灵感检测（仅当 LLM 返回非默认值时） > 默认 akira toriyama style
    // 关键修复：LLM 返回 'akira toriyama style' 可能是 fallback 默认值，
    // 不是真正的灵感检测结果。只有当用户选择了其他风格时，才优先使用用户选择。
    let imageStyle;
    if (userSelectedStyle) {
        // 用户手动选择了风格 → 始终优先使用用户选择
        imageStyle = userSelectedStyle;
        rpLog('info', 'STYLE', `使用用户手动选择的画面风格: ${userSelectedStyle}`);
        // 如果 LLM 检测到了不同的风格，记录警告但不覆盖
        if (detectedStyle && detectedStyle !== userSelectedStyle && detectedStyle !== 'akira toriyama style') {
            rpLog('warn', 'STYLE', `LLM 检测到风格 "${detectedStyle}" 与用户选择 "${userSelectedStyle}" 不一致，以用户选择为准`);
        }
    } else if (detectedStyle && detectedStyle !== 'akira toriyama style') {
        // 没有用户选择，且 LLM 检测到了有意义的风格（不是默认 fallback）
        imageStyle = detectedStyle;
        rpLog('info', 'STYLE', `从灵感中检测到画面风格: ${detectedStyle}`);
    } else {
        imageStyle = 'akira toriyama style';
        rpLog('info', 'STYLE', `使用默认画面风格: akira toriyama style (用户未选择, LLM检测=${detectedStyle || 'null'})`);
    }
    state.story.imageStyle = imageStyle;

    try {
        rpLog('info', 'CREATE', `开始两阶段初始化，玩家性别: ${playerGender}`);
        await App.initializeStory(storyPrompt, playerGender);
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

        if (state.apiKeys.image && chars.length > 0) {
            rpLog('info', 'IMG', `开始生成 ${chars.length} 个角色头像 + 主角头像`);
            addSystemMessage('🎨 正在生成角色头像...');
            try {
                const imgTasks = chars.map(async (char, i) => {
                    if (!char || !char.name) { rpLog('warn', 'IMG', '角色 #' + i + ' 无效，跳过'); return null; }
                    rpLog('info', 'IMG', '生成 ' + char.name + ' 的头像');
                    const result = await App.generateCharacterFaceSilent(char);
                    return result;
                });

                // 主角头像
                const playerAvatarTask = App.generatePlayerAvatar().then(url => {
                    rpLog('info', 'IMG', '主角头像生成完成');
                    return url;
                }).catch(err => {
                    rpLog('warn', 'IMG', '主角头像生成失败: ' + err.message);
                    return null;
                });

                // 序章生成任务（基于角色数据生成）
                const openingTask = App.generateOpeningScene().then(scene => {
                    if (scene) {
                        state.story.openingScene = scene;
                        rpLog('info', 'OPENING', '序章生成完成，已存入 state.story.openingScene');
                    }
                    return scene;
                }).catch(err => {
                    rpLog('warn', 'OPENING', '序章生成失败: ' + err.message);
                    return '';
                });

                // 先完成角色头像
                await Promise.all(imgTasks);
                const playerOk = await playerAvatarTask;
                addSystemMessage(`✅ 角色头像生成完成 (${chars.length}/${chars.length} 角色 + ${playerOk ? '1' : '0'} 主角)`);
                rpLog('info', 'IMG', `角色头像生成完成: ${chars.length}/${chars.length} 角色, 主角:${playerOk}`);

                // 等待序章完成
                const openingScene = await openingTask;
                if (openingScene) {
                    rpLog('info', 'OPENING', '序章生成完成');
                }

                // 角色头像全部完成 + 序章完成 → 生成初始场景图
                if (state.story.openingScene) {
                    rpLog('info', 'SCENE', '角色头像全部完成 + 序章完成，开始生成初始场景图');
                    addSystemMessage('🖼️ 正在生成场景图...');
                    await App.generateInitialSceneImage(state.story.openingScene, state.story.openingScene);
                    rpLog('info', 'SCENE', '初始场景图生成完成');
                }
            } catch (imgErr) {
                rpLog('error', 'IMG', '头像/场景图生成失败: ' + imgErr.message);
                addSystemMessage(`⚠️ 头像/场景图生成失败: ${imgErr.message}`);
            }
        } else if (!state.apiKeys.image) {
            // 没有生图 API Key，也生成序章
            try {
                const openingScene = await App.generateOpeningScene();
                if (openingScene) {
                    state.story.openingScene = openingScene;
                    rpLog('info', 'OPENING', '序章生成完成（无生图），已存入 state.story.openingScene');
                }
            } catch (err) {
                rpLog('warn', 'OPENING', '序章生成失败: ' + err.message);
            }
        }

        const openingRaw = state.story.openingScene || '';
        let openingText = openingRaw;
        let openingReplies = [];
        const replyMatch = openingRaw.match(/<(.+)>$/);
        if (replyMatch) {
            openingText = openingRaw.slice(0, openingRaw.length - replyMatch[0].length).trim();
            openingReplies = replyMatch[1].split('┇').map(s => s.trim()).filter(Boolean);
        }
        
        const openingMsg = `【${openingText}】`;
        state.messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: openingMsg,
            timestamp: new Date().toISOString(),
            charIndex: 0,
            suggestedReplies: openingReplies
        });
        renderMessage(state.messages[state.messages.length - 1]);
        saveMessages().catch(() => {});

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
        const chars = await App.generateCharacters(targetCount, state.player?.gender, inspiration, '');
        addSystemMessage(`✅ 角色重新生成完成！共 ${chars.length} 个角色。`);
        rpLog('info', 'CHARS', `regenerateCharacters 返回 chars.length=${chars.length}, state.characters.length=${state.characters.length}`);

        if (state.apiKeys.image && chars.length > 0) {
            rpLog('info', 'IMG', `开始重新生成 ${chars.length} 个角色头像 + 主角头像`);
            addSystemMessage('🎨 正在重新生成角色头像...');
            try {
                rpLog('info', 'IMG', `构建 imgTasks: chars.length=${chars.length}, 角色列表: ${chars.map(c => c.name).join(', ')}`);
                const imgTasks = chars.map(async (char, i) => {
                    if (!char || !char.name) { rpLog('warn', 'IMG', '角色 #' + i + ' 无效，跳过'); return null; }
                    rpLog('info', 'IMG', '重新生成 ' + char.name + ' 的头像');
                    const result = await App.generateCharacterFaceSilent(char);
                    return result;
                });

                // 主角头像
                const playerAvatarTask = App.generatePlayerAvatar().then(url => {
                    rpLog('info', 'IMG', '主角头像重新生成完成');
                    return url;
                }).catch(err => {
                    rpLog('warn', 'IMG', '主角头像重新生成失败: ' + err.message);
                    return null;
                });

                // 序章生成任务（基于新角色数据重新生成）
                const openingTask = App.generateOpeningScene().then(scene => {
                    if (scene) {
                        state.story.openingScene = scene;
                        rpLog('info', 'OPENING', '序章重新生成完成，已存入 state.story.openingScene');
                    }
                    return scene;
                }).catch(err => {
                    rpLog('warn', 'OPENING', '序章重新生成失败: ' + err.message);
                    return '';
                });

                // 先完成角色头像
                await Promise.all(imgTasks);
                const playerOk = await playerAvatarTask;
                addSystemMessage(`✅ 角色头像重新生成完成 (${chars.length}/${chars.length} 角色 + ${playerOk ? '1' : '0'} 主角)`);
                rpLog('info', 'IMG', `角色头像重新生成完成: ${chars.length}/${chars.length} 角色, 主角:${playerOk}`);

                // 等待序章完成
                const openingScene = await openingTask;
                if (openingScene) {
                    rpLog('info', 'OPENING', '序章重新生成完成');
                }

                // 角色头像全部完成 + 序章完成 → 生成初始场景图
                if (state.story.openingScene) {
                    rpLog('info', 'SCENE', '角色头像全部完成 + 序章完成，开始重新生成初始场景图');
                    addSystemMessage('🖼️ 正在重新生成场景图...');
                    await App.generateInitialSceneImage(state.story.openingScene, state.story.openingScene);
                    rpLog('info', 'SCENE', '初始场景图重新生成完成');
                }
            } catch (imgErr) {
                rpLog('error', 'IMG', '头像生成失败: ' + imgErr.message);
                addSystemMessage(`头像生成失败: ${imgErr.message}`);
            }
        } else if (!state.apiKeys.image) {
            // 没有生图 API Key，也重新生成序章
            try {
                const openingScene = await App.generateOpeningScene();
                if (openingScene) {
                    state.story.openingScene = openingScene;
                    rpLog('info', 'OPENING', '序章重新生成完成（无生图），已存入 state.story.openingScene');
                }
            } catch (err) {
                rpLog('warn', 'OPENING', '序章重新生成失败: ' + err.message);
            }
        }

        const openingRaw = state.story.openingScene || '';
        let openingText = openingRaw;
        let openingReplies = [];
        const replyMatch = openingRaw.match(/<(.+)>$/);
        if (replyMatch) {
            openingText = openingRaw.slice(0, openingRaw.length - replyMatch[0].length).trim();
            openingReplies = replyMatch[1].split('┇').map(s => s.trim()).filter(Boolean);
        }
        
        const openingMsg = `【${openingText}】`;
        state.messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: openingMsg,
            timestamp: new Date().toISOString(),
            charIndex: 0,
            suggestedReplies: openingReplies
        });
        renderMessage(state.messages[state.messages.length - 1]);
        saveMessages().catch(() => {});

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
