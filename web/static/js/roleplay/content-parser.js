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

    // 查找对应的角色索引
    let charIdx = defaultCharIndex;
    if (charName) {
        const found = state.characters.findIndex(c => c.name === charName);
        if (found >= 0) charIdx = found;
    }

    return { charName, charIdx, action, dialogue, thought, formattedContent };
}
