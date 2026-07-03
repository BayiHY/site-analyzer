// === Section: 动态属性更新 ===
// 对话后让 LLM 评估角色印象/秘密/当前情绪的变化

// 简易文本相似度：基于公共词元比例（0-1）
function textSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    // 简单分词：按字符切分取 bigram
    const bigrams = (s) => {
        const bs = new Set();
        for (let i = 0; i < s.length - 1; i++) bs.add(s[i] + s[i+1]);
        return bs;
    };
    const sa = bigrams(a.toLowerCase()), sb = bigrams(b.toLowerCase());
    if (sa.size === 0 || sb.size === 0) return 0;
    let intersect = 0;
    for (const b of sa) if (sb.has(b)) intersect++;
    return (2 * intersect) / (sa.size + sb.size);
}

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
// 如果某属性没有变化，返回空字符串""表示保持原值
// 如果语义与当前值几乎相同（相似度>90%），返回空字符串""
// secret 只在有新线索时才更新，否则永远返回""`;

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
            rpLog('warn', 'ATTR-UPDATE', `JSON 解析失败: ${e.message}`);
            return;
        }

        if (!changes || typeof changes !== 'object') return;

        const attrs = ['perception', 'secret', 'currentMood'];
        for (const attr of attrs) {
            const newVal = changes[attr] || '';
            const oldVal = c[attr] || '';

            // 空字符串 = 保持不变
            if (newVal === '') {
                rpLog('info', 'ATTR-DELTA', `${attr}: 保持不变（LLM返回空字符串）`);
                continue;
            }

            // 语义去重：如果与新值相似度 > 90%，视为无变化
            if (oldVal && textSimilarity(oldVal, newVal) > 0.9) {
                rpLog('info', 'ATTR-DELTA', `${attr}: 变化 "${oldVal}" → "${newVal}", 相似度 ${(textSimilarity(oldVal, newVal)*100).toFixed(0)}%, 实际更新: false`);
                continue;
            }

            // 有实质性变化，更新
            c[attr] = newVal;
            rpLog('info', 'ATTR-DELTA', `${attr}: "${oldVal}" → "${newVal}" [已更新]`);
        }

        await saveState();
    } catch (e) {
        console.warn('动态属性更新失败:', e);
    }
}
