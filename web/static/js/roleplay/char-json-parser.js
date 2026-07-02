// === 角色 JSON 回退解析器 ===
// 当分隔符解析失败时，尝试从 LLM 输出中提取并修复 JSON

/**
 * 从文本中提取 JSON 并尝试修复常见格式问题
 * @param {string} text - LLM 原始输出
 * @returns {object|object[]} 解析后的角色数据
 */
export function parseCharactersJson(text) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('No JSON braces found');
    }
    let jsonStr = text.slice(firstBrace, lastBrace + 1);

    // 尝试手动修正常见格式问题
    let normalized = jsonStr
        .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
        .replace(/\u201c/g, '"').replace(/\u201d/g, '"')
        .replace(/\uFF07/g, "'").replace(/\uFF02/g, '"')
        .replace(/\u300C/g, '"').replace(/\u300D/g, '"');
    normalized = normalized.replace(/,\s*([\]}])/g, '$1');
    normalized = normalized.replace(/:\s*'([^']*)'/g, function(m, val) {
        return ': "' + val.replace(/'/g, "\\'").replace(/"/g, '\\"') + '"';
    });
    normalized = normalized.replace(/'([^']*)'\s*:/g, '"$1":');
    normalized = normalized.replace(/:\s*'([^']*)'/g, ':"$1"');

    return JSON.parse(normalized);
}
