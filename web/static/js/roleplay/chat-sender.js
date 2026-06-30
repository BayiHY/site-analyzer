// === Section: 消息发送主流程 ===
// 构建对话历史 → 调用 LLM → 渲染回复 → 触发后处理
// 新格式: {场景}角色1:(动作)语言[内心想法]|角色2:(动作)语言[内心想法]<主角回应1|主角回应2|主角回应3>

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

【画面风格】${state.story?.imageStyle || 'anime'}。场景描写、环境氛围、角色动作都要符合这一视觉风格。

当前情感指标（隐性，不向玩家展示）：${emotionDesc || '无'}
- 好感度高时表现热情主动，低时表现疏离或试探

【回复格式要求】
请严格按以下格式回复（每个符号都不能省略）：

{场景描述}角色1:(动作)对话内容[内心想法]|角色2:(动作)对话内容[内心想法]<建议回复1|建议回复2|建议回复3>

格式说明：
1. {场景} — 花括号内的当前环境/场景描写（1-2句话），单独解析为一条消息
2. 角色对话 — 多个角色用 | 分隔，每个角色格式为：角色名:(动作)对话内容[内心想法]
   - 如果只有一个角色参与对话，可以省略角色名前缀，直接写 (动作)对话内容[内心想法]
   - 多个角色同时交流互动时，各自分别解析为独立的消息
3. (动作) — 圆括号内的角色动作描写
4. 对话内容 — 角色的说话内容（直接写，不用引号）
5. [内心想法] — 方括号内的内心独白，渲染为"内心想法"文字按钮，点击后才显示内容
6. <建议回复1|建议回复2|建议回复3> — 尖括号内**必须**用英文竖线 | 分隔3条建议回复。**严禁**使用顿号（、）、逗号（，）、>。< 或其他任何符号作为分隔符。每条都是主角（玩家）可以对当前情境做出的**语言回应或动作表现**（如「你是谁？」、「后退一步，保持警惕」、「默默观察他的表情」），而不是决策选项（如「选择逃跑」或「决定调查」）。每条不超过20字。

【建议回复分隔符强制规则】尖括号 <> 内的建议回复分隔符只能是英文竖线 |。正确示例：<「你是谁？」|「后退一步」|「默默观察」>。错误示例：<「你是谁？」、 「后退一步」> 或 <「你是谁？」>。<「后退一步」>。如果你不确定，就用 | 分隔。

示例：
{昏暗的地下室里}林悦:(微笑着递过一杯茶)你终于来了，我等你很久了[其实我早就知道你会来]|张浩:(靠在墙边抱臂沉默)(眼神复杂地打量着你)<「你是谁？」|「后退一步，保持警惕」|「默默观察他的表情」>

