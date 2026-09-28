// === Section: JSON 解析工具 ===
// 处理 LLM 返回的 JSON（中文引号、markdown 包裹、注释等）

/**
 * [fix#9] 通用 markdown 清洗函数，清除 **bold**、`code` 等标记
 * 用于防止 LLM 返回内容中的 markdown 导致 JSON.parse 崩溃
 */
App.cleanMarkdown = function(text) {
    if (!text || typeof text !== 'string') return text;

    // 先处理可能出现在 JSON 结构中的 ** 包裹（如 **{"key":"value"}**）
    // 这类情况 cleanMarkdown 会将其转换为 {"key":"value"}
    let result = text;

    // 多次迭代处理嵌套和相邻的 markdown 标记
    for (let i = 0; i < 10; i++) {
        const prev = result;
        // **bold** -> bold
        result = result.replace(/\*\*(.+?)\*\*/g, '$1');
        // `code` -> (empty)
        result = result.replace(/`[^`]+`/g, '');
        // *italic* -> italic
        result = result.replace(/\*(.+?)\*/g, '$1');
        if (result === prev) break;
    }

    // 清除残留的 markdown 标记
    result = result.replace(/[`*_]/g, '');

    return result;
};

App.parseJson = function(text) {
    if (!text || typeof text !== 'string') return null;

    let s = text.trim();

    // [fix#9] 清洗 markdown 标记，防止 **bold** 导致 JSON.parse 崩溃
    const beforeClean = s.slice(0, 200);
    s = App.cleanMarkdown(s);
    const afterClean = s.slice(0, 200);
    if (beforeClean !== afterClean) {
        rpLog('warn', 'JSON-PARSE', `[fix#9] 清洗前后对比: ${beforeClean}... → ${afterClean}...`);
    }

    // 清理 markdown 代码块包裹
    s = s.replace(/^```(?:json|JSON)?\s*\n/i, '');
    s = s.replace(/\n```\s*$/i, '');
    s = s.trim();

    // 移除行内注释 (// ...)
    s = s.replace(/\/\/.*$/gm, '');

    // 尝试直接解析
    try {
        return JSON.parse(s);
    } catch (e) {
        rpLog('error', 'JSON-PARSE', `[fix#9] JSON.parse 失败: ${e.message}`);
        rpLog('error', 'JSON-PARSE', `[fix#9] 失败文本: ${s.slice(0, 300)}`);
        // 替换中文/全角引号为英文引号
        const normalized = s
            .replace(/[\u201C\u201D]/g, '"')   // " "
            .replace(/[\u2018\u2019]/g, "'")   // ' '
            .replace(/[\uFF02]/g, '"')         // ＂
            .replace(/[\uFF07]/g, "'");        // ＇

        try {
            return JSON.parse(normalized);
        } catch (e2) {
            // 提取第一个 { ... } 或 [ ... ] 块
            const objMatch = s.match(/\{[\s\S]*\}/);
            if (objMatch) {
                try {
                    let extracted = objMatch[0];
                    // [fix#9] 在解析前清洗 markdown 标记，防止 ** 导致 JSON.parse 崩溃
                    extracted = extracted
                        .replace(/\*\*(.+?)\*\*/g, '$1')
                        .replace(/`[^`]+`/g, '')
                        .replace(/\*(.+?)\*/g, '$1')
                        .replace(/[`*_]/g, '')
                        .replace(/[\u201C\u201D]/g, '"')
                        .replace(/[\u2018\u2019]/g, "'")
                        .replace(/[\uFF02]/g, '"')
                        .replace(/[\uFF07]/g, "'");
                    return JSON.parse(extracted);
                } catch (e3) {
                    rpLog('error', 'JSON-PARSE', `[fix#9] 提取块也失败: ${e3.message}`);
                }
            }

            rpLog('warn', 'JSON', `[fix#9] JSON 解析失败 (原始 + 中文引号 + 提取均失败): ${s.slice(0, 200)}...`);
            return null;
        }
    }
};
