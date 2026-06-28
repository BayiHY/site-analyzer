// === Section: 动态属性更新（印象/秘密/当前情绪） ===
// === Section: 渐进式信息披露更新 ===
// === Section: 角色卡片交互 ===
    // ===== 角色卡片交互 =====
    App.toggleCharDetails = function(index) {
        const el = document.getElementById(`char-details-${index}`);
        if (el) {
            el.classList.toggle('open');
            // 清除新发现通知
            if (el.classList.contains('open') && state.revealed) {
                const c = state.characters[index];
                if (state.revealed[c.name]) {
                    state.revealed[c.name]._lastNew = [];
                }
            }
        }
    }

    // ===== 渐进式信息披露更新 =====
    App.updateRevealedInfo = async function(charName, userMsg, charResponse) {
        const c = state.characters.find(ch => ch.name === charName);
        if (!c || !c.faceImageUrl) return; // 有头像才说明初始化完成

        const rev = state.revealed[charName] || {};
        const unrevealedFields = [];
        if (!rev.appearance) unrevealedFields.push('appearance');
        if (!rev.personality) unrevealedFields.push('personality');
        if (!rev.background) unrevealedFields.push('background');
        if (!rev.relationship) unrevealedFields.push('relationship');

        if (unrevealedFields.length === 0) return; // 全部已揭示

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

            // 保存新发现通知
            if (newDiscoveries.length > 0) {
                state.revealed[charName]._lastNew = newDiscoveries;
            }

            await saveState();
        } catch (e) {
            console.warn('信息披露评估失败:', e);
        }
    }

    // ===== 动态属性更新（印象/秘密/当前情绪） =====
    App.updateDynamicAttributes = async function(charName, userMsg, charResponse) {
        const c = state.characters.find(ch => ch.name === charName);
        if (!c) return;

        const prompt = `根据对话内容，更新「${charName}」的动态属性。

当前对话：
用户说：${userMsg}
${charName}回复：${charResponse}

当前属性状态：
- 玩家印象(perception)：${c.perception || '尚未形成'}
- 秘密(secret)：${c.secret || '未发现'}
- 当前情绪(currentMood)：${c.currentMood || '未知'}

请评估：
1. perception：玩家对${charName}的当前印象（一句话描述，如"温柔体贴"→"她似乎有心事"→"她比想象中坚强"）
2. secret：是否有新线索暗示${charName}有隐藏的秘密（仅在对话中出现新线索时才更新，否则保持原值或"未发现"）
3. currentMood：${charName}当前的心情状态（如"平静"→"有些紧张"→"心情不错"）

输出JSON格式：
{"perception":"","secret":"","currentMood":""}
// 如果某属性没有变化，返回空字符串""表示保持原值`;

        try {
            const resp = await App.agnesChat([
                { role: 'system', content: '你是角色动态属性评估器。输出纯JSON。' },
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

            // 只更新非空值
            if (changes.perception && changes.perception !== '') {
                c.perception = changes.perception;
            }
            if (changes.secret && changes.secret !== '') {
                c.secret = changes.secret;
            }
            if (changes.currentMood && changes.currentMood !== '') {
                c.currentMood = changes.currentMood;
            }

            await saveState();
        } catch (e) {
            console.warn('动态属性更新失败:', e);
        }
    }
