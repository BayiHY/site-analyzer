// === Section: 世界观生成 ===
// 第一阶段：基于世界观因子生成故事骨架 + 分隔符文本解析

App.generateWorldview = async function(userInspiration) {
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

    // 从用户灵感中检测画面风格
    const detectedStyle = App.detectVisualStyleFromInspiration(userInspiration || '');
    const visualStyle = detectedStyle || state.story?.imageStyle || 'anime';
    if (detectedStyle) {
        rpLog('info', 'WORLDVIEW', `画面风格: ${visualStyle}（从灵感检测）`);
    } else {
        rpLog('info', 'WORLDVIEW', `画面风格: ${visualStyle}（默认/设置）`);
    }

    let systemPrompt;
    if (factors) {
        systemPrompt = '你是世界观架构师和故事策划。请根据以下世界观因子，创作一个完整的故事骨架。';
    } else {
        systemPrompt = '你是世界观架构师和故事策划。请严格遵循用户提供的灵感方向，创作一个完整的故事骨架。\n\n⚠️ 用户灵感是核心需求，世界观的所有元素（时代背景、权力体系、社会形态、角色关系）都必须源自用户灵感，不得偏离。';
    }

    // 注入画面风格信息到 prompt
    const styleNote = `\n\n🎨 画面风格：${visualStyle}。所有场景描写、角色外貌、环境氛围都应符合这一视觉风格。`; 
    if (factors) {
        systemPrompt += `\n\n用户提供了灵感方向：${userInspiration}。请将此灵感作为世界观的核心基础，随机因子作为补充细节融入其中。`;
    }
    systemPrompt += styleNote;

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
- openingScene: 开场场景描写（150-250字，具体且有画面感，让玩家有代入感。必须包含：①环境氛围描写 ②至少一个NPC角色在场并有台词或动作 ③一个需要玩家立即面对的抉择点或危机情境，用「你面临选择：」引出两个对立选项（如「逃离此地 / 留下面对」），选项之间用「或」分隔。④末尾加上 <建议回复1|建议回复2|建议回复3>，用尖括号包裹，3条建议回复之间**必须**用英文竖线 | 分隔。**严禁**使用顿号、逗号、>。< 或其他符号作为分隔符。建议回复是主角（玩家）可以对开场情境做出的**语言回应或动作表现**（如「你是谁？」、「后退一步，保持警惕」、「默默观察他的表情」），而不是决策选项（如「选择逃跑」）。每条建议回复不超过20字。）
- mainArc: 起：故事起始。承：事件触发。转：冲突升级。合：高潮对决。余韵：结局后新平衡。
- toneKeywords: 3个词概括整体氛围，用 、 分隔（如 诡谲、味觉、反噬）
- worldviewNotes: 给后续角色生成的额外设定约束（50字以内）

示例格式（不要照抄内容，只照格式）：
storyTitle|迷雾烩菜|维多利亚时期的伦敦被迷雾笼罩...|煤气灯在潮湿的石板路上...|起：埃利亚斯因破获...|诡谲、味觉、反噬|角色拥有灵性天赋即被视为异端...

要求：
1. 世界观要自洽、有细节、有独特性
2. 开场场景要有画面感，能立刻吸引玩家
3. 主线弧光要有起伏，不能平淡
4. toneKeywords 用3个词概括整体氛围，用中文顿号 、 分隔
5. worldviewNotes 要包含角色设计的硬性约束
6. 值中不要使用 | 符号，如有请用其他词替代
7. 🎨 画面风格为「${visualStyle}」，所有场景描写、环境氛围都要符合这一视觉风格`;
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
- openingScene: 开场场景描写（150-250字，具体且有画面感，让玩家有代入感。必须包含：①环境氛围描写 ②至少一个NPC角色在场并有台词或动作 ③一个需要玩家立即面对的抉择点或危机情境，用「你面临选择：」引出两个对立选项（如「逃离此地 / 留下面对」），选项之间用「或」分隔。④末尾加上 <建议回复1|建议回复2|建议回复3>，用尖括号包裹，3条建议回复之间**必须**用英文竖线 | 分隔。**严禁**使用顿号、逗号、>。< 或其他符号作为分隔符。建议回复是主角（玩家）可以对开场情境做出的**语言回应或动作表现**（如「你是谁？」、「后退一步，保持警惕」、「默默观察他的表情」），而不是决策选项（如「选择逃跑」）。每条建议回复不超过20字。）
- mainArc: 起：故事起始。承：事件触发。转：冲突升级。合：高潮对决。余韵：结局后新平衡。
- toneKeywords: 3个词概括整体氛围，用 、 分隔（如 诡谲、味觉、反噬）
- worldviewNotes: 给后续角色生成的额外设定约束（50字以内）

示例格式（不要照抄内容，只照格式）：
storyTitle|迷雾烩菜|维多利亚时期的伦敦被迷雾笼罩...|煤气灯在潮湿的石板路上...|起：埃利亚斯因破获...|诡谲、味觉、反噬|角色拥有灵性天赋即被视为异端...

要求：
1. 世界观要自洽、有细节、有独特性
2. 开场场景要有画面感，能立刻吸引玩家
3. 主线弧光要有起伏，不能平淡
4. toneKeywords 用3个词概括整体氛围，用中文顿号 、 分隔
5. worldviewNotes 要包含角色设计的硬性约束
6. 值中不要使用 | 符号，如有请用其他词替代
7. 🎨 画面风格为「${visualStyle}」，所有场景描写、环境氛围都要符合这一视觉风格`;
    }

    rpLog('info', 'WORLDVIEW', '调用 LLM 生成世界观骨架');
    const resp = await App.agnesChat([{
        role: 'system',
        content: systemPrompt
    }, {
        role: 'user',
        content: userPrompt
    }]);

    let data;
    try {
        data = App.parseWorldviewDelimited(resp);
        // 检查解析结果是否有有效字段——如果 LLM 未按要求输出 TSV 格式，
        // 解析会返回空对象而不报错，需要额外检测
        if (Object.keys(data).length === 0) {
            throw new Error('TSV 解析返回空对象（LLM 可能未使用 | 分隔格式）');
        }
        // 检查关键字段 worldviewSummary 是否为空
        if (!data.worldviewSummary || data.worldviewSummary.trim().length < 10) {
            throw new Error('世界观概要缺失或过短（LLM 可能未按要求输出 | 分隔格式）');
        }
        rpLog('info', 'WORLDVIEW', '分隔符解析成功');
    } catch (e) {
        rpLog('warn', 'WORLDVIEW', '分隔符解析失败: ' + e.message);
        rpLog('warn', 'WORLDVIEW', `LLM 原始返回: ${resp}`);
        try {
            data = App.parseWorldviewJson(resp);
            rpLog('info', 'WORLDVIEW', 'JSON 解析成功');
        } catch (e2) {
            rpLog('warn', 'WORLDVIEW', 'JSON 解析也失败: ' + e2.message + '，启用兜底文本解析');
            try {
                data = App.parseWorldviewFallback(resp);
                rpLog('info', 'WORLDVIEW', '兜底文本解析成功');
            } catch (e3) {
                rpLog('error', 'WORLDVIEW', '所有解析方式均失败: ' + e3.message);
                rpLog('error', 'WORLDVIEW', `LLM 原始返回: ${resp}`);
                throw new Error('世界观生成失败：无法解析 LLM 返回的数据');
            }
        }
    }

    state.story = {
        title: data.storyTitle || '未命名故事',
        worldview: data.worldviewSummary || '',
        mainArc: Array.isArray(data.mainArc) ? data.mainArc : [],
        openingScene: data.openingScene || '',
        toneKeywords: Array.isArray(data.toneKeywords) ? data.toneKeywords : [],
        worldviewNotes: data.worldviewNotes || '',
        factors: factors,
        userInspiration: userInspiration || '',
        phase: 'worldview'
    };

    await saveState();
    updateStoryHeader();
    updateGenerationControls();

    rpLog('info', 'WORLDVIEW', '世界观生成完成: ' + state.story.title);
    return data;
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

    // 映射：字段名 → 值
    // 预期顺序: storyTitle | worldviewSummary | openingScene | mainArc | toneKeywords | worldviewNotes
    // 但 LLM 可能多输出或少输出，所以用启发式匹配
    const knownKeys = ['storyTitle', 'worldviewSummary', 'openingScene', 'mainArc', 'toneKeywords', 'worldviewNotes'];
    // LLM 可能在前缀加上字段标签（中英双语），跳过这些标签
    const labelPattern = /^(?:storyTitle|worldviewSummary|openingScene|mainArc|toneKeywords|worldviewNotes|故事标题|世界观概要|开场场景|开场|主线剧情|主要弧光|tone(?:ic)? ?keywords?|氛围关键词|世界观备注|世界观笔记)$/iu;
    
    // 检测并移除前缀标签
    if (parts[0].length <= 20 && labelPattern.test(parts[0])) {
        parts = parts.slice(1);
    }
    
    if (parts.length === 0) return result;

    // 启发式字段分类（在所有 parts 上操作，不依赖 startIndex）
    // mainArc: 包含"起："等阶段标记
    let mainArcIdx = -1;
    for (let i = 0; i < parts.length; i++) {
        if (/(?:起|承|转|合|余韵)[：:]/.test(parts[i])) {
            mainArcIdx = i;
            break;
        }
    }
    
    // toneKeywords: 短（<=30字），不包含句号，且不含中文标点（顿号、逗号等）
    // 排除第一个短片段（通常是 storyTitle），避免误匹配
    let toneIdx = -1;
    for (let i = 1; i < parts.length; i++) {
        if (i === mainArcIdx) continue;
        if (parts[i].length <= 30 && !/[。！？]/.test(parts[i])) {
            toneIdx = i;
            break;
        }
    }
    
    // worldviewNotes: 最短的（<=80字）
    let notesIdx = -1;
    let minLen = Infinity;
    for (let i = 0; i < parts.length; i++) {
        if (i === mainArcIdx || i === toneIdx) continue;
        if (parts[i].length <= 80 && parts[i].length < minLen) {
            minLen = parts[i].length;
            notesIdx = i;
        }
    }
    
    // 剩余的两个较长文本：worldviewSummary 和 openingScene
    let others = [];
    for (let i = 0; i < parts.length; i++) {
        if (i !== mainArcIdx && i !== toneIdx && i !== notesIdx) {
            others.push(i);
        }
    }
    
    // 从 others 中区分标题和正文
    // 如果 others[0] 很短（<=20字），它可能是标题
    if (others.length >= 2 && parts[others[0]].length <= 20 && parts[others[0]].length > 0) {
        result.storyTitle = parts[others[0]];
        result.worldviewSummary = parts[others[1]];
        if (others.length > 2) {
            result.openingScene = parts[others[2]];
        }
    } else if (others.length >= 1) {
        result.worldviewSummary = parts[others[0]];
        if (others.length >= 2) {
            result.openingScene = parts[others[1]];
        }
    }
    
    if (mainArcIdx >= 0) result.mainArc = parts[mainArcIdx];
    if (toneIdx >= 0) result.toneKeywords = parts[toneIdx];
    if (notesIdx >= 0) result.worldviewNotes = parts[notesIdx];
    
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