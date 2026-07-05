// === Section: 建议回复提取器 ===
// 从 LLM 回复末尾提取 <回复1┇回复2┇回复3>
// 2026-07-05 更新：建议回复现在为可选，缺失时由后台异步生成
// 2026-07-04 增强：口水词/无效回复触发重试信号
// 2026-07-04 修复：cleanOptionText 不过度清洗，确保选项不丢失

/**
 * 清洗选项文本：只移除首尾空白和常见包裹符号
 * 修复：不过度删除引号内容，避免选项变空
 */
function cleanOptionText(text) {
    if (!text) return text;
    let t = text.trim();
    // 只移除最外层的一对括号/引号（一层）
    const wrappers = [['(', ')'], ['（', '）'], ['"', '"'], ['"', '"'], ['「', '」'], ['『', '』']];
    for (const [open, close] of wrappers) {
        if (t.startsWith(open) && t.endsWith(close) && t.length > open.length + close.length) {
            t = t.slice(open.length, -close.length).trim();
            break; // 只剥一层
        }
    }
    return t || text; // 如果清洗后为空，返回原始文本
}

/**
 * 视角校验：检测选项是否混入了NPC视角台词
 * 返回 {isValid, reason}
 */
function validateOptionPerspective(option) {
    if (!option) return { isValid: true, reason: '' };
    const lower = option.toLowerCase();
    const npcPatterns = [
        /你想[^你]*我吗/, /你别[^你]*我/, /这里[^你]*危险/,
        /随你[^我]*无所谓/, /你[^你]*疯[^你]*了/, /你[^你]*敢/, /你[^你]*再/,
        /[^我]*你[^我]*说/, /[^我]*你[^我]*问/, /[^我]*你[^我]*答/,
    ];
    for (const p of npcPatterns) {
        if (p.test(lower)) {
            return { isValid: false, reason: '疑似NPC视角台词' };
        }
    }
    // 玩家视角选项不应以感叹号/问号结尾（那是NPC台词特征）
    if (/[！？]$/.test(option.trim())) {
        return { isValid: false, reason: '感叹/反问句式疑似NPC台词' };
    }
    return { isValid: true, reason: '' };
}

/**
 * 口水词校验：检测是否为无意义的口水词
 * 返回 {isValid, reason, severity: 'soft'|'hard'}
 * severity='hard' 表示必须重试，'soft' 仅 warn
 */
function validateNotFiller(option) {
    if (!option) return { isValid: true, reason: '', severity: 'soft' };
    const t = option.trim();
    
    // 硬拦截：完全无意义的单字/双字
    const hardFillers = ['嗯', '哦', '啊', '好的', '好吧', '行', '嗯嗯', '哦哦', 
                         '好', '知道了', '明白', '了解', '嗯嗯好的', '哦哦好',
                         '...', '…', '。', '！'];
    if (hardFillers.includes(t)) {
        return { isValid: false, reason: '口水词', severity: 'hard' };
    }
    
    // 硬拦截：1-2字符且不含中文动词/名词
    if (t.length <= 2 && t.length > 0) {
        const hasMeaningfulChar = /[\u4e00-\u9fa5]/.test(t);
        if (!hasMeaningfulChar) {
            return { isValid: false, reason: '过短无意义', severity: 'hard' };
        }
        // 中文单字/双字但无动词
        const verbs = ['看', '听', '走', '说', '做', '想', '去', '来', '坐', '站', '靠', '握', '抱', '推', '拉', '拿', '给', '问', '答', '笑', '哭', '点头', '摇头', '摆手', '转身', '回头', '靠近', '后退', '注视', '凝视'];
        const hasVerb = verbs.some(v => t.includes(v));
        if (!hasVerb && t.length <= 2) {
            return { isValid: false, reason: '过短无意义', severity: 'hard' };
        }
    }
    
    // 软拦截：纯语气词重复
    const softFillers = ['嗯嗯嗯', '啊啊啊', '哦哦哦', '好好好', '行行行'];
    if (softFillers.includes(t)) {
        return { isValid: false, reason: '重复语气词', severity: 'soft' };
    }
    
    return { isValid: true, reason: '' };
}

/**
 * 提取建议回复
 * @param {string} text - 已剥离场景的对话文本
 * @returns {{replies: string[], remaining: string, needsRetry: boolean, retryReason: string}}
 */
