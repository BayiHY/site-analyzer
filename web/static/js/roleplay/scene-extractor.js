// === 场景提取器 ===
// 从 LLM 回复中提取场景描述，支持多种格式
// 2026-07-04 修复：兼容 LLM 输出 {场景描述及旁白} 标签行的情况

/**
 * 检测一行是否是角色行（:角色名: 格式）
 */
function isCharLine(line) {
    const trimmed = line.trim();
    return /^:[\u4e00-\u9fa5a-zA-Z0-9_\u2022\u00B7·]{1,12}:\s*[\(\u300c]/.test(trimmed);
}

/**
 * 检测一行是否是建议回复行
 */
function isReplyLine(line) {
    return /^<[^>]+>/.test(line.trim());
}

/**
 * 检测一行是否是纯标签行（如 {场景描述及旁白}、{场景}、{旁白} 等）
 * 这些标签行应该被跳过，不作为场景内容
 */
function isLabelLine(line) {
    const trimmed = line.trim();
    // 匹配 {中文标签} 形式的单行标签
    if (/^\{[\u4e00-\u9fa5a-zA-Z\s]+\}$/.test(trimmed)) {
        // 排除真正的场景描述（花括号内包含大量标点、换行、长文本）
        // 标签行通常很短，且不含标点符号
        const inner = trimmed.slice(1, -1).trim();
        if (inner.length < 50 && !/[，。！？、；：""''【】]/.test(inner)) {
            return true;
        }
    }
    return false;
}

/**
 * 提取场景文本
 * @returns {{ sceneText: string|null, remaining: string }}
 */
export function extractScene(text) {
    let sceneText = null;
    let remaining = text;

    // 清理 markdown 代码块包裹
    let cleaned = text.replace(/^```(?:json|text)?\s*\n/i, '').replace(/\n```\s*$/i, '');
    cleaned = cleaned.replace(/^-{3,}\s*$/gm, '').trim();

    const lines = cleaned.split('\n');

    // === 策略 1: 第一行是 {场景描述及旁白} 这样的标签行 → 跳过，取下一行为场景 ===
    if (lines.length >= 2 && isLabelLine(lines[0])) {
        // 标签行之后，找到第一个非空行作为场景开始
        let sceneStart = 1;
        while (sceneStart < lines.length && lines[sceneStart].trim() === '') sceneStart++;
        
        if (sceneStart < lines.length) {
            // 从 sceneStart 扫描到第一个角色行或回复行为止
            let sceneEnd = sceneStart;
            for (let i = sceneStart; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed === '') continue;
                if (isCharLine(trimmed) || isReplyLine(trimmed)) {
                    sceneEnd = i;
                    break;
                }
            }
            
            if (sceneEnd > sceneStart) {
                const sceneLines = [];
                for (let i = sceneStart; i < sceneEnd; i++) {
                    if (lines[i].trim() !== '') sceneLines.push(lines[i]);
                }
                sceneText = sceneLines.join('\n').trim();
                
                // 计算 remaining 的起始位置
                let charPos = 0;
                for (let i = 0; i < sceneEnd; i++) {
                    charPos += lines[i].length + 1;
                }
                remaining = cleaned.slice(charPos);
                
                if (typeof rpLog !== 'undefined') {
                    rpLog('INFO', 'PARSE-SCENE', `策略1: 跳过标签行后提取场景, 长度=${sceneText.length}`);
                }
                return { sceneText, remaining };
            }
        }
    }

    // === 策略 2: 第一行就是 {场景描述}（花括号包裹的真实内容） ===
    const firstLineMatch = cleaned.match(/^(\{[^}]+\})\n/);
    if (firstLineMatch) {
        const bracketContent = firstLineMatch[1];
        const inner = bracketContent.slice(1, -1).trim();
        
        // 如果花括号内的内容看起来是场景描写（有标点符号），直接提取
        if (/[，。！？、；：]/.test(inner)) {
            sceneText = inner;
            remaining = cleaned.slice(firstLineMatch[0].length);
            if (typeof rpLog !== 'undefined') {
                rpLog('INFO', 'PARSE-SCENE', `策略2: 花括号场景提取成功, 长度=${sceneText.length}`);
            }
            return { sceneText, remaining };
        }
        // 否则当作标签行，走策略 3
    }

    // === 策略 3: 从开头扫描到第一个 :角色名: 行或 <回复> 行为止，中间所有文本都是场景 ===
    let sceneEndIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === '') continue;
        
        if (isCharLine(trimmed) || isReplyLine(trimmed)) {
            sceneEndIndex = i;
            break;
        }
    }

    if (sceneEndIndex > 0) {
        const sceneLines = [];
        for (let i = 0; i < sceneEndIndex; i++) {
            if (lines[i].trim() !== '') {
                sceneLines.push(lines[i]);
            }
        }
        
        if (sceneLines.length > 0) {
            sceneText = sceneLines.join('\n').trim();
            let charPos = 0;
            for (let i = 0; i < sceneEndIndex && charPos < cleaned.length; i++) {
                charPos += lines[i].length + 1;
            }
            remaining = cleaned.slice(charPos);
            if (typeof rpLog !== 'undefined') {
                rpLog('INFO', 'PARSE-SCENE', `策略3: 隐式场景提取成功, 长度=${sceneText.length}`);
            }
            return { sceneText, remaining };
        }
    }

    // === 策略 4: 没有 :角色名: 格式，尝试从 (动作)对话[想法] 段落中提取角色行 ===
    // 当 LLM 没有输出 :角色名: 前缀时，逐行检测 (xxx)对话[yyy] 格式
    // 如果某行以 ( 开头且包含 「 或 [ ，视为角色段落，将其与场景分离
    const charParagraphPattern = /^\([^)]*\)[^\[]*\[/;
    const hasAnyCharParagraph = lines.some(l => charParagraphPattern.test(l.trim()));

    if (hasAnyCharParagraph && sceneEndIndex === 0) {
        // 所有行都被当作场景了，现在重新划分
        let sceneLines = [];
        let charLines = [];
        let inScene = true;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed === '') {
                // 空行：如果在场景中，保留为场景分隔；如果在角色段中，跳过
                if (inScene) {
                    sceneLines.push(lines[i]);
                }
                continue;
            }

            if (charParagraphPattern.test(trimmed)) {
                // 这是一行角色段落
                inScene = false;
                charLines.push(lines[i]);
            } else if (!inScene) {
                // 已在角色段落区域，继续追加
                charLines.push(lines[i]);
            } else {
                // 仍在场景区域
                sceneLines.push(lines[i]);
            }
        }

        // 如果提取到了角色段落，返回分离结果
        if (charLines.length > 0) {
            sceneText = sceneLines.filter(l => l.trim()).join('\n').trim() || null;
            // 计算 remaining 的起始位置：按原始 lines 顺序累加，遇到第一个 charLines 中的行就停止
            let charPos = 0;
            for (let i = 0; i < lines.length; i++) {
                if (charLines.includes(lines[i])) {
                    // 找到第一个角色行，从此处截取
                    break;
                }
                charPos += lines[i].length + 1;
            }
            remaining = cleaned.slice(charPos);

            if (typeof rpLog !== 'undefined') {
                rpLog('INFO', 'PARSE-SCENE', `策略4: 从(动作)段落提取角色行 ${charLines.length} 段, 场景=${sceneText ? sceneText.length : 0}字符`);
            }
            return { sceneText, remaining };
        }
    }

    // === 策略 5: 完全没有场景和角色行 ===
    if (typeof rpLog !== 'undefined') {
        rpLog('INFO', 'PARSE-SCENE', '无场景描述，返回 null');
    }
    return { sceneText: null, remaining: text };
}
