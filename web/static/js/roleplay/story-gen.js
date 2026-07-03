// === Section: 世界观生成 ===
// 第一阶段：基于世界观因子生成故事骨架 + 分隔符文本解析

App.generateWorldview = async function(userInspiration, options = {}) {
    let factors, factorPrompt;
    
    if (userInspiration && userInspiration.trim().length > 0) {
        // 有用户灵感：跳过随机因子，完全以灵感为核心
        rpLog('info', 'WORLDVIEW', '用户提供了灵感方向，跳过随机因子');
        factors = null;
        factorPrompt = '';
    } else {
        // 无灵感：使用随机因子
        factors = App.WorldviewFactors.roll();
        factorPrompt = App.WorldviewFactors.toPrompt(factors);
        rpLog('info', 'WORLDVIEW', '随机因子: ' + JSON.stringify({
            era: factors.era,
            powerSystem: factors.powerSystem.substring(0, 20) + '...',
            atmosphere: factors.atmosphere
        }));
    }

    let systemPrompt;
    if (factors) {
        systemPrompt = '你是世界观架构师和故事策划。请根据以下世界观因子，创作一个完整的故事骨架。';
    } else {
        systemPrompt = '你是世界观架构师和故事策划。请严格遵循用户提供的灵感方向，创作一个完整的故事骨架。\n\n⚠️ 用户灵感是核心需求，世界观的所有元素（时代背景、权力体系、社会形态、角色关系）都必须源自用户灵感，不得偏离。';
    }

    if (factors) {
        systemPrompt += `\n\n用户提供了灵感方向：${userInspiration}。请将此灵感作为世界观的核心基础，随机因子作为补充细节融入其中。`;
    }

    let userPrompt;
    if (factors) {
        userPrompt = `请根据以下世界观因子生成故事骨架：

${factorPrompt}

【输出格式严格遵循以下规则，不要输出任何其他文字】：

输出为 TSV 表格格式，单行数据，用 | 分隔字段：

storyTitle|worldviewSummary|openingScene|mainArc|toneKeywords|worldviewNotes

具体字段：
- storyTitle: 故事标题（简洁有力，8字以内）
- worldviewSummary: 世界观概要（100-200字，描述这个世界的核心特色、社会形态和运转规则）
- openingScene: 开场场景描写（150-250字，具体且有画面感，让玩家有代入感。必须包含：①环境氛围描写 ②至少一个NPC角色在场并有台词或动作
- mainArc: 起：故事起始。承：事件触发。转：冲突升级。合：高潮对决。余韵：结局后新平衡。
- toneKeywords: 3个词概括整体氛围，用 、 分隔
- worldviewNotes: 给后续角色生成的额外设定约束（50字以内）

要求：
1. 世界观要自洽、有细节、有独特性
2. 开场场景要有画面感，能立刻吸引玩家
3. 主线弧光要有起伏，不能平淡
4. toneKeywords 用3个词概括整体氛围，用中文顿号 、 分隔
5. worldviewNotes 要包含角色设计的硬性约束`;
    } else {
        userPrompt = `请根据用户的灵感方向生成故事骨架：

用户灵感：${userInspiration}

⚠️ 严格遵循要求：用户灵感中提到的所有元素（时代、地点、角色数量、角色性别、关系类型等）都必须在世界观和角色设计中体现。不得忽略、不得添加与灵感无关的元素。

【输出格式严格遵循以下规则，不要输出任何其他文字】：

输出为 TSV 表格格式，单行数据，用 | 分隔字段：

storyTitle|worldviewSummary|openingScene|mainArc|toneKeywords|worldviewNotes

具体字段：
- storyTitle: 故事标题（简洁有力，8字以内）
- worldviewSummary: 世界观概要（100-200字，描述这个世界的核心特色、社会形态和运转规则）
- openingScene: 开场场景描写（150-250字，具体且有画面感，让玩家有代入感。必须包含：①环境氛围描写 ②至少一个NPC角色在场并有台词或动作
- mainArc: 起：故事起始。承：事件触发。转：冲突升级。合：高潮对决。余韵：结局后新平衡。
- toneKeywords: 3个词概括整体氛围，用 、 分隔
- worldviewNotes: 给后续角色生成的额外设定约束（50字以内）

要求：
1. 世界观要自洽、有细节、有独特性
2. 开场场景要有画面感，能立刻吸引玩家
3. 主线弧光要有起伏，不能平淡
4. toneKeywords 用3个词概括整体氛围，用中文顿号 、 分隔
5. worldviewNotes 要包含角色设计的硬性约束`;
    }

    rpLog('info', 'WORLDVIEW', '调用 LLM 生成世界观骨架');
    const startTime = Date.now();
    rpLog('info', 'TIMEOUT', `LLM 请求开始: worldview, temp=${options?.temperature ?? 1}`);
    const resp = await App.agnesChat([{
        role: 'system',
        content: systemPrompt
    }, {
        role: 'user',
        content: userPrompt
    }], options);
    const elapsed = Date.now() - startTime;
    rpLog('info', 'TIMEOUT', `LLM 请求完成: worldview, 耗时 ${elapsed}ms`);
    if (elapsed > 60000) {
        rpLog('error', 'TIMEOUT', `⚠️ 超时警告: worldview 请求耗时 ${elapsed}ms`);
    }

    let data;
    try {
        // 第一优先级：newline key:value 格式（LLM 最常输出）
        data = App.parseWorldviewKeyValue(resp);
        if (!data || Object.keys(data).length === 0) {
            throw new Error('key:value 解析返回空结果');
        }
        // 检查关键字段 worldviewSummary 是否为空
        if (!data.worldviewSummary || data.worldviewSummary.trim().length < 10) {
            throw new Error('世界观概要缺失或过短');
        }
        rpLog('info', 'WORLDVIEW', 'key:value 解析成功');
        rpLog('info', 'TITLE', `LLM 原始返回: ${resp}`);
    } catch (e) {
        rpLog('warn', 'WORLDVIEW', 'key:value 解析失败: ' + e.message);
        try {
            // 第二优先级：TSV | 分隔格式
            data = App.parseWorldviewDelimited(resp);
            if (Object.keys(data).length === 0) {
                throw new Error('TSV 解析返回空对象');
            }
            if (!data.worldviewSummary || data.worldviewSummary.trim().length < 10) {
                throw new Error('世界观概要缺失或过短（LLM 可能未按要求输出 | 分隔格式）');
            }
            rpLog('info', 'WORLDVIEW', 'TSV 分隔符解析成功');
            rpLog('info', 'TITLE', `LLM 原始返回: ${resp}`);
        } catch (e2) {
            rpLog('warn', 'WORLDVIEW', 'TSV 分隔符解析失败: ' + e2.message);
            try {
                // 第三优先级：JSON 解析
                data = App.parseWorldviewJson(resp);
                rpLog('info', 'WORLDVIEW', 'JSON 解析成功');
            } catch (e3) {
                rpLog('warn', 'WORLDVIEW', 'JSON 解析也失败: ' + e3.message + '，启用兜底文本解析');
                try {
                    data = App.parseWorldviewFallback(resp);
                    rpLog('info', 'WORLDVIEW', '兜底文本解析成功');
                } catch (e4) {
                    rpLog('error', 'WORLDVIEW', '所有解析方式均失败: ' + e4.message);
                    rpLog('error', 'WORLDVIEW', `LLM 原始返回: ${resp}`);
                    throw new Error('世界观生成失败：无法解析 LLM 返回的数据');
                }
            }
        }
    }

    // 保护 imageStyle 不被覆盖（已在 createCharacter 中设置为用户选择）
    const preservedImageStyle = state.story?.imageStyle || 'akira toriyama style';
    state.story = {
        title: data.storyTitle || '未命名故事',
        worldview: data.worldviewSummary || '',
        mainArc: Array.isArray(data.mainArc) ? data.mainArc : [],
        openingScene: data.openingScene || '',
        toneKeywords: Array.isArray(data.toneKeywords) ? data.toneKeywords : [],
        worldviewNotes: data.worldviewNotes || '',
        factors: factors,
        userInspiration: userInspiration || '',
        phase: 'worldview',
        imageStyle: preservedImageStyle
    };

    await saveState();
    updateStoryHeader();
    updateGenerationControls();

    rpLog('info', 'WORLDVIEW', '世界观生成完成: ' + state.story.title);
    rpLog('info', 'TITLE', `故事标题: "${state.story.title}" | 原始数据: ${JSON.stringify({storyTitle: data.storyTitle, worldviewSummary: (data.worldviewSummary || '').slice(0, 50), openingScene: (data.openingScene || '').slice(0, 50)})}`);
    return data;
};

