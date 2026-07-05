// === 情感指标 ===
// 从 state.emotions 中提取所有角色的情感数据及行为指引

export function buildEmotionGuide(state) {
    const allChars = state.characters || [];
    let section = '=== 情感指标（隐性，不向玩家展示） ===\n';

    for (const char of allChars) {
        const emotions = state.emotions[char.name] || {};
        const emotionLines = Object.entries(emotions).map(([k, v]) => {
            const val = v.current ?? 50;
            return `  ${k}：${val}/100（${val >= 60 ? '非常积极' : val >= 30 ? '中性偏积极' : '冷淡/警惕'}）`;
        }).join('，') || '  无数据';

        section += `\n【${char.name}】${emotionLines}`;
    }

    section += `\n- 好感度高时表现热情主动，低时表现疏离或试探
- 根据玩家最新消息和历史对话，自主判断哪些角色参与了本轮交互，更新相应角色的情感指标`;

    return section;
}
