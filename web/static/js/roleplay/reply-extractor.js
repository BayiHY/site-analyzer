// === 建议回复提取器 ===
// 从 LLM 回复中提取 <建议回复1|建议回复2|建议回复3>

/**
 * 提取建议回复
 * @param {string} text - LLM 回复文本
 * @returns {{replies: string[], remaining: string}}
 */
export function extractSuggestedReplies(text) {
    let suggestedReplies = [];

    // 允许尖括号后跟可选的 |（LLM 有时会在 <> 后多打一个 |）
    const replyMatch = text.match(/<([^>]*)>\|?\s*$/);
    if (replyMatch) {
        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-REPLY', `原始文本含 <> 标签: "${replyMatch[0]}"`);
            rpLog('INFO', 'PARSE-REPLY', `尖括号内内容: "${replyMatch[1]}"`);
        }

        // 优先用 | 分隔
        suggestedReplies = replyMatch[1].split('|').map(s => {
            let t = s.trim();
            t = t.replace(/^["「」]/, '').replace(/["」]$/, '');
            return t;
        }).filter(Boolean);

        if (suggestedReplies.length < 2) {
            // 兜底：尝试 >。< 分隔符（LLM 常误用）
            const fallback1 = replyMatch[1].split('>。<').map(s => {
                let t = s.trim();
                t = t.replace(/^["「」]/, '').replace(/["」]$/, '');
                return t;
            }).filter(Boolean);
            if (fallback1.length >= 2) {
                suggestedReplies = fallback1;
                if (typeof rpLog !== 'undefined') {
                    rpLog('INFO', 'PARSE-REPLY', `| 分隔失败，使用 >。< 兜底解析出 ${suggestedReplies.length} 条`);
                }
            } else {
                // 兜底：尝试顿号分隔
                const fallback2 = replyMatch[1].split('、').map(s => {
                    let t = s.trim();
                    t = t.replace(/^["「」]/, '').replace(/["」]$/, '');
                    return t;
                }).filter(Boolean);
                if (fallback2.length >= 2) {
                    suggestedReplies = fallback2;
                    if (typeof rpLog !== 'undefined') {
                        rpLog('INFO', 'PARSE-REPLY', `| 分隔失败，使用顿号兜底解析出 ${suggestedReplies.length} 条`);
                    }
                } else {
                    if (typeof rpLog !== 'undefined') {
                        rpLog('WARN', 'PARSE-REPLY', `仅解析出 ${suggestedReplies.length} 条，无法兜底分割`);
                    }
                }
            }
        }

        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-REPLY', `解析出 ${suggestedReplies.length} 条建议回复: ${JSON.stringify(suggestedReplies)}`);
        }
    } else {
        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-REPLY', '原始文本中未发现 <> 标签，无建议回复');
        }
    }

    const remaining = suggestedReplies.length > 0
        ? text.slice(0, text.length - replyMatch[0].length).trim()
        : text;

    return { replies: suggestedReplies, remaining };
}
