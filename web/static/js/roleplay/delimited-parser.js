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
    const standardFields = ['name', 'age', 'gender', 'appearance', 'personality', 'background', 'relationship', 'motivation', 'secret', 'speechStyle', 'voice', 'imageStyle', 'imageFace', 'imageHair', 'imageBody', 'imageClothes', 'imageEnvironment'];
    
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
        const headerPipeCount = expectedCols - 1;
        const dataLines = [];
        let currentLine = '';

        rpLog('info', 'CHARS-PARSE', `表头: ${expectedCols} 列, pipe数: ${headerPipeCount}, 原始行数: ${lines.length - headerRowIndex - 1}`);

        for (let i = headerRowIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            const linePipeCount = (line.match(/\|/g) || []).length;
            const isEmptyLine = line.trim() === '';
            const isNewCharacter = /^[\u4e00-\u9fff]{2,4}\|/.test(line);
            const isDigitStart = /^\d+\|/.test(line);

            // 修复 1：空行 → 立即保存当前行并开始新行
            if (isEmptyLine) {
                if (currentLine.trim()) {
                    dataLines.push(currentLine);
                    rpLog('info', 'CHARS-PARSE', `  空行分隔: 保存当前行 "${currentLine.slice(0,40)}..."`);
                }
                currentLine = '';
                continue;
            }

            // 修复 2：新角色行检测（中文名字开头 或 数字开头 + pipe数足够）
            if (currentLine && (linePipeCount >= headerPipeCount || isNewCharacter || isDigitStart)) {
                dataLines.push(currentLine);
                currentLine = line;
            } else if (currentLine) {
                // 继续合并碎片
                currentLine += '\n' + line;
            } else {
                currentLine = line;
            }
        }
        // 保存最后一个累积行
        if (currentLine.trim()) {
            dataLines.push(currentLine);
        }

        rpLog('info', 'CHARS-PARSE', `分块结果: ${dataLines.length} 个块, 原始行数: ${lines.length - headerRowIndex - 1}`);

        if (dataLines.length > 0) {
            const virtualLines = [lines[headerRowIndex], ...dataLines];
            const result = parseTsvTable(virtualLines, headerParts);
            if (result) {
                // 修复 3：二次校验 — 如果解析结果少于块数，说明有合并问题
                if (result.length < dataLines.length) {
                    rpLog('warn', 'CHARS-PARSE', `二次校验: ${dataLines.length} 个块 → ${result.length} 个角色，可能有合并问题`);
                }
                rpLog('info', 'CHARS-PARSE', `最终有效角色列表: ${result.map(r => r.name).join(', ')}`);
                rpLog('info', 'PARSE', `TSV 解析成功: ${result.length} 个角色 (表头 ${expectedCols} 列)`);
                return result;
            }
        }
    }
    
    // 情况 2：没有找到标准字段名 → LLM 可能省略了表头
    // 使用已知字段名作为默认表头
    if (headerRowIndex < 0) {
        const defaultHeaders = ['name','age','gender','appearance','personality','background','relationship','motivation','secret','speechStyle','voice','imageStyle','imageFace','imageHair','imageBody','imageClothes','imageEnvironment'];
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
    const expectedCols = headers.length;
    for (let i = 1; i < lines.length; i++) {
        const vals = splitPipe(lines[i], expectedCols);
        
        let paddedVals;
        if (vals.length === headers.length) {
            paddedVals = vals.slice();
        } else if (vals.length > headers.length) {
            // 超出列：splitPipe 已经把多余的合并到最后一列，直接用
            paddedVals = vals.slice(0, headers.length);
        } else {
            // 缺少列：智能检测缺失位置
            // 策略：从右侧找到 voice/imageStyle 边界，以此为锚点，
            // 左侧字段从左对齐，右侧字段从右对齐，中间缺失填空
            paddedVals = alignWithAnchor(vals, headers);
        }
        
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h.trim()] = (paddedVals[idx] || '').trim();
        });
        
        // 过滤掉 name 为空的行
        if (obj.name && obj.name.trim()) {
            // 检测并修复列错位
            fixColumnMisalignment(obj);
            result.push(obj);
        }
    }
    return result.length > 0 ? result : null;
}

