// === 格式校验层 ===
// 检测 LLM 回复是否严格遵循标准格式
// 2026-07-04 修复：场景描述不再要求花括号包裹

/**
 * 校验 LLM 回复格式
 */
export function validateFormat(rawText, parsedMessages) {
    let details = [];
    let missingScene = false;
    let missingPrefix = false;
    let missingReplies = false;
    let missingDialogue = false;
    let shouldRetry = false;

    // 1. 场景：可选，不再强制要求
    // 场景描述仅在场景变化/关键剧情时输出，其余轮次可以省略
    const hasSceneMsg = parsedMessages.some(m => m.isScene === true);
    // missingScene 不再触发重试

    // 2. 角色名前缀：必须有 :角色名: 格式
    const hasNamePrefix = /:[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_\u2022\u00B7·]{0,12}:\s*[\(\u300c]/.test(rawText);
    if (!hasNamePrefix && parsedMessages.length > 0) {
        missingPrefix = true;
        details.push('角色名前缀缺失（必须用 :角色名: 格式）');
    }

    // 3. 建议回复：可选，缺失时后台异步生成
    const hasReplies = /<[^>]+>/.test(rawText);
    if (!hasReplies) {
        missingReplies = true;
        details.push('建议回复缺失（将后台异步生成）');
    }

    // 4. 对话内容：必须有 「」 包裹
    const hasDialogue = /「[^」]+」/.test(rawText);
    if (!hasDialogue && parsedMessages.length > 0) {
        missingDialogue = true;
        details.push('对话「」包裹缺失');
    }

    // 5. 动作：最好有 (动作) 或 （动作）
    const hasAction = /\([^)]+\)|（[^）]+）/.test(rawText);
    if (!hasAction && parsedMessages.length > 0) {
        details.push('缺少动作描写');
    }

    // 综合判断
    // 注意：建议回复缺失不再触发重试，改为后台异步生成
    // 重试仅针对严重格式偏离
    if (missingPrefix && missingDialogue) {
        shouldRetry = true;
    }

    return { missingScene, missingPrefix, missingReplies, missingDialogue, shouldRetry, details };
}