export function extractSuggestedReplies(text) {
    let suggestedReplies = [];
    let replyMatch = null;
    let needsRetry = false;
    let retryReason = '';

    // 严格匹配：尖括号必须在文本末尾（允许尾部空白）
    replyMatch = text.match(/<([^>]*)>\s*$/);

    if (replyMatch) {
        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-REPLY', `尖括号内内容: "${replyMatch[1]}"`);
        }

        // 优先用 ┇ 分隔
        suggestedReplies = replyMatch[1].split('┇').map(s => cleanOptionText(s)).filter(s => s && s.length > 0);

        if (suggestedReplies.length < 2) {
            // 兜底：尝试 | 分隔符
            const fb1 = replyMatch[1].split('|').map(s => cleanOptionText(s)).filter(s => s && s.length > 0);
            if (fb1.length >= 2) suggestedReplies = fb1;
            else {
                const fb2 = replyMatch[1].split('>。<').map(s => cleanOptionText(s)).filter(s => s && s.length > 0);
                if (fb2.length >= 2) suggestedReplies = fb2;
                else {
                    const fb3 = replyMatch[1].split('、').map(s => cleanOptionText(s)).filter(s => s && s.length > 0);
                    if (fb3.length >= 2) suggestedReplies = fb3;
                }
            }
        }

        // 如果所有分隔符都失败，至少返回原始内容
        if (suggestedReplies.length === 0 && replyMatch[1].trim()) {
            suggestedReplies = [replyMatch[1].trim()];
            if (typeof rpLog !== 'undefined') {
                rpLog('warn', 'PARSE-REPLY', `所有分隔符解析失败，退回原始内容: "${replyMatch[1]}"`);
            }
        }

        // 深度校验：每条选项逐一检测
        if (typeof rpLog !== 'undefined') {
            let rejectedCount = 0;
            let hardRejectCount = 0;
            
            for (const opt of suggestedReplies) {
                const perspectiveCheck = validateOptionPerspective(opt);
                const fillerCheck = validateNotFiller(opt);
                
                if (!perspectiveCheck.isValid) {
                    rejectedCount++;
                    if (typeof rpLog !== 'undefined') {
                        rpLog('warn', 'PARSE-REPLY', `选项视角校验: "${opt}" → ${perspectiveCheck.reason}, REJECT`);
                    }
                }
                if (!fillerCheck.isValid) {
                    rejectedCount++;
                    if (fillerCheck.severity === 'hard') {
                        hardRejectCount++;
                    }
                    if (typeof rpLog !== 'undefined') {
                        rpLog('warn', 'PARSE-REPLY', `口水词校验: "${opt}" → ${fillerCheck.reason} (severity=${fillerCheck.severity}), REJECT`);
                    }
                }
            }
            
            if (rejectedCount > 0) {
                rpLog('warn', 'PARSE-REPLY', `${rejectedCount}/${suggestedReplies.length} 个选项异常`);
            }
            
            // 硬拦截：超过一半选项被 hard reject → 必须重试
            if (suggestedReplies.length >= 2 && hardRejectCount > suggestedReplies.length / 2) {
                needsRetry = true;
                retryReason = `口水词过多 (${hardRejectCount}/${suggestedReplies.length} 条硬拦截)`;
                rpLog('error', 'PARSE-REPLY', `⚠️ 回复选项质量过低，触发重试: ${retryReason}`);
            }
            
            // 全部无效 → 必须重试
            if (suggestedReplies.length > 0 && rejectedCount === suggestedReplies.length * 2) {
                needsRetry = true;
                retryReason = '所有选项均无效';
                rpLog('error', 'PARSE-REPLY', `⚠️ 所有回复选项均无效，触发重试`);
            }

            const uniqueReplies = new Set(suggestedReplies);
            if (uniqueReplies.size < suggestedReplies.length && uniqueReplies.size <= 2) {
                rpLog('warn', 'PARSE-REPLY', `⚠️ 建议回复高度重复: ${suggestedReplies.length} 条中仅有 ${uniqueReplies.size} 种不同内容`);
            }
        }
    } else {
        if (typeof rpLog !== 'undefined') {
            rpLog('INFO', 'PARSE-REPLY', '未发现 <> 标签，无建议回复');
            needsRetry = true;
            retryReason = '缺少 <> 建议回复标签';
        }
    }

    const remaining = replyMatch
        ? text.slice(0, text.length - replyMatch[0].length).trim()
        : text;

    return { replies: suggestedReplies, remaining, needsRetry, retryReason };
}
