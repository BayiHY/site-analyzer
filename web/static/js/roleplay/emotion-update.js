// === Section: 情感指标更新 ===
// 对话后让 LLM 评估情感变化

App.updateEmotions = async function(charName, userMsg, charResponse) {
    const emotions = state.emotions[charName] || {};
    const emotionEntries = Object.entries(emotions).map(([k, v]) => {
        const val = v.current ?? 0;
        const label = val >= 60 ? '高' : val >= 30 ? '中' : '低';
        return `${k}=${val}(${label})`;
    }).join('，');

    const prompt = `当前对话：
用户说：${userMsg}
${charName}回复：${charResponse}

${charName}当前情感指标：${emotionEntries || '无'}

请评估本轮对话后各情感指标的变化（+5表示轻微上升，-3表示轻微下降，0表示不变）。
输出JSON格式：{"好感度": 0, "亲密感": 2, "信任度": -1, "吸引力": 0, "依赖感": 1}`;

    const resp = await App.agnesChat([
        { role: 'system', content: '你是情感分析器。输出纯JSON。' },
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

    for (const [key, delta] of Object.entries(changes)) {
        if (state.emotions[charName] && state.emotions[charName][key]) {
            state.emotions[charName][key].current = Math.max(0, Math.min(100,
                (state.emotions[charName][key].current || 50) + (delta || 0)));
        }
    }
    await saveState();
}
