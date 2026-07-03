// === 格式校验层 ===
// 检测 LLM 回复是否严重偏离预期格式，决定是否触发重试

/**
 * 校验 LLM 回复格式
 * @param {string} rawText - LLM 原始回复
 * @param {Array} parsedMessages - 已解析的消息列表
 * @returns {{missingScene: boolean, missingPrefix: boolean, missingReplies: boolean, shouldRetry: boolean, details: string}}
 */
export function validateFormat(rawText, parsedMessages) {
    const details = [];
    let missingScene = false;
    let missingPrefix = false;
    let missingReplies = false;
    let shouldRetry = false;

    // 1. 检查场景描述是否存在（应该有 {场景} 包裹）
    const hasBraces = /\{[^}]+\}/.test(rawText);
    const hasSceneMsg = parsedMessages.some(m => m.isScene === true);
    if (!hasBraces && !hasSceneMsg) {
        missingScene = true;
        details.push('场景描述缺失');
    }

    // 2. 检查角色名前缀（应该有 角色名: 或 角色名：）
    const hasNamePrefix = /[\u4e00-\u9fa5a-zA-Z]{2,10}[:：]\s*[\(\(]/.test(rawText) ||
                          /[\u4e00-\u9fa5a-zA-Z]{2,10}[:：][^\(\)]/.test(rawText);
    if (!hasNamePrefix && parsedMessages.length > 0) {
        missingPrefix = true;
        details.push('角色名前缀缺失');
    }

    // 3. 检查是否有多角色分隔符 ┆
    const hasSeparator = rawText.includes('┆');
    if (!hasSeparator && parsedMessages.filter(m => m.type === 'multi_char').length > 1) {
        details.push('多角色消息但无分隔符');
    }

    // 4. 检查是否包含动作描写（应该有 (动作) 格式）
    const hasAction = /\([^)]*\)[^┆]*/.test(rawText);
    if (!hasAction && parsedMessages.length > 0) {
        details.push('缺少动作描写');
    }

    // 综合判断是否需要重试
    if (details.length >= 2) {
        shouldRetry = true;
    }

    return { missingScene, missingPrefix, missingReplies, shouldRetry, details };
}
