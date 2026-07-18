// === Section: JSON 解析工具 ===
// 处理 LLM 返回的 JSON（中文引号、markdown 包裹、注释等）

App.parseJson = function(text) {
    if (!text || typeof text !== 'string') return null;
    
    let s = text.trim();
    
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
                    extracted = extracted
                        .replace(/[\u201C\u201D]/g, '"')
                        .replace(/[\u2018\u2019]/g, "'")
                        .replace(/[\uFF02]/g, '"')
                        .replace(/[\uFF07]/g, "'");
                    return JSON.parse(extracted);
                } catch (e3) {}
            }
            
            rpLog('warn', 'JSON', `JSON 解析失败 (原始 + 中文引号 + 提取均失败): ${s.slice(0, 200)}...`);
            return null;
        }
    }
};
