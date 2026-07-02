// === 角色分割器 ===
// 按 ┆ 分隔符分割多角色对话，或使用 "名字:" 模式兜底拆分

/**
 * 分割角色对话段
 * @param {string} text - 去除场景和建议回复后的对话文本
 * @returns {string[]} 各角色对话段数组
 */
export function splitCharParts(text) {
    let charParts = text.split('┆').filter(s => s.trim());

    // 如果 ┆ 分割后只有 1 段，尝试用 "名字:" 模式拆分多角色
    if (charParts.length === 1) {
        const singleText = charParts[0].trim();
        // 匹配模式：可选前导空白 + 汉字/字母 + 冒号(:或：)，后面跟着角色内容
        const nameColonPattern = /(?:^|\n|\s+)([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_•·]{0,10})([:：])(?=\s)/g;
        const nameMatches = [];
        let m;
        while ((m = nameColonPattern.exec(singleText)) !== null) {
            // 确保冒号前面不是 (动作 开头的标记
            const beforeColon = singleText.substring(Math.max(0, m.index - 5), m.index);
            if (!beforeColon.includes('(')) {
                const colonEnd = m.index + m[0].length;
                const nameStart = m.index + (m[0].length - m[1].length - m[2].length);
                nameMatches.push({ index: nameStart, name: m[1].trim(), colonEnd: colonEnd });
            }
        }

        if (nameMatches.length >= 1) {
            const splitParts = [];
            // 第一段：第一个命名角色之前的所有内容（无名角色）
            const firstSeg = singleText.substring(0, nameMatches[0].index).trim();
            if (firstSeg) splitParts.push(firstSeg);
            // 后续段落：每个命名角色的 "名字: 内容"
            for (let i = 0; i < nameMatches.length; i++) {
                const nm = nameMatches[i];
                const nextStart = (i + 1 < nameMatches.length) ? nameMatches[i + 1].index : singleText.length;
                const seg = singleText.substring(nm.index, nextStart).trim();
                if (seg) splitParts.push(seg);
            }
            charParts = splitParts.filter(s => s);
            if (typeof rpLog !== 'undefined') {
                rpLog('INFO', 'PARSE-CHAR', `使用 "名字:" 模式拆分为 ${charParts.length} 段: ${charParts.map(p => p.slice(0, 40)).join(' | ')}`);
            }
        }
    }

    return charParts;
}