注意：
- 如果场景发生变化，{场景} 要体现新场景
- 对话内容要符合角色性格和当前情境
- 建议回复是主角的语言或动作表现，推动剧情发展，每条不超过15字
- 内心想法默认以"内心想法"按钮呈现，点击才显示
- 多个角色同时互动时，用 | 分隔各角色对话段`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history
        ];

        const response = await App.agnesChat(messages);

        hideTyping();

        // 解析新格式，可能产生多条消息（多角色对话时）
        const parsedMessages = App.parseMultiCharReply(response, state.activeCharIndex);

        for (const msg of parsedMessages) {
            state.messages.push(msg);
            renderMessage(msg);
        }
        await saveMessages();

        // ===== 后处理 1: 场景图生成 → 见 scene-images.js =====
        try {
            const sceneDesc = App.parseSceneFromReply(response);
            if (sceneDesc && App.isSceneChanged(activeChar.name, sceneDesc)) {
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

// === 解析新格式的多角色回复 ===
// 格式: {场景}角色1:(动作)语言[内心想法]|角色2:(动作)语言[内心想法]<建议回复1|建议回复2|建议回复3>
App.parseMultiCharReply = function(rawText, defaultCharIndex) {
    const messages = [];
    let text = rawText.trim();

    // 提取场景（如果有）
    let sceneText = null;
    const sceneMatch = text.match(/^\{([^}]+)\}/);
    if (sceneMatch) {
        sceneText = sceneMatch[1].trim();
        text = text.slice(sceneMatch[0].length);
    }

    // 提取建议回复（最右边的 <...>）
    // 使用非贪婪匹配，避免 LLM 回复中包含 < 符号时匹配到错误位置
    let suggestedReplies = [];
    const replyMatch = text.match(/<(.*?)>$/);
    if (replyMatch) {
        rpLog('INFO', 'PARSE-REPLY', `原始文本含 <> 标签: "${replyMatch[0]}"`);
        rpLog('INFO', 'PARSE-REPLY', `尖括号内内容: "${replyMatch[1]}"`);
        // 优先用 | 分隔；如果数量不足 3 条，尝试兜底分隔符
        suggestedReplies = replyMatch[1].split('|').map(s => {
            let t = s.trim();
            // 清理首尾多余的引号/引号+尖括号残留
            t = t.replace(/^["「」]/, '').replace(/["」]$/, '');
            return t;
        }).filter(Boolean);
        if (suggestedReplies.length < 2) {
            // 兜底：尝试 >。< 分隔符（LLM 常误用）
            const fallback1 = replyMatch[1].split('>。<').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
            if (fallback1.length >= 2) {
                suggestedReplies = fallback1;
                rpLog('INFO', 'PARSE-REPLY', `| 分隔失败，使用 >。< 兜底解析出 ${suggestedReplies.length} 条`);
            } else {
                // 兜底：尝试顿号分隔
                const fallback2 = replyMatch[1].split('、').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
                if (fallback2.length >= 2) {
                    suggestedReplies = fallback2;
                    rpLog('INFO', 'PARSE-REPLY', `| 分隔失败，使用顿号兜底解析出 ${suggestedReplies.length} 条`);
                } else {
                    rpLog('WARN', 'PARSE-REPLY', `仅解析出 ${suggestedReplies.length} 条，无法兜底分割`);
                }
            }
        }
        rpLog('INFO', 'PARSE-REPLY', `解析出 ${suggestedReplies.length} 条建议回复: ${JSON.stringify(suggestedReplies)}`);
        text = text.slice(0, text.length - replyMatch[0].length).trim();
    } else {
        rpLog('INFO', 'PARSE-REPLY', '原始文本中未发现 <> 标签，无建议回复');
    }

    // 提取场景消息
    if (sceneText) {
        messages.push({
            id: 'msg_scene_' + Date.now(),
            role: 'char',
            type: 'text',
            content: sceneText,
            charIndex: defaultCharIndex,
            isScene: true,
            timestamp: new Date().toISOString()
        });
    }

    // 按 | 分割多角色对话
    // 但要注意：建议回复已经被提取了，剩余的 | 是角色分隔符
    const charParts = text.split('|').filter(s => s.trim());

    for (const part of charParts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // 解析单个角色消息格式: 角色名:(动作)语言[内心想法]
        // 或者: (动作)语言[内心想法]（无角色名，沿用当前角色）
        let charName = null;
        let content = trimmed;

        // 检查是否有 "角色名:" 前缀
        const prefixMatch = trimmed.match(/^([^:：]+)[:：]\s*(.+)/);
        if (prefixMatch) {
            charName = prefixMatch[1].trim();
            content = prefixMatch[2].trim();
        }

        // 解析 (动作)语言[内心想法]
        const actionMatch = content.match(/^\(([^)]+)\)(.*)/);
        const action = actionMatch ? actionMatch[1].trim() : '';
        const rest = actionMatch ? actionMatch[2].trim() : content;

        const speakMatch = rest.match(/^([^\[]*)\[([^\]]*)\]$/);
        const dialogue = speakMatch ? speakMatch[1].trim() : rest.replace(/\[.*\]$/, '').trim();
        const thought = speakMatch ? (speakMatch[2] || '') : '';

        // 构建格式化内容字符串
        let formattedContent = '';
        if (action) formattedContent += '(' + action + ')';
        if (dialogue) formattedContent += dialogue;
        if (thought) formattedContent += '[' + thought + ']';
        if (!formattedContent) formattedContent = content;

        // 查找对应的角色索引
        let charIdx = defaultCharIndex;
        if (charName) {
            const found = state.characters.findIndex(c => c.name === charName);
            if (found >= 0) charIdx = found;
        }

        messages.push({
            id: 'msg_char_' + Date.now() + '_' + charIdx,
            role: 'char',
            type: 'multi_char',
            content: formattedContent,
            charIndex: charIdx,
            charName: charName || state.characters[charIdx]?.name || '',
            action: action,
            dialogue: dialogue,
            thought: thought,
            suggestedReplies: suggestedReplies,
            timestamp: new Date().toISOString()
        });
        rpLog('INFO', 'PARSE-CHAR', `角色消息 #${messages.length} (charIdx=${charIdx}): 建议回复=${JSON.stringify(suggestedReplies)}, 动作="${action}", 对话="${dialogue}", 想法="${thought}"`);
    }

    // 如果没有解析出任何角色消息，fallback 为单条普通消息
    if (messages.length === 0) {
        messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: text,
            charIndex: defaultCharIndex,
            timestamp: new Date().toISOString()
        });
    }

    return messages;
};
