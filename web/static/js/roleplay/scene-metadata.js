// === 场景元数据提取器 ===
// 从 LLM 回复末尾提取结构化 JSON 元数据（场景图用）
// 返回 { sceneDesc, presentCharacters, actions, dialogues } 或 null

/**
 * 从 LLM 回复中提取结构化 JSON 元数据
 * LLM 会在回复末尾附加 ```json {...} ``` 块
 * @param {string} response - LLM 原始回复
 * @returns {{sceneDesc: string, presentCharacters: string[], actions: object, dialogues: object}|null}
 */
export function extractSceneMetadata(response) {
    if (!response) return null;

    // 匹配 ```json {...} ``` 或 ``` {...} ``` 或裸 JSON
    let jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
        // 尝试匹配裸 JSON 块（响应末尾的 { ... }）
        jsonMatch = response.match(/\{[\s\S]*"sceneDesc"[\s\S]*\}$/);
    }
    if (!jsonMatch) return null;

    try {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const meta = JSON.parse(jsonStr);
        // 验证必要字段
        if (!meta.sceneDesc && !meta.presentCharacters) return null;
        return {
            sceneDesc: meta.sceneDesc || '',
            presentCharacters: Array.isArray(meta.presentCharacters) ? meta.presentCharacters : [],
            actions: meta.actions || {},
            dialogues: meta.dialogues || {}
        };
    } catch (e) {
        if (typeof rpLog !== 'undefined') {
            rpLog('warn', 'META', `JSON 解析失败: ${e.message}`);
        }
        return null;
    }
}
