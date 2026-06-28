// === Section: 消息发送主流程 ===
// 构建对话历史 → 调用 LLM → 渲染回复 → 触发后处理

App.sendMessage = async function() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    const activeChar = state.characters[state.activeCharIndex];

    // 用户消息
    state.messages.push({
        id: 'msg_' + Date.now(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: new Date().toISOString()
    });
    renderMessage(state.messages[state.messages.length - 1]);
    await saveMessages();

    // 显示加载
    document.getElementById('send-btn').disabled = true;
    showTyping();

    try {
        // 构建对话历史
        const history = state.messages
            .filter(m => m.role !== 'system')
            .slice(-20)
            .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

        const emotions = state.emotions[activeChar.name] || {};
        const emotionDesc = Object.entries(emotions).map(([k, v]) => {
            const val = v.current ?? 0;
            const label = val >= 60 ? '非常积极' : val >= 30 ? '中性偏积极' : '冷淡/警惕';
            return `${k}(${val}/100, ${label})`;
        }).join('、');

        const systemPrompt = `你是${activeChar.name}，${activeChar.gender ? activeChar.gender + '性' : ''}${activeChar.age ? '，' + activeChar.age + '岁' : ''}。
请使用中文回复。
性别：${activeChar.gender || '未指定'}
外貌：${activeChar.appearance || '未指定'}
性格：${activeChar.personality || '温柔'}
背景：${activeChar.background || ''}
与用户关系：${activeChar.relationship || '普通认识'}

当前对其他角色的情感指标（隐性，不向玩家展示）：${emotionDesc || '无'}
- 这些情感指标会影响你对用户的反应方式和语气，但不要直接展示数值
- 好感度高时表现热情主动，低时表现疏离或试探

回复格式严格遵循：{场景}(动作)语言[内心想法]
- {场景}：当前环境描述，放在花括号中
- (动作)：角色正在做的动作，放在圆括号中
- 语言：角色说的话
- [内心想法]：角色的内心活动，放在方括号中

示例：{咖啡馆里}(轻轻搅动咖啡)今天天气真好呢[希望他能多坐一会儿]

请保持角色一致性，不要跳出角色。`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history
        ];

        const response = await App.agnesChat(messages);

        hideTyping();

        state.messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: response,
            charIndex: state.activeCharIndex,
            timestamp: new Date().toISOString()
        });
        renderMessage(state.messages[state.messages.length - 1]);
        await saveMessages();

        // ===== 后处理 1: 场景图生成 → 见 scene-images.js =====
        try {
            const sceneDesc = App.parseSceneFromReply(response);
            if (sceneDesc && App.isSceneChanged(activeChar.name, sceneDesc)) {
                App.addSceneGenStatus();
                await App.generateSceneImage(activeChar.name, sceneDesc, activeChar);
            }
        } catch (e) {
            console.warn('场景图生成失败:', e);
        }

        // ===== 后处理 2: 情感指标更新 → 见 emotion-update.js =====
        try {
            await App.updateEmotions(activeChar.name, text, response);
        } catch (e) {
            console.warn('情感更新失败:', e);
        }

        // ===== 后处理 3: 信息披露评估 → 见 progressive-disclosure.js =====
        try {
            await App.updateRevealedInfo(activeChar.name, text, response);
            if (state.currentPanel === 'characters') {
                document.getElementById('panel-body').innerHTML = renderCharactersPanel();
            }
        } catch (e) {
            console.warn('信息披露评估失败:', e);
        }

        // ===== 后处理 4: 动态属性更新 → 见 dynamic-attrs.js =====
        try {
            await App.updateDynamicAttributes(activeChar.name, text, response);
        } catch (e) {
            console.warn('动态属性更新失败:', e);
        }

    } catch (err) {
        hideTyping();
        addSystemMessage(`回复失败: ${err.message || '未知错误'}`);
    }

    document.getElementById('send-btn').disabled = false;
}
