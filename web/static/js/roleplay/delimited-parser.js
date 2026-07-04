// === Section: 结构化数据解析器 ===
// 基于 | 分隔符的 TSV/CSV 混合解析
// 支持：回复选项（简单数组）、角色对象（TSV）

function parseDelimited(text) {
    if (!text || typeof text !== 'string') return null;
    text = text.trim();

    // === 清理 LLM 常见的 markdown 包裹 ===
    text = text.replace(/^```(?:tsv|csv|txt|text)?\s*\n/i, '').replace(/\n```\s*$/i, '');
    text = text.replace(/^-{3,}\s*$/gm, '').trim();

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;

    // 固定 18 列定义（含 ttsPitch/ttsRate）
    const FIXED_HEADERS = ['name','age','gender','appearance','personality','background','relationship','motivation','secret','speechStyle','voice','ttsPitch','ttsRate','imageFace','imageHair','imageBody','imageClothes','imageEnvironment'];
    const EXPECTED_COLS = FIXED_HEADERS.length;
    const HEADER_PIPE_COUNT = EXPECTED_COLS - 1;

    // 过滤掉表头行（LLM 可能误输出）
    const headerPattern = /^(name\s*\|\s*age\s*\||name\|age\|)/i;
    const dataLines = lines.filter(l => !headerPattern.test(l));
    if (dataLines.length === 0) return null;

    // 按角色行分割：空行或新角色行（中文名字开头 + pipe 足够）作为分界
    const blocks = [];
    let currentBlock = '';
    for (const line of dataLines) {
        const pipeCount = (line.match(/\|/g) || []).length;
        const isNewChar = /^[\u4e00-\u9fff]{1,4}\|/.test(line);
        const isDigitStart = /^\d+\|/.test(line);

        if (currentBlock && (isNewChar || isDigitStart || pipeCount >= HEADER_PIPE_COUNT)) {
            blocks.push(currentBlock.trim());
            currentBlock = line;
        } else {
            currentBlock = (currentBlock ? currentBlock + '\n' : '') + line;
        }
    }
    if (currentBlock.trim()) blocks.push(currentBlock.trim());

    rpLog('info', 'CHARS-PARSE', `原始 ${lines.length} 行 → 过滤表头后 ${dataLines.length} 行 → ${blocks.length} 个角色块`);

    // 解析每个角色块
    const result = [];
    for (const block of blocks) {
        const obj = parseSingleCharRow(block, EXPECTED_COLS, FIXED_HEADERS);
        if (obj && obj.name && obj.name.trim()) {
            result.push(obj);
        }
    }

    if (result.length > 0) {
        rpLog('info', 'CHARS-PARSE', `最终有效角色: ${result.map(r => r.name).join(', ')}`);
        return result;
    }
    return null;
}

