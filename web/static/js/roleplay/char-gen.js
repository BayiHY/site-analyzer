// === Section: 角色生成主流程 ===
// 第二阶段：基于世界观生成角色 + 两阶段流程编排

App.generateCharacters = async function(count, playerGender, userInspiration, genderHint) {
    count = count || 3;

    if (!state.story || !state.story.worldview) {
        throw new Error('世界观尚未生成或生成不完整，请重新生成世界观');
    }

    const inspiration = userInspiration || state.story.userInspiration || '';
    rpLog('info', 'CHARS', `开始基于世界观生成 ${count} 个角色，玩家性别: ${playerGender || state.player?.gender || '男'}`);
    rpLog('info', 'CHARS', `用户灵感: ${inspiration}`);
    if (genderHint) rpLog('info', 'CHARS', `性别倾向: ${genderHint}`);
    addSystemMessage(`正在生成 ${count} 个角色...`);

    // ===== 1. 构建提示词 =====
    const promptModule = await import('./char-prompt.js');
    const prompt = promptModule.buildCharPrompt(count, playerGender, inspiration, genderHint, state);

    // ===== 2. 重试机制：LLM 可能少生成角色，最多重试 2 次 =====
    let resp, parsedBlocks, charList, validChars;
    const maxRetries = 2;
    let retryCount = 0;
    let retryPromptSuffix = '';

    do {
        rpLog('info', 'TIMEOUT', `LLM 请求开始: characters, count=${count}, retry=${retryCount}`);
        const charStartTime = Date.now();
        resp = await App.agnesChat([{
            role: 'system',
            content: '你是专业的角色设计师，擅长创造立体、有深度的虚构角色。输出必须严格按照分隔符格式。'
        }, {
            role: 'user',
            content: prompt + retryPromptSuffix
        }]);
        const charElapsed = Date.now() - charStartTime;
        rpLog('info', 'TIMEOUT', `LLM 请求完成: characters, 耗时 ${charElapsed}ms`);
        if (charElapsed > 60000) {
            rpLog('error', 'TIMEOUT', `⚠️ 超时警告: characters 请求耗时 ${charElapsed}ms`);
        }

        try {
            parsedBlocks = parseDelimited(resp);
            rpLog('info', 'CHARS', '分隔符解析成功');
            rpLog('info', 'CHARS', `解析结果类型: ${typeof parsedBlocks}, isArray: ${Array.isArray(parsedBlocks)}, length: ${parsedBlocks?.length ?? 'N/A'}`);
            if (Array.isArray(parsedBlocks) && parsedBlocks.length > 0) {
                rpLog('info', 'CHARS', `第一个元素类型: ${typeof parsedBlocks[0]}, 内容: ${JSON.stringify(parsedBlocks[0]).slice(0, 300)}`);
            }
            // 调试：打印所有解析块的 name 字段
            if (Array.isArray(parsedBlocks)) {
                rpLog('info', 'CHARS', `所有解析块 names: ${JSON.stringify(parsedBlocks.map(b => b.name))}`);
            }
            // 调试：打印 LLM 原始输出
            rpLog('info', 'TITLE', `LLM 原始输出: ${resp.slice(0, 2000)}...`);
        } catch (e) {
            rpLog('warn', 'CHARS', '分隔符解析失败: ' + e.message);
            rpLog('warn', 'CHARS', `LLM 原始返回: ${resp}`);
            const parserModule = await import('./char-json-parser.js');
            try {
                parsedBlocks = parserModule.parseCharactersJson(resp);
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

    // 安全裁剪：LLM 可能生成多余的角色块
    if (charList.length > count) {
        rpLog('warn', 'CHARS', `LLM 返回了 ${charList.length} 个角色块，超出请求的 ${count} 个，已裁剪`);
        charList.length = count;
    }

    // 过滤无效角色
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

    // ===== 3. 保存角色 =====
    state.characters = finalCharList.map((c, i) => {
        const modules = {
            imageStyle: c.imageStyle || '',
            imageFace: c.imageFace || '',
            imageHair: c.imageHair || '',
            imageBody: c.imageBody || '',
            imageClothes: c.imageClothes || '',
            imageEnvironment: c.imageEnvironment || ''
        };

        const hasAnyModule = modules.imageStyle || modules.imageFace || modules.imageHair || modules.imageBody || modules.imageClothes || modules.imageEnvironment;

        // 兼容旧格式
        let imagePrompt = c.imagePrompt || '';
        if (!imagePrompt && !hasAnyModule) {
            const gender = c.gender === '男' ? 'male' : c.gender === '女' ? 'female' : 'person';
            const age = c.age || 20;
            const appearance = c.appearance || '';
            const name = c.name || 'unknown';
            imagePrompt = `Portrait of ${name}, ${age} year old ${gender}, ${appearance}, professional character concept art, detailed facial features, clean background`;
            rpLog('info', 'CHARS', `角色 #${i} "${c.name}" 无模块化字段也无 imagePrompt，已生成备用 prompt`);
        } else if (!imagePrompt && hasAnyModule) {
            const gender = c.gender === '男' ? 'male' : c.gender === '女' ? 'female' : 'person';
            const name = c.name || 'unknown';
            imagePrompt = `Portrait of ${name}, ${c.age || 20} year old ${gender}, ${modules.imageFace || 'detailed facial features'}, ${modules.imageStyle || 'anime'}`;
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
            voice: c.voice || '',
            __modules__: modules
        };
    });

    // ===== 4. 声线去重 =====
    const voiceModule = await import('./voice-allocation.js');
    voiceModule.allocateVoices(state.characters, TTS_VOICES);

    // 仅在有 imagePrompt 字段时才记录诊断
    state.characters.forEach((c, i) => {
        if (!c.imagePrompt && !(c.__modules__ && Object.values(c.__modules__).some(v => v))) {
            rpLog('warn', 'CHARS', `角色 #${i} "${c.name}" 无任何生图数据`);
        }
    });

    // ===== 5. 初始化状态 =====
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
