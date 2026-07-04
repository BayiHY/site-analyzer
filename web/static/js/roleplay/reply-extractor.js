// === 建议回复提取器 ===
// 从 LLM 回复中提取 <回复1┇回复2┇回复3>

/**
 * 清洗选项文本：移除首尾括号、引号、空格等脏字符
 */
function cleanOptionText(text) {
    if (!text) return text;
    let t = text.trim();
    // 移除首尾圆括号
    while (t.startsWith('(') && t.endsWith(')')) {
        t = t.slice(1, -1).trim();
    }
    // 移除首尾引号
    t = t.replace(/^["「」『』"'']/g, '').replace(/["」』''"]/g, '');
    // 移除首尾括号
    t = t.replace(/^\(/, '').replace(/\)$/, '');
    return t;
}

/**
 * 视角校验：检测选项是否混入了NPC视角台词
 * @param {string} option - 选项文本
 * @returns {{isValid: boolean, reason: string}}
 */
function validateOptionPerspective(option) {
    if (!option) return { isValid: true, reason: '' };
    const lower = option.toLowerCase();
    // 常见NPC质问模式（第二人称）
    const npcPatterns = [
        /你想[^你]*我吗/,      // "你想靠近我吗"
        /你别[^你]*我/,        // "别这样叫我"
        /这里[^你]*危险/,      // "这里很危险"
        /随你[^我]*无所谓/,    // "随你怎么叫"
        /你[^你]*疯[^你]*了/,  // "你疯了吗"
        /你[^你]*敢/,           // "你敢..."
        /你[^你]*再/,           // "你再..."
    ];
    for (const p of npcPatterns) {
        if (p.test(lower)) {
            return { isValid: false, reason: '疑似NPC视角台词' };
        }
    }
    return { isValid: true, reason: '' };
}

/**
 * 提取建议回复
 * @param {string} text - LLM 回复文本
 * @returns {{replies: string[], remaining: string}}
 */
export function extractSuggestedReplies(text) {
    let suggestedReplies = [];

    const replyMatch = text.match(/<([^>]*)>\s*$/);
    if (replyMatch) {
        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-REPLY', `原始文本含 <> 标签: "${replyMatch[0]}"`);
            rpLog('INFO', 'PARSE-REPLY', `尖括号内内容: "${replyMatch[1]}"`);
        }

        // 优先用 ┇ 分隔
        suggestedReplies = replyMatch[1].split('┇').map(s => cleanOptionText(s)).filter(Boolean);

        if (suggestedReplies.length < 2) {
            // 兜底：尝试 | 分隔符
            const fallback1 = replyMatch[1].split('|').map(s => cleanOptionText(s)).filter(Boolean);
            if (fallback1.length >= 2) {
                suggestedReplies = fallback1;
                if (typeof rpLog !== 'undefined') {
                    rpLog('INFO', 'PARSE-REPLY', `┇ 分隔失败，使用 | 兜底解析出 ${suggestedReplies.length} 条`);
                }
            } else {
                // 兜底：尝试 >。< 分隔符
                const fallback2 = replyMatch[1].split('>。<').map(s => cleanOptionText(s)).filter(Boolean);
                if (fallback2.length >= 2) {
                    suggestedReplies = fallback2;
                    if (typeof rpLog !== 'undefined') {
                        rpLog('INFO', 'PARSE-REPLY', `| 分隔失败，使用 >。< 兜底解析出 ${suggestedReplies.length} 条`);
                    }
                } else {
                    // 兜底：尝试顿号分隔
                    const fallback3 = replyMatch[1].split('、').map(s => cleanOptionText(s)).filter(Boolean);
                    if (fallback3.length >= 2) {
                        suggestedReplies = fallback3;
                        if (typeof rpLog !== 'undefined') {
                            rpLog('INFO', 'PARSE-REPLY', `分隔符全失败，使用顿号兜底解析出 ${suggestedReplies.length} 条`);
                        }
                    } else {
                        if (typeof rpLog !== 'undefined') {
                            rpLog('WARN', 'PARSE-REPLY', `仅解析出 ${suggestedReplies.length} 条，无法分割`);
                        }
                    }
                }
            }
        }

        // === 视角校验 + 日志 ===
        if (typeof rpLog !== 'undefined') {
            let rejectedCount = 0;
            for (const opt of suggestedReplies) {
                const check = validateOptionPerspective(opt);
                if (!check.isValid) {
                    rejectedCount++;
                    rpLog('warn', 'PARSE-REPLY', `选项视角校验: "${opt}" → 检测为${check.reason}, 状态=REJECT`);
                }
            }
            if (rejectedCount > 0) {
                rpLog('warn', 'PARSE-REPLY', `${rejectedCount}/${suggestedReplies.length} 个选项视角异常，标记待修正`);
            }
            rpLog('INFO', 'PARSE-REPLY', `解析出 ${suggestedReplies.length} 条建议回复: ${JSON.stringify(suggestedReplies)}`);
            
            // 检测推荐回复是否完全重复（模板化迹象）
            const uniqueReplies = new Set(suggestedReplies);
            if (uniqueReplies.size < suggestedReplies.length && uniqueReplies.size <= 2) {
                rpLog('warn', 'PARSE-REPLY', `⚠️ 建议回复高度重复: ${suggestedReplies.length} 条中仅有 ${uniqueReplies.size} 种不同内容，可能存在模板化问题`);
            }
        }
    } else {
        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-REPLY', '原始文本中未发现 <> 标签，无建议回复');
        }
    }

    // 清洗脏字符日志
    if (replyMatch && suggestedReplies.length > 0) {
        const dirtyOptions = suggestedReplies.filter(s => s !== s.trim() || /\([^\)]*\)$/.test(s) || /^\([^\(]*$/.test(s));
        if (dirtyOptions.length > 0) {
            rpLog('warn', 'OPTION-PARSE', `清洗脏字符: 原始="${replyMatch[1]}", 清洗后=${JSON.stringify(suggestedReplies)}, 脏选项数=${dirtyOptions.length}`);
        }
    }

    const remaining = suggestedReplies.length > 0
        ? text.slice(0, text.length - replyMatch[0].length).trim()
        : text;

    return { replies: suggestedReplies, remaining };
}
