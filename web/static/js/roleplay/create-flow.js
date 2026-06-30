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

    // 画面风格优先级：用户手动选择 > 灵感检测 > 默认 anime
    const setupSelect = document.getElementById('setup-art-style');
    const userSelectedStyle = setupSelect && setupSelect.value ? setupSelect.value : null;
    const detectedStyle = App.detectVisualStyleFromInspiration(storyPrompt);
    const imageStyle = userSelectedStyle || detectedStyle || 'anime';
    rpLog('info', 'STYLE', `[createCharacter] userSelectedStyle="${userSelectedStyle}", detectedStyle="${detectedStyle}", final imageStyle="${imageStyle}"`);
    if (detectedStyle && !userSelectedStyle) {
        rpLog('info', 'STYLE', `从灵感中检测到画面风格: ${detectedStyle}`);
    }
    if (userSelectedStyle) {
        rpLog('info', 'STYLE', `使用用户手动选择的画面风格: ${userSelectedStyle}`);
    }

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
        imageStyle: imageStyle
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
        const chars = await App.generateCharacters(3, state.player?.gender, state.story.userInspiration || '', '');
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

                // 先完成角色头像
                await Promise.all(imgTasks);
                const playerOk = await playerAvatarTask;
                addSystemMessage(`✅ 角色头像生成完成 (${chars.length}/${chars.length} 角色 + ${playerOk ? '1' : '0'} 主角)`);
                rpLog('info', 'IMG', `角色头像生成完成: ${chars.length}/${chars.length} 角色, 主角:${playerOk}`);

                // 角色头像全部完成后，再生成初始场景图
                if (state.story.openingScene) {
                    rpLog('info', 'SCENE', '角色头像全部完成，开始生成初始场景图');
                    addSystemMessage('🖼️ 正在生成场景图...');
                    await App.generateInitialSceneImage(state.story.openingScene);
                    rpLog('info', 'SCENE', '初始场景图生成完成');
                }
            } catch (imgErr) {
                rpLog('error', 'IMG', '头像/场景图生成失败: ' + imgErr.message);
                addSystemMessage(`⚠️ 头像/场景图生成失败: ${imgErr.message}`);
            }
        }

        const openingRaw = state.story.openingScene || '';
        let openingText = openingRaw;
        let openingReplies = [];
        const replyMatch = openingRaw.match(/<(.+)>$/);
        if (replyMatch) {
            openingText = openingRaw.slice(0, openingRaw.length - replyMatch[0].length).trim();
            openingReplies = replyMatch[1].split('|').map(s => s.trim()).filter(Boolean);
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

    try {
        const chars = await App.generateCharacters(3, state.player?.gender, state.story.userInspiration || '', '');
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

                // 先完成角色头像
                await Promise.all(imgTasks);
                const playerOk = await playerAvatarTask;
                addSystemMessage(`✅ 角色头像重新生成完成 (${chars.length}/${chars.length} 角色 + ${playerOk ? '1' : '0'} 主角)`);
                rpLog('info', 'IMG', `角色头像重新生成完成: ${chars.length}/${chars.length} 角色, 主角:${playerOk}`);

                // 角色头像全部完成后，再生成初始场景图
                if (state.story.openingScene) {
                    rpLog('info', 'SCENE', '角色头像全部完成，开始重新生成初始场景图');
                    addSystemMessage('🖼️ 正在重新生成场景图...');
                    await App.generateInitialSceneImage(state.story.openingScene);
                    rpLog('info', 'SCENE', '初始场景图重新生成完成');
                }
            } catch (imgErr) {
                rpLog('error', 'IMG', '头像生成失败: ' + imgErr.message);
                addSystemMessage(`头像生成失败: ${imgErr.message}`);
            }
        }

        const openingRaw = state.story.openingScene || '';
        let openingText = openingRaw;
        let openingReplies = [];
        const replyMatch = openingRaw.match(/<(.+)>$/);
        if (replyMatch) {
            openingText = openingRaw.slice(0, openingRaw.length - replyMatch[0].length).trim();
            openingReplies = replyMatch[1].split('|').map(s => s.trim()).filter(Boolean);
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
