// === 情感指标 ===
// 从 state.emotions 中提取情感数据及行为指引

export function buildEmotionGuide(activeCharName, state) {
    const emotions = state.emotions[activeCharName] || {};
    const emotionLines = Object.entries(emotions).map(([k, v]) => {
        const val = v.current ?? 50;
        return `${k}：${val}/100（${val >= 60 ? '非常积极' : val >= 30 ? '中性偏积极' : '冷淡/警惕'}）`;
    }).join('，') || '无数据';

    return `=== 情感指标（隐性，不向玩家展示） ===
${emotionLines}
- 好感度高时表现热情主动，低时表现疏离或试探`;
}
