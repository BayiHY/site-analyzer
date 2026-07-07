// === 内容解析器 ===
// 解析单个角色消息中的 :角色名:、(动作)、「对话」、[想法]

/**
 * 解析单个角色消息的内容
 */
export function parseContent(trimmed, charName, defaultCharIndex) {
    // 提取 :角色名: 前缀
    let prefixMatch = trimmed.match(/^:([^:：]+):(.+)/);
    if (prefixMatch) {
        charName = prefixMatch[1].trim();
        trimmed = prefixMatch[2].trim();
    } else {
        // 旧格式兜底：角色名:
        prefixMatch = trimmed.match(/^([^:：]+)[:：]\s*(.+)/);
        if (prefixMatch) {
            charName = prefixMatch[1].trim();
            trimmed = prefixMatch[2].trim();
        }
    }

    let action = '';
    let thought = '';
    let dialogue = '';
    let remaining = trimmed;

    // 迭代扫描 （动作）、「对话」、「内心想法」
    // 同时支持半角和全角括号
    let pos = 0;
    const len = remaining.length;
    let dialogueParts = [];

    while (pos < len) {
        let bestMatch = null;
        let bestPos = len;

        // 查找 (动作) 或 （动作）— 半角和全角都支持
        const parenOpen = remaining.indexOf('(', pos);
        const parenOpenFull = remaining.indexOf('（', pos);
        let actionPos = -1;
        let actionCloseChar = ')';
        if (parenOpen !== -1 && parenOpen < bestPos) {
            const parenClose = remaining.indexOf(')', parenOpen + 1);
            if (parenClose !== -1 && (actionPos === -1 || parenClose < actionPos)) {
                actionPos = parenOpen;
                actionCloseChar = ')';
            }
        }
        if (parenOpenFull !== -1 && parenOpenFull < bestPos) {
            const parenCloseFull = remaining.indexOf('）', parenOpenFull + 1);
            if (parenCloseFull !== -1 && (actionPos === -1 || parenCloseFull < actionPos)) {
                actionPos = parenOpenFull;
                actionCloseChar = '）';
            }
        }
        if (actionPos !== -1) {
            const actionCloseIdx = remaining.indexOf(actionCloseChar, actionPos + 1);
            if (actionCloseIdx !== -1 && actionCloseIdx < bestPos) {
                bestMatch = { pos: actionPos, end: actionCloseIdx + 1, type: 'action' };
                bestPos = actionPos;
            }
        }

        // 查找 「对话」
        const qOpen = remaining.indexOf('「', pos);
        if (qOpen !== -1 && qOpen < bestPos) {
            const qClose = remaining.indexOf('」', qOpen + 1);
            if (qClose !== -1) {
                bestMatch = { pos: qOpen, end: qClose + 1, type: 'dialogue' };
                bestPos = qOpen;
            }
        }

        // 查找 [想法] 或 ［想法］
        const bracketOpen = remaining.indexOf('[', pos);
        const bracketOpenFull = remaining.indexOf('［', pos);
        let thoughtPos = -1;
        let thoughtCloseChar = ']';
        if (bracketOpen !== -1 && bracketOpen < bestPos) {
            const bracketClose = remaining.indexOf(']', bracketOpen + 1);
            if (bracketClose !== -1 && (thoughtPos === -1 || bracketClose < thoughtPos)) {
                thoughtPos = bracketOpen;
                thoughtCloseChar = ']';
            }
        }
        if (bracketOpenFull !== -1 && bracketOpenFull < bestPos) {
            const bracketCloseFull = remaining.indexOf('］', bracketOpenFull + 1);
            if (bracketCloseFull !== -1 && (thoughtPos === -1 || bracketCloseFull < thoughtPos)) {
                thoughtPos = bracketOpenFull;
                thoughtCloseChar = '］';
            }
        }
        if (thoughtPos !== -1) {
            const thoughtCloseIdx = remaining.indexOf(thoughtCloseChar, thoughtPos + 1);
            if (thoughtCloseIdx !== -1 && thoughtCloseIdx < bestPos) {
                bestMatch = { pos: thoughtPos, end: thoughtCloseIdx + 1, type: 'thought' };
                bestPos = thoughtPos;
            }
        }

        if (!bestMatch) {
            // 剩余纯文本归入对话
            const rest = remaining.slice(pos).trim();
            if (rest) dialogueParts.push(rest);
            break;
        }

        // 收集标记前的纯文本
        if (bestMatch.pos > pos) {
            const seg = remaining.slice(pos, bestMatch.pos).trim();
            if (seg) dialogueParts.push(seg);
        }

        if (bestMatch.type === 'action') {
            const content = remaining.slice(bestMatch.pos + 1, bestMatch.end - 1).trim();
            if (content) {
                action += (action ? ' ' : '') + '(' + content + ')';
            }
        } else if (bestMatch.type === 'dialogue') {
            const content = remaining.slice(bestMatch.pos + 1, bestMatch.end - 1).trim();
            if (content) dialogueParts.push(content);
        } else if (bestMatch.type === 'thought') {
            const content = remaining.slice(bestMatch.pos + 1, bestMatch.end - 1).trim();
            if (content) {
                thought += (thought ? ' ' : '') + content;
            }
        }

        pos = bestMatch.end;
    }

    dialogue = dialogueParts.join('').trim();

    // 构建格式化内容
    let formattedContent = '';
    if (action) formattedContent += action;
    if (dialogue) formattedContent += dialogue;
    if (thought) formattedContent += '[' + thought + ']';
    if (!formattedContent) formattedContent = trimmed;

    // 查找角色索引 — 严格匹配优先（2026-07-04 优化）
    // 原则：精确匹配 > 小距离编辑匹配 > fallback 到 defaultCharIndex
    // 废弃 includes 模糊匹配（会导致"林悦"匹配到"林悦儿"等串号）
    let charIdx = defaultCharIndex;
    if (charName) {
        const exact = state.characters.findIndex(c => c.name === charName);
        if (exact >= 0) {
            charIdx = exact;
            if (typeof rpLog !== 'undefined') {
                rpLog('INFO', 'PARSE-CHAR', `角色索引精确匹配: "${charName}" → index=${charIdx}`);
            }
        } else {
            // 严格 Levenshtein 距离匹配：最多允许 1 个字符差异
            let bestDist = Infinity, bestIdx = -1;
            for (let i = 0; i < state.characters.length; i++) {
                const cName = state.characters[i].name;
                if (!cName) continue;
                const dist = levenshteinDistance(charName, cName);
                // 只接受距离 <= 1 的匹配（如"林悦"→"林越"错字）
                // 废弃 includes 模糊匹配，防止串号
                if (dist < bestDist && dist <= 1) {
                    bestDist = dist;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0) {
                charIdx = bestIdx;
                if (typeof rpLog !== 'undefined') {
                    rpLog('INFO', 'PARSE-CHAR', `角色索引编辑匹配: "${charName}" → "${state.characters[bestIdx].name}" (dist=${bestDist}) → index=${charIdx}`);
                }
            } else {
                // 未匹配到任何已知角色，保持 defaultCharIndex
                if (typeof rpLog !== 'undefined') {
                    rpLog('WARN', 'PARSE-CHAR', `角色名"${charName}"未匹配到已知角色，fallback index=${defaultCharIndex}`);
                }
            }
        }
    }

    return { charName, charIdx, action, dialogue, thought, formattedContent };
}

function levenshteinDistance(a, b) {
    if (!a) return b.length;
    if (!b) return a.length;
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[b.length][a.length];
}
