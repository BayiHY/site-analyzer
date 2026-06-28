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

    if (!chatKey) {
        alert('请先填写对话 API Key');
        return;
    }

    state.apiKeys.chat = chatKey;
    state.apiKeys.image = imageKey;
    localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));

    state.characters = [];
    state.activeCharIndex = 0;
    state.emotions = {};
    state.revealed = {};

    state.story = {
        title: '',
        worldview: '',
        mainArc: [],
        openingScene: '',
        toneKeywords: [],
        worldviewNotes: '',
        factors: null,
        phase: 'idle'
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
        rpLog('info', 'CREATE', '开始两阶段初始化');
        await App.initializeStory(storyPrompt);
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
        const chars = await App.generateCharacters(3);
        addSystemMessage(`✅ 角色生成完成！共 ${chars.length} 个角色。`);

        if (state.apiKeys.image && chars.length > 0) {
            rpLog('info', 'IMG', `开始并行生成 ${chars.length} 个角色头像`);
            addSystemMessage('正在生成角色头像...');
            try {
                const imgTasks = chars.map(async (char, i) => {
                    if (!char || !char.name) { rpLog('warn', 'IMG', '角色 #' + i + ' 无效，跳过'); return null; }
                    const prompt = char.imagePrompt || '';
                    if (!prompt) { rpLog('warn', 'IMG', '角色 ' + char.name + ' 缺少 imagePrompt，跳过'); return null; }
                    rpLog('info', 'IMG', '生成 ' + char.name + ' 的头像');
                    const result = await App.generateCharacterFaceSilent(char, prompt);
                    return result;
                });
                const results = await Promise.all(imgTasks);
                const successCount = results.filter(r => r !== null).length;
                addSystemMessage(`角色头像生成完成 (${successCount}/${chars.length})`);
                rpLog('info', 'IMG', `头像生成完成: ${successCount}/${chars.length}`);
            } catch (imgErr) {
                rpLog('error', 'IMG', '头像生成失败: ' + imgErr.message);
                addSystemMessage(`头像生成失败: ${imgErr.message}`);
            }
        }

        const openingMsg = `【${state.story.openingScene}】`;
        state.messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: openingMsg,
            timestamp: new Date().toISOString(),
            charIndex: 0
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
        const chars = await App.generateCharacters(3);
        addSystemMessage(`✅ 角色重新生成完成！共 ${chars.length} 个角色。`);

        if (state.apiKeys.image && chars.length > 0) {
            rpLog('info', 'IMG', `开始并行重新生成 ${chars.length} 个角色头像`);
            addSystemMessage('正在重新生成角色头像...');
            try {
                const imgTasks = chars.map(async (char, i) => {
                    if (!char || !char.name) { rpLog('warn', 'IMG', '角色 #' + i + ' 无效，跳过'); return null; }
                    const prompt = char.imagePrompt || '';
                    if (!prompt) { rpLog('warn', 'IMG', '角色 ' + char.name + ' 缺少 imagePrompt，跳过'); return null; }
                    rpLog('info', 'IMG', '重新生成 ' + char.name + ' 的头像');
                    const result = await App.generateCharacterFaceSilent(char, prompt);
                    return result;
                });
                const results = await Promise.all(imgTasks);
                const successCount = results.filter(r => r !== null).length;
                addSystemMessage(`角色头像重新生成完成 (${successCount}/${chars.length})`);
                rpLog('info', 'IMG', `头像重新生成完成: ${successCount}/${chars.length}`);
            } catch (imgErr) {
                rpLog('error', 'IMG', '头像生成失败: ' + imgErr.message);
                addSystemMessage(`头像生成失败: ${imgErr.message}`);
            }
        }

        const openingMsg = `【${state.story.openingScene}】`;
        state.messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: openingMsg,
            timestamp: new Date().toISOString(),
            charIndex: 0
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
