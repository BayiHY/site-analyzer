// === JSON 块剥离器 ===
// 从 LLM 回复文本中剥离 ```json {...} ``` 代码块

/**
 * 剥离 JSON 元数据块
 * @param {string} text - LLM 原始回复文本
 * @returns {string} 剥离后的纯文本
 */
export function stripJsonBlock(text) {
    const jsonBlockMatch = text.match(/```(?:json)?\s*[\s\S]*?\n?```/);
    if (jsonBlockMatch) {
        text = text.slice(0, jsonBlockMatch.index) + text.slice(jsonBlockMatch.index + jsonBlockMatch[0].length);
        if (typeof rpLog !== 'undefined') {
            rpLog('info', 'PARSE', '已从文本中剥离 JSON 元数据块');
        }
    }
    return text.trim();
}