// 解析世界观 — 优先尝试 newline key:value 格式（LLM 最常输出的格式）
// 示例：
//   故事标题:海风与异能
//   worldviewSummary:大航海时代背景下...
//   openingScene:阳光透过...
App.parseWorldviewKeyValue = function(text) {
    const result = {};
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    // 字段名映射：支持英文 key 和中文 key
    const fieldMap = {
        'storytitle': 'storyTitle',
        '故事标题': 'storyTitle',
        '标题': 'storyTitle',
        'worldviewsummary': 'worldviewSummary',
        '世界观概要': 'worldviewSummary',
        '世界观': 'worldviewSummary',
        '设定概要': 'worldviewSummary',
        'openingscene': 'openingScene',
        '开场场景': 'openingScene',
        '开场': 'openingScene',
        'mainarc': 'mainArc',
        '主线剧情': 'mainArc',
        '主要弧光': 'mainArc',
        '主线': 'mainArc',
        'tonekeywords': 'toneKeywords',
        '氛围关键词': 'toneKeywords',
        'tone ic keywords': 'toneKeywords',
        'tonekeywords': 'toneKeywords',
        'worldviewnotes': 'worldviewNotes',
        '世界观备注': 'worldviewNotes',
        '世界观笔记': 'worldviewNotes',
    };
    
    for (const line of lines) {
        // 匹配 key:value 或 key: value 格式（支持 : 和 ：）
        const match = line.match(/^([^\s:：]+?)[\s]*[:：]\s*(.+)$/s);
        if (!match) continue;
        
        const rawKey = match[1].trim().toLowerCase();
        const value = match[2].trim();
        const fieldName = fieldMap[rawKey];
        
        if (fieldName) {
            result[fieldName] = value;
        }
    }
    
    // 如果至少解析到了 2 个字段，认为成功
    if (Object.keys(result).length >= 2) return result;
    return null; // 字段太少，交给下一级
};