// 智能列对齐：找到 voice/imageStyle 边界作为锚点，左右分别对齐
function alignWithAnchor(vals, headers) {
    const targetLen = headers.length;
    const missing = targetLen - vals.length;
    
    // 在 vals 中查找 voice 特征（"Neural"）或 imageStyle 风格词
    // 从后往前找，因为 LLM 更可能省略前面的字段
    let anchorIdx = -1;
    for (let i = vals.length - 1; i >= 0; i--) {
        const v = (vals[i] || '').toLowerCase();
        if (v.includes('neural') || v.includes('zh-cn') || v.includes('en-us')) {
            anchorIdx = i;
            break;
        }
    }
    
    // 如果没找到 voice，找 imageStyle 风格词
    if (anchorIdx === -1) {
        for (let i = vals.length - 1; i >= 0; i--) {
            const v = (vals[i] || '').toLowerCase();
            if (STYLE_KEYWORDS.some(s => v.includes(s))) {
                anchorIdx = i;
                break;
            }
        }
    }
    
    if (anchorIdx >= 0) {
        // 找到了锚点：anchorIdx 位置的 vals 对应某个 header
        // 从锚点往左：vals[0..anchorIdx-1] 对应 headers[0..anchorIdx-1]
        // 从锚点往右：vals[anchorIdx+1..] 对应 headers[anchorIdx+1..]
        // 如果 vals.length < targetLen，说明锚点左边或右边有缺失
        // 由于我们是从右往左找的锚点，锚点右边的 vals 是连续的
        // 所以缺失的字段在锚点左边
        
        // 计算锚点在 headers 中的位置：应该是 anchorIdx + missing
        // （因为左边缺了 missing 个字段）
        const anchorHeaderIdx = anchorIdx + missing;
        
        // 构建 paddedVals：左边补 missing 个空字符串
        paddedVals = [];
        for (let i = 0; i < missing; i++) {
            paddedVals.push('');
        }
        paddedVals = paddedVals.concat(vals);
        
        rpLog('info', 'PARSE', `  智能对齐：在 ${anchorIdx} 找到 ${anchorIdx + missing >= 0 && anchorHeaderIdx < headers.length ? headers[anchorHeaderIdx] : '锚点'}，左侧补齐 ${missing} 列`);
        return paddedVals;
    }
    
    // 找不到锚点 → 右对齐补齐（LLM 更可能省略末尾字段如 imageEnvironment）
    rpLog('info', 'PARSE', `  找不到锚点，右对齐补齐 ${missing} 列`);
    paddedVals = [...vals];
    while (paddedVals.length < targetLen) {
        paddedVals.push('');
    }
    return paddedVals;
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
// threshold 必须等于表头列数（当前为 17）
function splitPipe(str, threshold) {
    const parts = str.split('|');
    const colThreshold = threshold || 17;
    if (parts.length <= colThreshold) return parts;
    // 列数过多：前 colThreshold-1 列保持原样，剩余全部合并到最后一列（imageEnvironment 通常最长）
    const result = parts.slice(0, colThreshold - 1);
    result.push(parts.slice(colThreshold - 1).join('|'));
    return result;
}

// === 列错位修复：检测 LLM 输出列偏移 ===
// 当 LLM 漏填中间列（如 secret、motivation）时，后面所有列会整体左移
// 检测 heuristic：如果 imageStyle 字段包含 TTS voice 特征（"Neural"），说明列错位了
const VOICE_HEURISTIC = /Neural|zh-CN|en-US|voice_/i;

// 常见风格词列表（用于检测 imageFace 是否被填入了风格词）
const STYLE_KEYWORDS = [
    'cel shading', 'watercolor', 'oil painting', 'anime', 'pencil sketch',
    'comic book', 'photorealistic', '3d render', 'studio ghibli',
    'cyberpunk', 'fantasy art', 'chibi', 'pixel art', 'ink wash',
    'vaporwave', 'dark fantasy', 'line art', 'concept art',
    'unreal engine', 'blender cartoon', 'thick paint', 'flat design'
];

function isStyleWord(val) {
    if (!val) return false;
    return STYLE_KEYWORDS.some(s => val.toLowerCase().includes(s));
}

// 检测值是否更像发型描述（用于判断 imageHair/imageBody 是否错位）
function isHairLike(val) {
    if (!val) return false;
    const lower = val.toLowerCase();
    return /hair|ponytail|bob|twin tail|braid|bangs|parted|platinum|blonde|silver|black hair|brown hair|red hair|long hair|short hair|curly|straight hair|pigtail/i.test(lower);
}

// 检测值是否更像体型描述
function isBodyLike(val) {
    if (!val) return false;
    const lower = val.toLowerCase();
    return /(slender|athletic|petite|toned|graceful|tall|compact|slim|curvy|muscular|figure|posture|build|stature)/i.test(lower);
}

// 检测值是否更像服装描述
function isClothesLike(val) {
    if (!val) return false;
    const lower = val.toLowerCase();
    return /(uniform|shirt|dress|skirt|coat|jacket|hoodie|blazer|sweater|sneakers|boots|sash|blouse|cardigan|tie|scarf|ribbon|accessories)/i.test(lower);
}

// 检测值是否更像环境/光影描述
function isEnvLike(val) {
    if (!val) return false;
    const lower = val.toLowerCase();
    return /(sunlight|moonlight|mist|shadow|glow|lighting|background|interior|exterior|dusk|dawn|rain|snow|cloud|beam|reflection|bokeh|atmosphere|room|hallway|court|garden)/i.test(lower);
}

function fixColumnMisalignment(row) {
    const rawImageStyle = row.imageStyle || '';
    const rawVoice = row.voice || '';
    const rawImageFace = row.imageFace || '';
    const rawImageHair = row.imageHair || '';
    const rawImageBody = row.imageBody || '';
    const rawImageClothes = row.imageClothes || '';
    const rawImageEnvironment = row.imageEnvironment || '';

    // 检查跨行污染：如果任何 image 字段包含 | 分隔符，说明整行数据混入
    const pipeFields = ['imageHair', 'imageBody', 'imageClothes', 'imageEnvironment', 'imageFace'];
    let hasCrossRowContamination = false;
    for (const f of pipeFields) {
        const val = row[f] || '';
        if (val.includes('|')) {
            rpLog('warn', 'PARSE-COL', `  跨行污染检测: ${f} 包含 | 分隔符，清空`);
            row[f] = '';
            hasCrossRowContamination = true;
        }
    }
    if (hasCrossRowContamination) {
        rpLog('info', 'PARSE-COL', `  跨行污染修复完成（清空了损坏字段，生图将使用降级模式）`);
        return row;
    }

    // 快速退出：如果没有 voice 泄漏，也没有风格词错位，直接返回
    // 注意：rawVoice 匹配 VOICE_HEURISTIC 不代表有问题 —— 它可能已经在正确位置
    // 只有当 rawImageStyle 匹配 voice 特征时，才说明 voice 真的泄漏到了 imageStyle
    if (!VOICE_HEURISTIC.test(rawImageStyle)) {
        // voice 没有泄漏到 imageStyle，检查 cross-swap 即可
        checkCrossSwap(row, rawImageHair, rawImageBody, rawImageClothes, rawImageEnvironment);
        return row;
    }

    rpLog('warn', 'PARSE-COL', `━━━ 检测到列错位，开始修复 ━━━`);
    rpLog('warn', 'PARSE-COL', `  原始: imageStyle="${rawImageStyle}" | imageFace="${rawImageFace.slice(0,60)}" | imageHair="${rawImageHair.slice(0,60)}" | imageBody="${rawImageBody.slice(0,60)}" | imageClothes="${rawImageClothes.slice(0,60)}" | imageEnvironment="${rawImageEnvironment.slice(0,60)}"`);

    // 策略：
    // 1. 把 voice 值恢复到 voice 列
    // 2. 清空 imageStyle（后续用 state.story.imageStyle 兜底）
    // 3. 检查 imageBody/imageClothes/imageEnvironment 是否互相串了，用语义检测修复
    // 4. 如果 imageFace 是风格词，清空

    // 恢复 voice
    if (VOICE_HEURISTIC.test(rawImageStyle)) {
        row.voice = rawImageStyle;
        rpLog('info', 'PARSE-COL', `  修正: voice ← imageStyle="${row.voice}"`);
    } else if (VOICE_HEURISTIC.test(rawVoice)) {
        rpLog('info', 'PARSE-COL', `  voice 已在正确位置`);
    }

    // 清空 imageStyle
    row.imageStyle = '';
    rpLog('info', 'PARSE-COL', `  清空 imageStyle（后续使用 state.story.imageStyle 兜底）`);

    // 如果 imageFace 是风格词，清空
    if (isStyleWord(rawImageFace)) {
        rpLog('info', 'PARSE-COL', `  修正: imageFace="${rawImageFace}" 是风格词，清空`);
        row.imageFace = '';
    }

    // 检查 imageBody/imageClothes/imageEnvironment 是否错位
    checkCrossSwap(row, rawImageHair, rawImageBody, rawImageClothes, rawImageEnvironment);

    rpLog('info', 'PARSE-COL', `  修复完成: ${JSON.stringify({
        imageStyle: row.imageStyle,
        imageFace: row.imageFace,
        imageHair: row.imageHair,
        imageBody: row.imageBody,
        imageClothes: row.imageClothes,
        imageEnvironment: row.imageEnvironment,
        voice: row.voice
    })}`);

    return row;
}

// 检测 imageBody/imageClothes/imageEnvironment 是否互相串了
// 注意：只有在 LLM 确实漏填了中间列时才需要修复。
// 现在 parseTsvTable 已经做了右对齐补齐，大部分情况不需要额外修复。
// 此函数仅在检测到明确的交叉错位时才修正，避免过度修复。
function checkCrossSwap(row, hairVal, bodyVal, clothesVal, envVal) {
    // 如果 bodyVal 看起来像发型 → 说明 hair 和 body 串了
    // 如果 clothesVal 看起来像体型 → 说明 body 和 clothes 串了
    // 如果 envVal 看起来像服装 → 说明 clothes 和 env 串了

    let swapped = false;

    // body 值如果是发型 → 移到 hair
    if (isHairLike(bodyVal) && !isHairLike(hairVal)) {
        rpLog('info', 'PARSE-COL', `  交换: imageBody(发型) ↔ imageHair`);
        const temp = row.imageHair;
        row.imageHair = bodyVal;
        row.imageBody = temp || '';
        swapped = true;
    }

    // clothes 值如果是体型 → 移到 body
    if (isBodyLike(clothesVal) && !isBodyLike(bodyVal)) {
        rpLog('info', 'PARSE-COL', `  交换: imageClothes(体型) ↔ imageBody`);
        const temp = row.imageBody;
        row.imageBody = clothesVal;
        row.imageClothes = temp || '';
        swapped = true;
    }

    // env 值如果是服装 → 移到 clothes
    if (isClothesLike(envVal) && !isClothesLike(clothesVal)) {
        rpLog('info', 'PARSE-COL', `  交换: imageEnvironment(服装) ↔ imageClothes`);
        const temp = row.imageClothes;
        row.imageClothes = envVal;
        row.imageEnvironment = temp || '';
        swapped = true;
    }

    // env 值如果是发型 → 移到 hair
    if (isHairLike(envVal) && !isHairLike(hairVal)) {
        rpLog('info', 'PARSE-COL', `  交换: imageEnvironment(发型) ↔ imageHair`);
        const temp = row.imageHair;
        row.imageHair = envVal;
        row.imageEnvironment = temp || '';
        swapped = true;
    }

    // clothes 值如果是环境 → 移到 env
    if (isEnvLike(clothesVal) && !isEnvLike(envVal)) {
        rpLog('info', 'PARSE-COL', `  交换: imageClothes(环境) ↔ imageEnvironment`);
        const temp = row.imageEnvironment;
        row.imageEnvironment = clothesVal;
        row.imageClothes = temp || '';
        swapped = true;
    }

    if (swapped) {
        rpLog('info', 'PARSE-COL', `  字段交叉修复完成`);
    }
}
