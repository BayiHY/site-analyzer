// === Section: 角色生成 ===
// 第二阶段：基于世界观生成角色 + 两阶段流程编排

App.generateCharacters = async function(count, playerGender, userInspiration, genderHint) {
    count = count || 3;

    if (!state.story || !state.story.worldview) {
        throw new Error('世界观尚未生成或生成不完整，请重新生成世界观');
    }

    const pg = playerGender || state.player?.gender || '男';
    const inspiration = userInspiration || state.story.userInspiration || '';
    rpLog('info', 'CHARS', `开始基于世界观生成 ${count} 个角色，玩家性别: ${pg}`);
    rpLog('info', 'CHARS', `用户灵感: ${inspiration}`);
    if (genderHint) rpLog('info', 'CHARS', `性别倾向: ${genderHint}`);
    addSystemMessage(`正在生成 ${count} 个角色...`);

    const visualStyle = state.story?.imageStyle || 'anime';
    const prompt = `你是角色设计师和编剧。请根据以下世界观和用户灵感生成恰好 ${count} 个鲜活的角色。

⚠️ 【画面风格】全局统一的画面风格为「${visualStyle}」。所有角色的外观、服装、环境描写都必须符合这一视觉风格。角色生图字段（imageStyle/imageFace/imageHair/imageBody/imageClothes/imageEnvironment）要围绕这一风格构建。

⚠️ 【用户灵感优先】用户明确要求：${inspiration || '无特定要求'}。角色设计必须严格遵循用户灵感中的所有要求（时代背景、地点、角色数量、性别比例、关系类型等）。

⚠️ 【数量强制要求】必须生成 ${count} 个角色，一行一个数据行，绝不能少！生成 ${count-1} 个或更少将被视为失败。

【世界观概要】
${state.story.worldview}

【故事标题】
${state.story.title}

【主线弧光】
${state.story.mainArc.map(a => `・${a.phase}：${a.description}`).join('\\n')}

【氛围基调】
${(state.story.toneKeywords || []).join('、')}

【角色设计约束】
${state.story.worldviewNotes || '无额外约束'}

【玩家信息】
玩家扮演的主角性别：${pg}
NPC角色与玩家的互动需要考虑玩家性别，关系描述要与玩家性别匹配。
${genderHint ? `\n【性别倾向】${genderHint}` : ''}

输出格式要求（TSV 表格格式，用 | 分隔字段，不要输出任何其他文字）：

第一行必须是表头，后续每一行是一个角色：
name|age|gender|appearance|personality|background|relationship|motivation|secret|speechStyle|voice|imageStyle|imageFace|imageHair|imageBody|imageClothes|imageEnvironment

⚠️ 重要：第一行必须是完整的表头，不要省略任何字段！

⚠️ 【画面风格统一】所有角色的 imageStyle 字段必须使用同一个风格：${state.story.imageStyle || 'anime'}。这是全局统一的画面风格，每个角色的 imageStyle 都要填完全相同的值。

基础字段说明：
- name: 角色名（2-4个字，有特色）
- age: 年龄数字
- gender: 男/女
- appearance: 外貌特征（50字以内，具体且有辨识度）
- personality: 性格特点（50字以内，包含优点和缺点）
- background: 背景故事（80字以内，包含关键经历和转折点）
- relationship: 与主角/玩家的关系（30字以内，初始关系和可能的发展）
- motivation: 核心动机/欲望（20字以内，驱动角色行动的根本原因）
- secret: 隐藏的秘密（30字以内，可以在冒险中逐步揭示）
- speechStyle: 说话风格（20字以内，比如毒舌、温柔、简洁等）
- voice: Edge TTS 语音名称（必须从以下列表中选取，不要编造不存在的声音）

【女声（4个）】zh-CN-XiaoxiaoNeural（温柔知性）、zh-CN-XiaoyiNeural（活泼甜美）、zh-CN-liaoning-XiaobeiNeural（东北俏皮）、zh-CN-shaanxi-XiaoniNeural（西北温婉）

【男声（4个）】zh-CN-YunxiNeural（沉稳磁性）、zh-CN-YunjianNeural（阳光开朗）、zh-CN-YunxiaNeural（温和儒雅）、zh-CN-YunyangNeural（成熟稳重）

根据角色性别和性格自动匹配对应声线。同一故事不同角色尽量用不同音色，避免重复。

生图模块化字段（全部用英文，供 AI 绘画使用）：
- imageStyle: 画面风格（英文，如 anime, watercolor, oil painting, digital realism, pencil sketch, comic book, photorealistic, 3D render, studio ghibli, cyberpunk, fantasy art, chibi, pixel art, ink wash, vaporwave, dark fantasy）
- imageFace: 五官脸型（英文，描述面部特征，如 sharp jawline, round face, large amber eyes, thin lips）
- imageHair: 妆扮发型（英文，发型+妆容，如 long silver hair in twin tails, light makeup with smoky eyes）
- imageBody: 身体四肢（英文，体型+姿态，如 slender figure, athletic build, graceful posture）
- imageClothes: 衣服配饰（英文，服装+饰品，如 white lab coat over black dress, gold necklace, round glasses）
- imageEnvironment: 环境特效（英文，背景+光影，如 warm sunset glow, soft bokeh background, misty forest）

完整角色图 = imageStyle + imageFace + imageHair + imageBody + imageClothes + imageEnvironment（全身）
降级半身 = imageStyle + imageFace + imageHair + imageBody（腰部以上）
降级特写 = imageStyle + imageFace（面部到锁骨）

示例（不要照抄内容，只照格式）：
name|age|gender|appearance|personality|background|relationship|motivation|secret|speechStyle|voice|imageStyle|imageFace|imageHair|imageBody|imageClothes|imageEnvironment
阿德拉|28|女|苍白瘦削，左眼黄铜义眼|冷静理智，极度缺乏安全感|曾是贵族家替补厨师，因被诬陷遭驱逐|起初视主角为棋子，后转为生死搭档|复仇并查明父亲失踪真相|义眼中封印着低阶怨灵|冷嘲热讽，用烹饪术语隐喻人生险恶|zh-CN-XiaoxiaoNeural|anime|pale skin, left eye is a brass gear prosthetic, sharp cheekbones|long black hair in a neat bob cut, minimal makeup|slender and slightly hunched frame|white apron over dark Victorian dress, brass goggles on head|dimly lit kitchen with steam and warm amber glow
巴尔扎|45|男|魁梧如熊，右臂机械锅铲义肢|暴躁冲动，护短|前地下拳手，被深渊灶台改造为活体搅拌机|雇佣兵兼守护者，认为主角是少数不把他当怪物看的人|保护主角，终结自己作为器具的命运|机械义肢内部连接着未成熟的灵体心脏|粗鲁直白，常伴有吞咽口水的声音|zh-CN-YunxiNeural|digital realism|broad square jaw, scar across nose, thick eyebrows|short buzz cut, sweat-dampened hair|massive muscular build, right arm is a mechanical spatula|torn tank top revealing mechanical parts, leather combat pants|gritty underground arena with sparks and smoke

要求：
1. 角色之间要有关系网（亲友、敌对、师徒、竞争对手等）
2. 每个角色必须有鲜明的个性和缺陷
3. 角色设计必须符合世界观设定，不能出现违和感
4. 至少包含1个女性角色和1个男性角色
5. 生图字段全部用英文，适合 AI 绘画
6. 避免脸谱化和套路化
7. 值中不要使用 | 符号，如有请用其他词替代`;

    // 重试机制：LLM 可能少生成角色，最多重试 2 次
    let resp, parsedBlocks, charList, validChars;
    const maxRetries = 2;
    let retryCount = 0;
    let retryPromptSuffix = '';

    do {
        resp = await App.agnesChat([{
            role: 'system',
            content: '你是专业的角色设计师，擅长创造立体、有深度的虚构角色。输出必须严格按照分隔符格式。'
        }, {
            role: 'user',
            content: prompt + retryPromptSuffix
        }]);

        try {
            parsedBlocks = parseDelimited(resp);
            rpLog('info', 'CHARS', '分隔符解析成功');
            rpLog('info', 'CHARS', `解析结果类型: ${typeof parsedBlocks}, isArray: ${Array.isArray(parsedBlocks)}, length: ${parsedBlocks?.length ?? 'N/A'}`);
            if (Array.isArray(parsedBlocks) && parsedBlocks.length > 0) {
                rpLog('info', 'CHARS', `第一个元素类型: ${typeof parsedBlocks[0]}, 内容: ${JSON.stringify(parsedBlocks[0]).slice(0, 300)}`);
            }
        } catch (e) {
            rpLog('warn', 'CHARS', '分隔符解析失败: ' + e.message);
            rpLog('warn', 'CHARS', `LLM 原始返回: ${resp}`);
            try {
                parsedBlocks = App.parseCharactersJson(resp);
                rpLog('info', 'CHARS', 'JSON 解析成功');
            } catch (e2) {
                rpLog('error', 'CHARS', 'JSON 解析也失败: ' + e2.message);
                rpLog('error', 'CHARS', `LLM 原始返回: ${resp}`);
                throw new Error('角色生成失败：无法解析 LLM 返回的数据');
            }
        }

        if (!parsedBlocks) {
            throw new Error('角色生成失败：未解析到有效角色数据');
        }

        charList = Array.isArray(parsedBlocks) ? parsedBlocks : [parsedBlocks];
        if (charList.length === 0) {
            throw new Error('角色生成失败：API 未返回有效角色数据');
        }

        // 过滤无效角色（name 为空的块）
        validChars = charList.filter(c => c.name && c.name.trim());
        const actualCount = validChars.length > 0 ? validChars.length : charList.length;

        if (actualCount < count) {
            retryCount++;
            const shortfall = count - actualCount;
            rpLog('warn', 'CHARS', `LLM 仅生成 ${actualCount} 个有效角色（共 ${charList.length} 个块），请求 ${count} 个，差 ${shortfall} 个，重试 (${retryCount}/${maxRetries})`);
            retryPromptSuffix = `\n\n【强制要求】上次你生成了 ${charList.length} 个数据块，但只有 ${actualCount} 个有效角色（name 字段为空导致无效）。要求 ${count} 个有效角色，请补全剩余 ${shortfall} 个。务必确保每个角色的 name 字段都有非空的名字，严格按照 TSV | 分隔格式输出，第一行必须是表头。`;
        }
    } while (retryCount < maxRetries && (validChars.length > 0 ? validChars.length : charList.length) < count);

    // 安全裁剪：LLM 可能生成多余的角色块，只取前 count 个
    if (charList.length > count) {
        rpLog('warn', 'CHARS', `LLM 返回了 ${charList.length} 个角色块，超出请求的 ${count} 个，已裁剪`);
        charList.length = count;
    }

    // 过滤无效角色（name 为空的块）
    validChars = charList.filter(c => c.name && c.name.trim());
    if (validChars.length < charList.length) {
        rpLog('warn', 'CHARS', `过滤了 ${charList.length - validChars.length} 个无效角色块（name 为空）`);
    }
    const finalCharList = validChars.length > 0 ? validChars : charList;

    // 诊断：记录角色字段结构
    const sampleChar = finalCharList[0] || {};
    const rawKeys = Object.keys(sampleChar);
    rpLog('info', 'CHARS', `角色 #0 字段名: ${rawKeys.join(', ')}`);
    rpLog('info', 'CHARS', `角色 #0 数据预览: ${JSON.stringify(sampleChar).slice(0, 300)}`);

    // 检查是否含有模块化字段或旧版 imagePrompt
    const hasModuleFields = rawKeys.some(k => k.startsWith('imageStyle') || k.startsWith('imageFace'));
    const hasImageField = rawKeys.some(k => k.toLowerCase().includes('image') && k.toLowerCase().includes('prompt'));
    if (!hasModuleFields && !hasImageField) {
        rpLog('warn', 'CHARS', '角色数据中既没有模块化字段也没有 imagePrompt，头像将使用备用 prompt');
    } else if (hasModuleFields) {
        rpLog('info', 'CHARS', '检测到模块化字段，将使用模块化三级降级生图');
    }

    // 保存角色
    state.characters = finalCharList.map((c, i) => {
        // 提取模块化字段
        const modules = {
            imageStyle: c.imageStyle || '',
            imageFace: c.imageFace || '',
            imageHair: c.imageHair || '',
            imageBody: c.imageBody || '',
            imageClothes: c.imageClothes || '',
            imageEnvironment: c.imageEnvironment || ''
        };

        const hasAnyModule = modules.imageStyle || modules.imageFace || modules.imageHair || modules.imageBody || modules.imageClothes || modules.imageEnvironment;

        // 兼容旧格式：如果没有模块化字段但有 imagePrompt
        let imagePrompt = c.imagePrompt || '';
        if (!imagePrompt && !hasAnyModule) {
            const gender = c.gender === '男' ? 'male' : c.gender === '女' ? 'female' : 'person';
            const age = c.age || 20;
            const appearance = c.appearance || '';
            const name = c.name || 'unknown';
            imagePrompt = `Portrait of ${name}, ${age} year old ${gender}, ${appearance}, professional character concept art, detailed facial features, clean background`;
            rpLog('info', 'CHARS', `角色 #${i} "${c.name}" 无模块化字段也无 imagePrompt，已生成备用 prompt`);
        } else if (!imagePrompt && hasAnyModule) {
            // 有新格式模块但 LLM 没给 imagePrompt，自动生成一个旧版兼容
            const gender = c.gender === '男' ? 'male' : c.gender === '女' ? 'female' : 'person';
            const age = c.age || 20;
            const name = c.name || 'unknown';
            imagePrompt = `Portrait of ${name}, ${age} year old ${gender}, ${modules.imageFace || 'detailed facial features'}, ${modules.imageStyle || 'anime'}`;
            rpLog('info', 'CHARS', `角色 #${i} "${c.name}" 有模块化字段但无 imagePrompt，已生成兼容 prompt`);
        }

        return {
            name: c.name || '未知角色',
            age: parseInt(c.age) || 20,
            gender: c.gender || '未知',
            appearance: c.appearance || '',
            personality: c.personality || '',
            background: c.background || '',
            relationship: c.relationship || '',
            faceImageUrl: '',
            portraitImageUrl: '',
            imagePrompt: imagePrompt,
            perception: '',
            secret: c.secret || '',
            currentMood: '',
            motivation: c.motivation || '',
            speechStyle: c.speechStyle || '',
            voice: c.voice || App.autoMatchVoice({ gender: c.gender }),
            __modules__: modules
        };
    });

    // 仅在有 imagePrompt 字段时才记录诊断
    state.characters.forEach((c, i) => {
        if (!c.imagePrompt && !(c.__modules__ && Object.values(c.__modules__).some(v => v))) {
            rpLog('warn', 'CHARS', `角色 #${i} "${c.name}" 无任何生图数据`);
        }
    });

    state.activeCharIndex = 0;
    state.emotions = {};
    state.revealed = {};
    state.characters.forEach(c => {
        state.emotions[c.name] = {
            好感度: { current: 50, initial: 50 },
            亲密感: { current: 20, initial: 20 },
            信任度: { current: 50, initial: 50 },
            吸引力: { current: 30, initial: 30 },
            依赖感: { current: 30, initial: 30 }
        };
        state.revealed[c.name] = {
            appearance: false,
            personality: false,
            background: false,
            relationship: false
        };
    });

    state.story.phase = 'chat';
    state.story.generatedAt = new Date().toISOString();

    await saveState();
    updateStoryHeader();
    updateGenerationControls();

    rpLog('info', 'CHARS', `角色生成完成: ${state.characters.map(c => c.name).join(', ')}`);
    rpLog('info', 'CHARS', `角色数量: ${state.characters.length}`);
    return state.characters;
};

// JSON 回退解析（角色）
App.parseCharactersJson = function(text) {
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
        .replace(/\uFF07/g, "'").replace(/\uFF02/g, '"')
        .replace(/\u300C/g, '"').replace(/\u300D/g, '"');
    normalized = normalized.replace(/,\s*([\]}])/g, '$1');
    normalized = normalized.replace(/:\s*'([^']*)'/g, function(m, val) {
        return ': "' + val.replace(/'/g, "\\'").replace(/"/g, '\\"') + '"';
    });
    normalized = normalized.replace(/'([^']*)'\s*:/g, '"$1":');
    normalized = normalized.replace(/:\s*'([^']*)'/g, ':"$1"');

    return JSON.parse(normalized);
};
