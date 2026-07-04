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
    }

    return { sceneText, remaining };
}
