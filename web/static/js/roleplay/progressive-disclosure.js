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

    const prompt = `根据以下对话内容，判断玩家是否已经"发现"了角色的以下信息：
${unrevealedFields.map(f => {
    const labels = {
        appearance: '外貌特征（穿着、发型、体型等）',
        personality: '性格特点（说话方式、行为倾向）',
        background: '背景故事（过往经历、家庭、职业等）',
        relationship: '与玩家的关系细节'
    };
    return `- ${f}: ${labels[f]}`;
}).join('\n')}

对话记录：
用户：${userMsg}
${charName}：${charResponse}

请判断哪些信息已通过对话自然展现给玩家，输出JSON格式：
{"appearance": false, "personality": true, "background": false, "relationship": true}
// true表示玩家已发现该信息，false表示还未发现

注意：只有在对话中明确体现或通过角色言行自然流露的信息才算发现。不要过度推断。`;

    try {
        const resp = await App.agnesChat([
            { role: 'system', content: '你是信息披露评估器。输出纯JSON。' },
            { role: 'user', content: prompt }
        ]);

        let changes;
        try {
            const jsonMatch = resp.match(/\{[\s\S]*\}/);
            changes = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
        } catch(e) {
            return;
        }

        if (!changes || typeof changes !== 'object') return;

        const newDiscoveries = [];
        for (const [field, revealed] of Object.entries(changes)) {
            if (revealed && !rev[field]) {
                state.revealed[charName][field] = true;
                const fieldLabels = {
                    appearance: '发现了「' + charName + '」的外貌细节',
                    personality: '了解了「' + charName + '」的性格特点',
                    background: '知道了「' + charName + '」的背景故事',
                    relationship: '明白了「' + charName + '」与你的关系'
                };
                newDiscoveries.push(fieldLabels[field] || `发现了关于「${charName}」的新信息`);
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