// 解析世界观 TSV 表格（| 分隔字段）
App.parseWorldviewDelimited = function(text) {
    const result = {};
    let content = text.trim();

    // 去掉可能的包裹符号（兼容旧格式残留）
    content = content.replace(/^◆/, '').replace(/◆$/, '');

    // 按 | 分割字段
    let parts = content.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return result;

    // 检测并移除前缀标签（如 "storyTitle|" 这种）
    const labelPattern = /^(?:storyTitle|worldviewSummary|openingScene|mainArc|toneKeywords|worldviewNotes|故事标题|世界观概要|开场场景|开场|主线剧情|主要弧光|tone(?:ic)? ?keywords?|氛围关键词|世界观备注|世界观笔记)$/iu;
    if (parts[0].length <= 20 && labelPattern.test(parts[0])) {
        parts = parts.slice(1);
    }
    if (parts.length === 0) return result;

    // 严格按 TSV 列顺序映射（6 个字段）
    // storyTitle | worldviewSummary | openingScene | mainArc | toneKeywords | worldviewNotes
    if (parts.length >= 1) result.storyTitle = parts[0];
    if (parts.length >= 2) result.worldviewSummary = parts[1];
    if (parts.length >= 3) result.openingScene = parts[2];
    if (parts.length >= 4) result.mainArc = parts[3];
    if (parts.length >= 5) result.toneKeywords = parts[4];
    if (parts.length >= 6) result.worldviewNotes = parts[5];

    // 如果 mainArc 包含阶段标记（起/承/转/合），将其识别为主线
    if (!result.mainArc) {
        for (let i = 0; i < parts.length; i++) {
            if (/(?:起|承|转|合|余韵)[：:]/.test(parts[i])) {
                result.mainArc = parts[i];
                break;
            }
        }
    }

    // 如果 toneKeywords 缺失，找短且不包含句号的片段
    if (!result.toneKeywords) {
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].length <= 30 && !/[。！？]/.test(parts[i]) && i > 0) {
                result.toneKeywords = parts[i];
                break;
            }
        }
    }

    // 如果 worldviewNotes 缺失，找最短的片段
    if (!result.worldviewNotes) {
        let minLen = Infinity, minIdx = -1;
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].length <= 80 && parts[i].length < minLen) {
                minLen = parts[i].length;
                minIdx = i;
            }
        }
        if (minIdx >= 0) result.worldviewNotes = parts[minIdx];
    }
    
    // 如果 storyTitle 仍为空，从 worldviewSummary 开头提取短标题
    if (!result.storyTitle && result.worldviewSummary && result.worldviewSummary.length > 0) {
        const shortMatch = result.worldviewSummary.match(/^.{3,15}(?:。|，|$)/);
        if (shortMatch) {
            result.storyTitle = shortMatch[0].replace(/[。，]/g, '').trim();
        }
    }
    
    // 后处理：mainArc 解析为阶段数组
    if (result.mainArc && typeof result.mainArc === 'string') {
        result.mainArc = result.mainArc.split(/[。..]/).map(s => s.trim()).filter(Boolean).map(s => {
            const phaseMatch = s.match(/^(\S+)\s*[：:]?\s*(.*)/);
            if (phaseMatch) {
                return { phase: phaseMatch[1], description: phaseMatch[2].trim() };
            }
            return { phase: '未知', description: s.trim() };
        });
    }
    
    // 后处理：toneKeywords 分割
    if (result.toneKeywords && typeof result.toneKeywords === 'string') {
        result.toneKeywords = result.toneKeywords.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
    }
    
    return result;
};

