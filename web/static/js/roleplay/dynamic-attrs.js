// === Section: 动态属性更新 ===
// 对话后让 LLM 评估角色印象/秘密/当前情绪的变化

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
1. perception：玩家对${charName}的当前印象（一句话描述）
2. secret：是否有新线索暗示${charName}有隐藏的秘密（仅在新线索出现时更新）
3. currentMood：${charName}当前的心情状态

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
