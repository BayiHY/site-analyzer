// === 内容解析器 ===
// 解析单个角色消息中的 (动作)、[想法]、对话内容

/**
 * 解析单个角色消息的内容
 * @param {string} trimmed - 角色段落的修剪后文本
 * @param {string|null} charName - 角色名（从 "名字:" 前缀提取）
 * @param {number} defaultCharIndex - 默认角色索引
 * @param {string[]} suggestedReplies - 建议回复列表
 * @returns {{charName: string|null, charIdx: number, action: string, dialogue: string, thought: string, formattedContent: string}}
 */
export function parseContent(trimmed, charName, defaultCharIndex, suggestedReplies) {
    // 检查是否有 "角色名:" 前缀
    const prefixMatch = trimmed.match(/^([^:：]+)[:：]\s*(.+)/);
    if (prefixMatch) {
        charName = prefixMatch[1].trim();
        trimmed = prefixMatch[2].trim();
    }

    let action = '';
    let thought = '';
    let remaining = trimmed;

    // 第一步：如果文本以 (动作) 开头，提取第一个动作
    const firstActionMatch = remaining.match(/^\(([^)]+)\)(.*)/s);
    if (firstActionMatch) {
        action = '(' + firstActionMatch[1].trim() + ')';
        remaining = firstActionMatch[2].trimStart();
    }

    // 第二步：在剩余文本中迭代扫描 (动作) 和 [想法]
    let dialogueParts = [];
    let scanPos = 0;
    let scanRemaining = remaining;

    while (scanPos < scanRemaining.length) {
        let bestMatch = null;
        let bestPos = scanRemaining.length;

        // 查找下一个 (动作)
        const openParen = scanRemaining.indexOf('(', scanPos);
        if (openParen !== -1 && openParen < bestPos) {
            const closeParen = scanRemaining.indexOf(')', openParen + 1);
            if (closeParen !== -1) {
                bestMatch = { pos: openParen, end: closeParen + 1, type: 'action' };
                bestPos = openParen;
            }
        }

        // 查找下一个 [想法]
        const openBracket = scanRemaining.indexOf('[', scanPos);
        if (openBracket !== -1 && openBracket < bestPos) {
            const closeBracket = scanRemaining.indexOf(']', openBracket + 1);
            if (closeBracket !== -1) {
                bestMatch = { pos: openBracket, end: closeBracket + 1, type: 'thought' };
                bestPos = openBracket;
            }
        }

        if (!bestMatch) {
            dialogueParts.push(scanRemaining.slice(scanPos));
            break;
        }

        // 收集标记前的纯文本作为对话
        if (bestMatch.pos > scanPos) {
            const segment = scanRemaining.slice(scanPos, bestMatch.pos).trim();
            if (segment) dialogueParts.push(segment);
        }

        // 根据标记类型分类
        if (bestMatch.type === 'action') {
            const actionContent = scanRemaining.slice(bestMatch.pos + 1, bestMatch.end - 1).trim();
            if (actionContent) {
                action += ' ' + '(' + actionContent + ')';
            }
        } else if (bestMatch.type === 'thought') {
            const thoughtContent = scanRemaining.slice(bestMatch.pos + 1, bestMatch.end - 1).trim();
            if (thoughtContent) {
                thought += (thought ? ' ' : '') + thoughtContent;
            }
        }

        scanPos = bestMatch.end;
    }

    // 合并对话部分
    const dialogue = dialogueParts.join(' ').trim();

    // 构建格式化内容字符串
    let formattedContent = '';
    if (action) formattedContent += action;
    if (dialogue) formattedContent += dialogue;
    if (thought) formattedContent += '[' + thought + ']';
    if (!formattedContent) formattedContent = trimmed;

    // 查找对应的角色索引 — 精确匹配优先，模糊匹配兜底
    let charIdx = defaultCharIndex;
    if (charName) {
        // 1. 精确匹配
        const exact = state.characters.findIndex(c => c.name === charName);
        if (exact >= 0) {
            charIdx = exact;
        } else {
            // 2. 模糊匹配：检测开场白角色名与设定名不一致
            // 策略 A：首字匹配（"林鸢" → "凛夜" 首字不同，跳过）
            // 策略 B：编辑距离 ≤ 1 的近似名
            let bestDist = Infinity;
            let bestIdx = -1;
            for (let i = 0; i < state.characters.length; i++) {
                const cName = state.characters[i].name;
                if (!cName) continue;
                // 如果开场名包含设定名或设定名包含开场名（子串匹配）
                if (cName.includes(charName) || charName.includes(cName)) {
                    charIdx = i;
                    rpLog('INFO', 'CHAR-NAME', `模糊匹配(子串): "${charName}" → "${cName}" (idx=${i})`);
                    break;
                }
                // 编辑距离
                const dist = levenshteinDistance(charName, cName);
                if (dist < bestDist && dist <= Math.max(1, Math.floor(charName.length * 0.5))) {
                    bestDist = dist;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0) {
                charIdx = bestIdx;
                rpLog('INFO', 'CHAR-NAME', `模糊匹配(编辑距离${bestDist}): "${charName}" → "${state.characters[bestIdx].name}" (idx=${bestIdx})`);
            } else {
                // 3. 完全找不到匹配 → 保留原名字（不崩溃），但标记警告
                rpLog('warn', 'CHAR-NAME', `⚠️ 未找到匹配角色: "${charName}"，使用默认索引 ${defaultCharIndex}`);
            }
        }
    }

    return { charName, charIdx, action, dialogue, thought, formattedContent };
}

// 简易编辑距离（Levenshtein Distance）
function levenshteinDistance(a, b) {
    if (!a) return b.length;
    if (!b) return a.length;
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[b.length][a.length];
}
