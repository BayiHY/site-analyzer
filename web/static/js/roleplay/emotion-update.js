// === Section: 情感指标更新 ===
// 对话后让 LLM 评估情感变化

// 情感指标键名映射：LLM 输出内部指标名 → 存储键名
// 亲密感↔戒备、信任度↔厌恶、依赖感↔戒备 是反向关系，需在 LLM 层面修正
const EMOTION_KEY_MAP = {
    '好感度': '好感度',
    '亲密感': '亲密感',
    '信任度': '信任度',
    '吸引力': '吸引力',
    '依赖感': '依赖感'
};

// 玩家行为 → 情感预期方向映射（用于检测反常变化）
const BEHAVIOR_INTENT_MAP = {
    '示好': ['好感度↑', '亲密感↓', '信任度↑', '依赖感↑'],
    '配合': ['好感度↑', '亲密感↓', '信任度↑'],
    '攻击': ['好感度↓', '亲密感↑', '信任度↓', '依赖感↓'],
    '隐瞒': ['信任度↓', '亲密感↑'],
    '中立': ['无显著变化']
};

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

请评估本轮对话后各**内部情感指标**的变化（+5表示轻微上升，-3表示轻微下降，0表示不变）。
输出JSON格式：{"好感度": 0, "亲密感": 0, "信任度": 0, "吸引力": 0, "依赖感": 0}

重要规则：
1. 评估5项内部指标：好感度、亲密感、信任度、吸引力、依赖感
2. 变化幅度控制在 ±5 以内
3. 如果玩家行为是示好/配合，好感度和信任度应该上升或保持不变
4. 如果玩家行为是攻击/威胁，好感度和信任度应该下降或保持不变
5. 亲密感与好感度通常反向：好感度上升时亲密感可能下降（戒备降低）
6. 依赖感与好感度正相关：好感度上升时依赖感也可能上升
7. 每项变化必须合理，不要出现"玩家示好但信任度下降"的反常情况`;

    // 保存变化前的值用于日志
    const prevEmotions = {};
    for (const [key, val] of Object.entries(emotions)) {
        prevEmotions[key] = val.current;
    }

    const resp = await App.agnesChat([
        { role: 'system', content: '你是情感分析器。输出纯JSON。' },
        { role: 'user', content: prompt }
    ], { route: 'emotion' });

    let changes;
    try {
        const jsonMatch = resp.match(/\{[\s\S]*\}/);
        changes = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
    } catch(e) {
        rpLog('warn', 'EMOTION', `JSON 解析失败: ${e.message}`);
        return;
    }

    if (!changes || typeof changes !== 'object') return;

    // 标准化键名：兼容旧键名映射
    const normalizedChanges = {};
    for (const [key, delta] of Object.entries(changes)) {
        const normalizedKey = EMOTION_KEY_MAP[key] || key;
        if (['好感度', '亲密感', '信任度', '吸引力', '依赖感'].includes(normalizedKey)) {
            normalizedChanges[normalizedKey] = delta;
        }
    }

    rpLog('info', 'EMOTION', `原始输入: ${JSON.stringify(changes)}, 标准化后: ${JSON.stringify(normalizedChanges)}`);

    for (const [key, delta] of Object.entries(normalizedChanges)) {
        if (!state.emotions[charName] || !state.emotions[charName][key]) continue;

        const prevVal = state.emotions[charName][key].current || 50;
        const newVal = Math.max(0, Math.min(100, prevVal + (delta || 0)));

        state.emotions[charName][key].current = newVal;

        rpLog('info', 'EMOTION-DELTA', `${key}: ${prevVal}→${newVal} (${delta >= 0 ? '+' : ''}${delta})`);

        // 检测反常变化：玩家示好但信任/好感下降
        if (delta < 0 && (key === '信任度' || key === '好感度')) {
            const userMsgLower = userMsg.toLowerCase();
            if (userMsgLower.includes('没恶意') || userMsgLower.includes('帮助') ||
                userMsgLower.includes('配合') || userMsgLower.includes('听从') ||
                userMsgLower.includes('放下') || userMsgLower.includes('抱歉') ||
                userMsgLower.includes('对不起') || userMsgLower.includes('你好')) {
                rpLog('warn', 'EMOTION-CONFLICT',
                    `检测到反常变化: 玩家示好("${userMsg.slice(0,30)}") 但 ${key} 下降 ${delta}`);
            }
        }
    }

    await saveState();
}
