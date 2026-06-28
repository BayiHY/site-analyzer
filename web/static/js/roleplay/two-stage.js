// === Section: 两阶段流程编排 ===
// 初始化故事（世界观→角色→头像→开场）

App.initializeStory = async function(userInspiration) {
    rpLog('info', 'INIT', '开始两阶段故事生成流程');

    addSystemMessage('正在构思故事世界...');
    try {
        await App.generateWorldview(userInspiration);
        addSystemMessage('✅ 世界观已生成！现在可以生成角色了。');
        rpLog('info', 'INIT', '第一阶段完成');
    } catch (err) {
        rpLog('error', 'INIT', '世界观生成失败: ' + (err.message || String(err)));
        throw err;
    }

    addSystemMessage('正在生成角色...');
    try {
        const chars = await App.generateCharacters(3);
        addSystemMessage(`✅ 角色生成完成！共 ${chars.length} 个角色。`);
        rpLog('info', 'INIT', '第二阶段完成');
    } catch (err) {
        rpLog('error', 'INIT', '角色生成失败: ' + (err.message || String(err)));
        throw err;
    }

    // 生成角色头像（并行）
    if (state.apiKeys.image && state.characters.length > 0) {
        rpLog('info', 'IMG', `开始并行生成 ${state.characters.length} 个角色头像`);
        addSystemMessage('正在生成角色头像...');
        try {
            const imgTasks = state.characters.map(async (char, i) => {
                if (!char || !char.name) { rpLog('warn', 'IMG', '角色 #' + i + ' 无效，跳过'); return null; }
                const prompt = char.imagePrompt || '';
                if (!prompt) { rpLog('warn', 'IMG', '角色 ' + char.name + ' 缺少 imagePrompt，跳过'); return null; }
                rpLog('info', 'IMG', '生成 ' + char.name + ' 的头像 (prompt: ' + prompt.slice(0, 50) + '...)');
                const result = await App.generateCharacterFaceSilent(char, prompt);
                return result;
            });
            const results = await Promise.all(imgTasks);
            const successCount = results.filter(r => r !== null).length;
            addSystemMessage(`角色头像生成完成 (${successCount}/${state.characters.length})`);
            rpLog('info', 'IMG', `头像生成完成: ${successCount}/${state.characters.length}`);
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

    rpLog('info', 'INIT', '初始化完成，进入聊天阶段');
    updateGenerationControls();
}
