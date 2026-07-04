// === Section: 角色分割器 ===
// 按 :角色名: 或 角色名: 格式分割多角色对话
// 2026-07-04 增强：兼容单冒号和双冒号两种格式，提升单角色场景鲁棒性

/**
 * 检测一行是否是角色行
 * 支持两种格式：
 *   :角色名:(动作)...  （双冒号，推荐格式）
 *   角色名:(动作)...   （单冒号，旧格式兼容）
 */
function isCharLine(line) {
    const trimmed = line.trim();
    // 双冒号格式：:名字:(  — 名字可以是中文/英文/数字/下划线/点/圆点
    if (/^:[\u4e00-\u9fa5a-zA-Z0-9_\u2022\u00B7·]{1,12}:\s*[\(\u300c]/.test(trimmed)) {
        return 'double_colon';
    }
    // 单冒号格式：名字:(  — 前面不能有冒号（排除双冒号）
    if (!trimmed.startsWith(':') && /^[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_\u2022\u00B7·]{0,11}:\s*[\(\u300c]/.test(trimmed)) {
        return 'single_colon';
    }
    return false;
}

/**
 * 从行中提取角色名和内容
 * @param {string} line - 原始行文本
 * @returns {{charName: string, content: string, format: 'double'|'single'|null}}
 */
function extractCharLine(line) {
    const trimmed = line.trim();
    
    // 优先尝试双冒号格式 :角色名:(动作)...
    const doubleMatch = trimmed.match(/^:([\u4e00-\u9fa5a-zA-Z0-9_\u2022\u00B7·]{1,12}):\s*(.+)$/);
    if (doubleMatch && /[\(\u300c]/.test(doubleMatch[2].trimStart())) {
        return { charName: doubleMatch[1].trim(), content: doubleMatch[2].trim(), format: 'double' };
    }
    
    // 尝试单冒号格式 角色名:(动作)...
    const singleMatch = trimmed.match(/^([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_\u2022\u00B7·]{0,11}):\s*(.+)$/);
    if (singleMatch && /[\(\u300c]/.test(singleMatch[2].trimStart())) {
        // 确保不是数字开头（年龄列）
        if (!/^\d/.test(singleMatch[1])) {
            return { charName: singleMatch[1].trim(), content: singleMatch[2].trim(), format: 'single' };
        }
    }
    
    return { charName: null, content: null, format: null };
}

/**
 * 分割角色对话段
 * 优先使用 :角色名: 格式分割，兼容 角色名: 格式
 * 如果都没有检测到，返回原文本作为单段
 */
export function splitCharParts(text) {
    const charParts = [];
    const lines = text.split('\n');
    
    // 第一轮：尝试双冒号格式 :角色名:
    let foundDoubleColon = false;
    for (const line of lines) {
        const result = extractCharLine(line);
        if (result.format === 'double') {
            foundDoubleColon = true;
            charParts.push({ charName: result.charName, content: result.content, format: 'double' });
        }
    }
    
    if (foundDoubleColon && charParts.length > 0) {
        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-CHAR', `双冒号格式拆分为 ${charParts.length} 段`);
        }
        return charParts.map(p => `${p.charName}:${p.content}`);
    }
    
    // 第二轮：尝试单冒号格式 角色名:
    charParts.length = 0;
    let foundSingleColon = false;
    for (const line of lines) {
        const result = extractCharLine(line);
        if (result.format === 'single') {
            foundSingleColon = true;
            charParts.push({ charName: result.charName, content: result.content, format: 'single' });
        }
    }
    
    if (foundSingleColon && charParts.length > 0) {
        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-CHAR', `单冒号格式拆分为 ${charParts.length} 段`);
        }
        return charParts.map(p => `${p.charName}:${p.content}`);
    }
    
    // 兜底：返回原文本作为单段
    const trimmed = text.trim();
    if (trimmed) {
        if (typeof rpLog !== 'undefined') {
            rpLog('WARN', 'PARSE-CHAR', '未检测到角色行格式，返回原文本作为单段');
        }
        return [trimmed];
    }
    
    return [];
}