// JSON 回退解析
App.parseWorldviewJson = function(text) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('No JSON braces found');
    }
    let jsonStr = text.slice(firstBrace, lastBrace + 1);
    
    // 尝试手动修正
    let normalized = jsonStr
        .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
        .replace(/\u201c/g, '"').replace(/\u201d/g, '"')
        .replace(/\uFF07/g, "'").replace(/\uFF02/g, '"');
    normalized = normalized.replace(/,\s*([\]}])/g, '$1');
    
    return JSON.parse(normalized);
};

// 兜底解析：当 LLM 完全忽略 TSV 格式时，尝试从自由文本中提取字段
App.parseWorldviewFallback = function(text) {
    const result = {};
    
    // 先尝试按 | 分割（LLM 可能用了 | 但没有表头）
    let segments = text.split('|').map(s => s.trim()).filter(Boolean);
    
    // 如果 | 分割后有多个片段，尝试提取
    if (segments.length >= 2) {
        // 第一段可能是标题（短文本）
        if (segments[0].length <= 20 && segments[0].length > 0) {
            result.storyTitle = segments[0];
        }
        
        // 找 mainArc（包含阶段标记）
        let mainArcIdx = -1;
        for (let i = 0; i < segments.length; i++) {
            if (/(?:起|承|转|合|余韵)[：:]/.test(segments[i])) {
                mainArcIdx = i;
                break;
            }
        }
        
        if (mainArcIdx >= 0) {
            // 提取 mainArc 的各个阶段为数组
            const arcText = segments[mainArcIdx];
            result.mainArc = arcText.split(/[。..]/).map(s => s.trim()).filter(Boolean).map(s => {
                const phaseMatch = s.match(/^(\S+)\s*[：:]?\s*(.*)/);
                if (phaseMatch) {
                    return { phase: phaseMatch[1], description: phaseMatch[2].trim() };
                }
                return { phase: '未知', description: s.trim() };
            });
        }
        
        // 剩余的非标题、非 mainArc 部分作为 worldviewSummary
        // 如果 remaining 为空（LLM 只用了 1 个 | 分隔标题，其余全在 mainArc 段中），
        // 则从 mainArc segment 中提取 worldviewSummary：mainArc 阶段标记之前的文本
        let remaining = segments.filter((_, i) => i !== mainArcIdx && !(i === 0 && segments[0].length <= 20));
        if (remaining.length === 0 && mainArcIdx >= 0) {
            // mainArc segment 可能包含 worldviewSummary + mainArc 内容混在一起
            // 尝试从 mainArc segment 中提取 worldviewSummary（mainArc 阶段标记之前的文本）
            const arcSegment = segments[mainArcIdx];
            const preArcMatch = arcSegment.match(/^(.*?)(?:起[：:])\s*/s);
            if (preArcMatch && preArcMatch[1].trim().length > 0) {
                remaining = [preArcMatch[1].trim()];
            }
        }
        if (remaining.length > 0) {
            result.worldviewSummary = remaining.join('\n');
        }
    } else if (segments.length === 1) {
        // 只有一段，尝试带标签的提取
        const titleMatch = text.match(/(?:^|\n)(?:故事标题|标题)[:：\s]*([^\n]{1,20})/);
        if (titleMatch) result.storyTitle = titleMatch[1].trim();
        
        const vwMatch = text.match(/(?:世界观概要|世界观|设定概要)[:：\s]*([^\n]{50,2000}?)(?=\n\s*(?:开场|主线|tone|关键词|worldview)|$)/i);
        if (vwMatch) result.worldviewSummary = vwMatch[1].trim();
        
        if (Object.keys(result).length === 0) {
            result.worldviewSummary = text.substring(0, 2000);
        }
    }
    
    return result;
};