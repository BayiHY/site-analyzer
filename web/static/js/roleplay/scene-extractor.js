// === 场景提取器 ===
// 从 LLM 回复中提取 {场景描述}

/**
 * 提取场景文本
 * @param {string} text - LLM 回复（已剥离 JSON 块）
 * @returns {{sceneText: string|null, remaining: string}}
 */
export function extractScene(text) {
    let sceneText = null;
    let remaining = text;

    // 提取显式场景 {场景}
    const sceneMatch = text.match(/^\{([^}]+)\}/);
    if (sceneMatch) {
        sceneText = sceneMatch[1].trim();
        remaining = text.slice(sceneMatch[0].length);
    } else {
        // 没有 {场景} 时，检查开头是否有无角色旁白
        // 无角色旁白自动视为隐含的场景描写
        const leadingTextMatch = text.match(/^([^(┆][^┆]*)┆/);
        if (leadingTextMatch) {
            const potentialScene = leadingTextMatch[1].trim();
            // 如果这段文字不以角色名:开头，视为场景旁白
            if (!potentialScene.match(/^[\u4e00-\u9fa5a-zA-Z]+[:：]/)) {
                sceneText = potentialScene;
                remaining = text.slice(leadingTextMatch[0].length);
                if (typeof rpLog !== 'undefined') {
                    rpLog('INFO', 'PARSE-SCENE', `检测到无角色旁白，视为场景: "${sceneText}"`);
                }
            }
        }
        // 如果连 ┆ 都没有，整段文本可能全是场景描述或纯对话
        // 此时不做任何假设，让下游处理
    }

    return { sceneText, remaining };
}
