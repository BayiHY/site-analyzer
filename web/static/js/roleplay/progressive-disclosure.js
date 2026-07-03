// === Section: 渐进式信息披露 ===
// 判断对话中是否自然展现了角色的外观/性格/背景/关系信息

App.toggleCharDetails = function(index) {
    const el = document.getElementById(`char-details-${index}`);
    if (el) {
        el.classList.toggle('open');
        if (el.classList.contains('open') && state.revealed) {
            const c = state.characters[index];
            if (state.revealed[c.name]) {
                state.revealed[c.name]._lastNew = [];
            }
        }
    }
}

App.updateRevealedInfo = async function(charName, userMsg, charResponse) {
    const c = state.characters.find(ch => ch.name === charName);
    if (!c || !c.faceImageUrl) return;

    const rev = state.revealed[charName] || {};
    const unrevealedFields = [];
    if (!rev.appearance) unrevealedFields.push('appearance');
    if (!rev.personality) unrevealedFields.push('personality');
    if (!rev.background) unrevealedFields.push('background');
    if (!rev.relationship) unrevealedFields.push('relationship');

    if (unrevealedFields.length === 0) return;

    const prompt = `根据以下对话内容，判断玩家是否已经"发现"了角色的以下信息。

严格标准：只有对话中明确提及或直接展示的信息才算发现。模糊暗示、比喻、推测都不算。

对话记录：
用户：${userMsg}
${charName}：${charResponse}

请逐项判断，输出JSON格式：
{"appearance": {"revealed": false, "reason": "对话中未提及外貌特征"}, "personality": {"revealed": false, "reason": "对话中未体现性格特点"}, "background": {"revealed": false, "reason": "对话中未提及过往经历或职业"}, "relationship": {"revealed": false, "reason": "对话中未提及与玩家的关系"}}

判定标准：
- appearance: 必须有具体的外貌描述（如"穿着黑色风衣"、"银色短发"），仅有"她看起来很冷"不算
- personality: 必须有明确的性格表现（如"她总是先考虑别人"、"说话刻薄"），仅有语气词不算
- background: 必须有明确的背景信息（如"我以前是军人"、"我在XX长大"），仅有暗示不算
- relationship: 必须有明确的关系描述（如"我们是敌人"、"你救过我"），仅有称呼不算

注意：宁可false也不要过度推断。如果对话中没有直接证据，全部返回false。`;

    try {
        const resp = await App.agnesChat([
            { role: 'system', content: '你是信息披露评估器。输出纯JSON。必须包含reason字段。' },
            { role: 'user', content: prompt }
        ]);

        let changes;
        try {
            const jsonMatch = resp.match(/\{[\s\S]*\}/);
            changes = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
        } catch(e) {
            rpLog('warn', 'INFO-DISCLOSE', `JSON 解析失败: ${e.message}`);
            return;
        }

        if (!changes || typeof changes !== 'object') return;

        const newDiscoveries = [];
        for (const [field, data] of Object.entries(changes)) {
            // 兼容两种格式：{"field": true} 或 {"field": {"revealed": true, "reason": "..."}}
            const revealed = (typeof data === 'object') ? data.revealed : data;
            const reason = (typeof data === 'object') ? data.reason || '' : '';

            if (revealed && !rev[field]) {
                // 二次验证：检查 reason 是否有实质内容
                if (reason && reason.length > 5) {
                    state.revealed[charName][field] = true;
                    const fieldLabels = {
                        appearance: '发现了「' + charName + '」的外貌细节',
                        personality: '了解了「' + charName + '」的性格特点',
                        background: '知道了「' + charName + '」的背景故事',
                        relationship: '明白了「' + charName + '」与你的关系'
                    };
                    newDiscoveries.push(fieldLabels[field] || `发现了关于「${charName}」的新信息`);
                    rpLog('info', 'INFO-DISCLOSE', `${field}=true, 依据: "${reason}"`);
                } else {
                    rpLog('warn', 'INFO-DISCLOSE-WARN', `${field} 被标记为 true，但 reason 为空或过短(${reason.length})，降级为 false`);
                    // 不标记为已发现
                }
            } else if (revealed && rev[field]) {
                rpLog('info', 'INFO-DISCLOSE', `${field} 已发现，跳过`);
            }
        }

        if (newDiscoveries.length > 0) {
            state.revealed[charName]._lastNew = newDiscoveries;
        }

        await saveState();
    } catch (e) {
        console.warn('信息披露评估失败:', e);
    }
}