// 解析单个角色行（处理跨行合并的情况）
function parseSingleCharRow(rawLine, expectedCols, headers) {
    // 先按 | 分割
    const vals = splitPipe(rawLine, expectedCols);
    
    let paddedVals;
    if (vals.length === expectedCols) {
        paddedVals = vals.slice();
    } else if (vals.length > expectedCols) {
        paddedVals = vals.slice(0, expectedCols);
    } else {
        paddedVals = alignWithAnchor(vals, headers);
    }
    
    const obj = {};
    headers.forEach((h, idx) => {
        obj[h.trim()] = (paddedVals[idx] || '').trim();
    });
    
    rpLog('info', 'PARSE-CHECK', `${obj.name}: 进入 fixColumnMisalignment 前 ttsPitch=${obj.ttsPitch || '(空)'} ttsRate=${obj.ttsRate || '(空)'}`);
    fixColumnMisalignment(obj);
    return obj;
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
            // 策略：从右侧找到 voice 边界，以此为锚点，
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

// 智能列对齐：找到 voice 特征作为锚点，左右分别对齐
function alignWithAnchor(vals, headers) {
    const targetLen = headers.length;
    const missing = targetLen - vals.length;
    
    // 在 vals 中查找 voice 特征（"Neural"）
    // 从后往前找，因为 LLM 更可能省略前面的字段
    let anchorIdx = -1;
    for (let i = vals.length - 1; i >= 0; i--) {
        const v = (vals[i] || '').toLowerCase();
        if (v.includes('neural') || v.includes('zh-cn') || v.includes('en-us')) {
            anchorIdx = i;
            break;
        }
    }
    
    if (anchorIdx >= 0) {
        const voiceHeaderIdx = headers.findIndex(h => h === 'voice');
        const beforeCount = anchorIdx;
        const afterCount = vals.length - anchorIdx - 1;
        const expectedBefore = voiceHeaderIdx;
        const expectedAfter = targetLen - voiceHeaderIdx - 1;
        
        const beforeMissing = Math.max(0, expectedBefore - beforeCount);
        const afterMissing = Math.max(0, expectedAfter - afterCount);
        
        if (beforeMissing > 0 || afterMissing > 0) {
            const before = vals.slice(0, anchorIdx);
            const after = vals.slice(anchorIdx + 1);
            
            let afterPadded;
            if (afterMissing > 0) {
                // ttsPitch/ttsRate 智能填充：用 Hz/% 后缀区分
                const ttsSlots = ['', ''];  // [ttsPitch, ttsRate]
                let ai = 0;
                for (let ti = 0; ti < 2 && ai < after.length; ti++) {
                    if (ti === 0) {
                        // ttsPitch: 期望 Hz 值
                        if (/^[-+]?\d+Hz$/.test(after[ai].trim())) {
                            ttsSlots[0] = after[ai];
                            ai++;
                        }
                    } else {
                        // ttsRate: 期望 % 值
                        if (/^[-+]?\d+%$/.test(after[ai].trim())) {
                            ttsSlots[1] = after[ai];
                            ai++;
                        }
                    }
                }
                afterPadded = [...ttsSlots, ...after.slice(ai)];
            } else {
                afterPadded = [...after];
            }
            
            rpLog('info', 'PARSE', `  智能对齐：缺 before=${beforeMissing} after=${afterMissing}，Neural@${anchorIdx}`);
            return [...before, ...Array(beforeMissing).fill(''), vals[anchorIdx], ...afterPadded];
        }
        
        // 缺失在左边
        const paddedVals = [];
        for (let i = 0; i < missing; i++) paddedVals.push('');
        return paddedVals.concat(vals);
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
// threshold 必须等于表头列数（当前为 16）
function splitPipe(str, threshold) {
    const parts = str.split('|');
    const colThreshold = threshold || 16;
    if (parts.length <= colThreshold) return parts;
    // 列数过多：前 colThreshold-1 列保持原样，剩余全部合并到最后一列（imageEnvironment 通常最长）
    const result = parts.slice(0, colThreshold - 1);
    result.push(parts.slice(colThreshold - 1).join('|'));
    return result;
}

// === 列错位修复：检测 LLM 输出列偏移 ===
// 当 LLM 漏填中间列（如 secret、motivation）时，后面所有列会整体左移
// 检测 heuristic：如果 voice 字段包含风格词，说明列错位了
const VOICE_HEURISTIC = /Neural|zh-CN|en-US|voice_/i;

// 常见风格词列表（用于检测 imageFace 是否被填入了风格词）
// 包含新旧关键词，确保列错位检测覆盖所有可能
const STYLE_KEYWORDS = [
    // 新 41 细分关键词
    'akira toriyama style', 'rumiko takahashi style', 'studio ghibli hand-drawn cel',
    '80s toei cel animation', '90s jump shonen cel anime', '00s josei cel anime',
    'modern moe cel anime', 'y2k anime', 'seinen cel anime', 'trigger anime style',
    'three-tone cel shading', 'shonen jump manga', 'shoujo manga', 'gekiga manga',
    'webtoon korean color manhwa', 'doujinshi illustration', 'horror manga',
    'one piece manga style', 'berserk manga style', 'blender lowpoly cartoon render',
    'anime toon 3d render', 'pixar soft 3d cartoon', 'clay figure render',
    'miniature diorama render', 'chibi super deformed 3d', 'transparent watercolor wash',
    'heavy oil painting texture', 'digital thick paint illustration',
    'graphite pencil sketch', 'chinese ink wash painting', 'hard line ink line art',
    'neon cyberpunk illustration', 'vaporwave retro 80s art',
    'dark gothic fantasy illustration', 'flat vector minimal illustration',
    'pixel art 16bit retro game', 'unreal engine photoreal PBR', 'pop art screen print',
    // 兼容旧关键词
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

    // imageStyle 已移除，不再检测 voice 泄漏到 imageStyle
    // 直接检查 imageHair/imageBody/imageClothes/imageEnvironment 交叉错位
    checkCrossSwap(row, rawImageHair, rawImageBody, rawImageClothes, rawImageEnvironment);

    // 如果 imageFace 是风格词，清空（风格由系统全局注入）
    if (isStyleWord(rawImageFace)) {
        rpLog('info', 'PARSE-COL', `  修正: imageFace 包含风格词，清空`);
        row.imageFace = '';
    }

    rpLog('info', 'PARSE-COL', `  修复完成: ${JSON.stringify({
        imageFace: row.imageFace,
        imageHair: row.imageHair,
        imageBody: row.imageBody,
        imageClothes: row.imageClothes,
        imageEnvironment: row.imageEnvironment,
        voice: row.voice,
        ttsPitch: row.ttsPitch,
        ttsRate: row.ttsRate
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
