// === Section: 结构化数据解析器 ===
// 基于 | 分隔符的 TSV/CSV 混合解析
// 支持：回复选项（简单数组）、角色对象（TSV）

function parseDelimited(text) {
    if (!text || typeof text !== 'string') return null;
    text = text.trim();

    // === 清理 LLM 常见的 markdown 包裹 ===
    // 去掉 ```tsv / ```json / ``` 等代码块标记
    text = text.replace(/^```(?:tsv|csv|txt|text)?\s*\n/i, '').replace(/\n```\s*$/i, '');
    // 去掉首尾可能的 --- 分隔线
    text = text.replace(/^-{3,}\s*$/gm, '').trim();

    // === 预处理：合并被意外拆分的行 ===
    // 如果 LLM 在值中用了换行符（比如 background 字段跨行），需要合并
    // 策略：先找表头行，然后只按表头行数来分割
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    // === 寻找表头行：在所有行中查找包含标准字段名的行 ===
    const standardFields = ['name', 'age', 'gender', 'appearance', 'personality', 'background', 'relationship', 'motivation', 'secret', 'speechStyle', 'imageStyle', 'imageFace', 'imageHair', 'imageBody', 'imageClothes', 'imageEnvironment'];
    
    let headerRowIndex = -1;
    let headerParts = null;
    
    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split('|').map(s => s.trim().toLowerCase());
        let matchCount = 0;
        for (const p of parts) {
            if (standardFields.includes(p)) matchCount++;
        }
        if (matchCount >= 5) {
            headerRowIndex = i;
            headerParts = lines[i].split('|').map(s => s.trim());
            break;
        }
    }
    
    // 如果找到了表头，重新解析：从表头行开始，按 | 的数量合并后续行
    if (headerRowIndex >= 0 && headerParts) {
        const expectedCols = headerParts.length;
        const dataLines = [];
        let currentLine = '';
        
        for (let i = headerRowIndex + 1; i < lines.length; i++) {
            currentLine += (currentLine ? '\n' : '') + lines[i];
            // 检查当前累计的行是否有足够的 | 分隔符
            const colCount = (currentLine.match(/\|/g) || []).length + 1;
            if (colCount >= expectedCols) {
                dataLines.push(currentLine);
                currentLine = '';
            }
        }
        // 处理剩余的碎片行
        if (currentLine.trim()) {
            dataLines.push(currentLine);
        }
        
        if (dataLines.length > 0) {
            const virtualLines = [lines[headerRowIndex], ...dataLines];
            const result = parseTsvTable(virtualLines, headerParts);
            if (result) {
                rpLog('info', 'PARSE', `TSV 解析成功: ${result.length} 个角色 (表头 ${expectedCols} 列)`);
                return result;
            }
        }
    }
    
    // 情况 2：没有找到标准字段名 → LLM 可能省略了表头
    // 使用已知字段名作为默认表头
    if (headerRowIndex < 0) {
        const defaultHeaders = ['name','age','gender','appearance','personality','background','relationship','motivation','secret','speechStyle','imageStyle','imageFace','imageHair','imageBody','imageClothes','imageEnvironment'];
        // 把全部行都当作数据行处理
        const virtualLines = [...lines]; // 直接用所有行，parseTsvTable 会从 index=1 开始
        // 但 parseTsvTable 期望 index=0 是 header，所以需要加一个虚拟 header
        virtualLines.unshift(defaultHeaders.join('|'));
        const result = parseTsvTable(virtualLines, defaultHeaders);
        if (result) return result;
    }
    
    // 情况 3：单行或含 key|value 格式 → 对象解析
    // 尝试 | 分隔的 key|value 对
    const hasKeyValue = lines.some(l => l.includes('|') && l.split('|').some(p => /^[a-zA-Z_\u4e00-\u9fa5]+$/.test(p.trim())));
    
    if (hasKeyValue) {
        return parseKeyValLines(lines);
    }
    
    // 兜底：逐行按 | 分割，每行尝试构建对象
    const allLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const fallbackResult = [];
    for (const line of allLines) {
        const parts = line.split('|').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
            fallbackResult.push({ name: parts[0], raw: line });
        }
    }
    if (fallbackResult.length > 0) {
        rpLog('info', 'PARSE', `兜底逐行解析成功 ${fallbackResult.length} 行`);
        return fallbackResult;
    }
    return null;
}

// 解析 TSV 表格（多行，首行为 header）
function parseTsvTable(lines, headers) {
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = splitPipe(lines[i]);
        
        // 修复：允许列数少于 header 数量（LLM 可能省略尾部列如 imagePrompt）
        // 用空字符串填充缺失列，而不是跳过整行
        const paddedVals = [];
        for (let j = 0; j < headers.length; j++) {
            paddedVals.push((vals[j] || '').trim());
        }
        
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h.trim()] = paddedVals[idx] || '';
        });
        
        // 过滤掉 name 为空的行
        if (obj.name && obj.name.trim()) {
            result.push(obj);
        }
    }
    return result.length > 0 ? result : null;
}

// 解析 key|value 格式的多行对象（兼容旧格式，逐步弃用）
function parseKeyValLines(lines) {
    // 尝试 | 分隔的 key|value 对（无 ◆ ◇ ▸）
    const obj = {};
    for (const line of lines) {
        const pipeIdx = line.indexOf('|');
        if (pipeIdx === -1) continue;
        const key = line.substring(0, pipeIdx).trim();
        const value = line.substring(pipeIdx + 1).trim();
        if (key) obj[key] = value;
    }
    return Object.keys(obj).length > 0 ? obj : null;
}

// 安全的 | 分割：处理值中包含 | 的情况
function splitPipe(str) {
    const parts = str.split('|');
    if (parts.length <= 16) return parts;
    // 列数过多：前 15 列保持原样，剩余全部合并到最后一列（imageEnvironment 通常最长）
    const result = parts.slice(0, 15);
    result.push(parts.slice(15).join('|'));
    return result;
}
