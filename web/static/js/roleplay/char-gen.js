// === Section: 角色生成主流程（两步流程）===
// Step 1: Agnes 生成基本信息 (name, age, gender, relationship)
// Step 2: 后端 /api/roleplay/char-bio 并行生成详细小传

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

    // ===== Step 1: 调用 Agnes 生成基本信息 =====
    rpLog('info', 'CHARS', 'Step 1: 调用 Agnes 生成基本信息...');
    rpLog('info', 'CHARS', `[DEBUG] import path: '/static/js/roleplay/char-prompt.js?v=${Date.now()}'`);
    const promptModule = await import('/static/js/roleplay/char-prompt.js?v=' + Date.now());
    rpLog('info', 'CHARS', `[DEBUG] module keys: ${Object.keys(promptModule).join(', ')}`);
    rpLog('info', 'CHARS', `[DEBUG] buildCharBasicPrompt type: ${typeof promptModule.buildCharBasicPrompt}`);
    if (typeof promptModule.buildCharBasicPrompt !== 'function') {
        throw new Error(`buildCharBasicPrompt is not a function, keys: ${Object.keys(promptModule).join(', ')}`);
    }
    const basicPrompt = promptModule.buildCharBasicPrompt(count, playerGender, inspiration, genderHint, state);

    let basicChars = [];
    let retryCount = 0;
    const maxRetries = 2;
    let retrySuffix = '';

    do {
        rpLog('info', 'TIMEOUT', `Step 1 LLM 请求开始: basic chars, count=${count}, retry=${retryCount}`);
        const startTime = Date.now();
        let resp = await App.agnesChatWithFallback([
            {
                role: 'system',
                content: '你是专业的角色设计师，擅长创造立体、有深度的虚构角色。输出必须严格按照分隔符格式。'
            }, {
                role: 'user',
                content: basicPrompt + retrySuffix
            }
        ], { route: 'characters' });
        const elapsed = Date.now() - startTime;
        rpLog('info', 'TIMEOUT', `Step 1 LLM 请求完成: basic chars, 耗时 ${elapsed}ms`);

        try {
            const parsedBlocks = parseDelimited(resp);
            if (parsedBlocks && Array.isArray(parsedBlocks)) {
                basicChars = parsedBlocks.filter(c => c.name && c.name.trim());
            }
        } catch (e) {
            rpLog('warn', 'CHARS', `Step 1 解析失败: ${e.message}`);
        }

        if (basicChars.length < count && retryCount < maxRetries) {
            retryCount++;
            const shortfall = count - basicChars.length;
            const existingList = basicChars.map(c => `${c.name}(${c.gender},${c.age})`).join(', ');
            retrySuffix = `\n\n【强制要求】上次生成了 ${basicChars.length} 个角色，还需 ${shortfall} 个。请只生成缺失的角色，不要覆盖已有角色：${existingList}`;
            rpLog('warn', 'CHARS', `Step 1 重试 (${retryCount}/${maxRetries}), 缺 ${shortfall} 个`);
        }
    } while (basicChars.length < count && retryCount < maxRetries);

    if (basicChars.length === 0) {
        throw new Error('角色生成失败：未能从 Agnes 获取任何角色基本信息');
    }

    rpLog('info', 'CHARS', `Step 1 完成: 获取 ${basicChars.length} 个角色基本信息`);
    rpLog('info', 'CHARS', `基本信息: ${JSON.stringify(basicChars.map(c => ({name:c.name,age:c.age,gender:c.gender,relationship:c.relationship})))}`);

    // ===== Step 2: 前端直调 Agnes LLM 生成人物内核 =====
    rpLog('info', 'CHARS', 'Step 2: 调用 Agnes LLM 生成人物内核（性格/背景/秘密/动机）...');
    addSystemMessage(`正在为 ${basicChars.length} 个角色生成人物内核...`);

    const worldview = state.story.worldview || '未设定';

    /**
     * 为单个角色生成小传（前端直调 Agnes LLM）
     */
    async function generateSingleBio(charBasic) {
        const charName = charBasic.name || '?';
        const charGender = charBasic.gender || '未知';
        const charAge = charBasic.age || 20;
        const charRelationship = charBasic.relationship || '与主角的关系待定';

        const systemPrompt = `你是资深角色编剧，擅长为虚构角色创作立体、有深度的背景故事。请根据世界观和角色基础信息，生成人物内核。

【输出格式要求】
请按以下标准化文本格式输出（每行一个字段，格式为 key: value）：
name: 角色名
gender: 性别
age: 年龄
personality: 性格特点（50 字以内，包含优点和缺点）
background: 背景故事（100 字以内）
motivation: 核心动机（20 字以内）
secret: 秘密（30 字以内）
speechStyle: 说话风格（20 字以内）
relationships: 角色关系网（30 字以内）
origin: 出身（50 字以内）
abilities: 能力与短板（30 字以内）
likes: 喜恶（20 字以内）
habits: 习惯癖好（20 字以内）
appearance: 外貌描述（直接从输入中复制，不要重新生成）
voice: 声线（直接从输入中复制，不要重新生成）
ttsPitch: TTS 音高参数（直接从输入中复制）
ttsRate: TTS 语速参数（直接从输入中复制）
imageFace: 面部生图描述（直接从输入中复制）
imageHair: 发型生图描述（直接从输入中复制）
imageBody: 身材生图描述（直接从输入中复制）
imageClothes: 服装生图描述（直接从输入中复制）
imageEnvironment: 场景环境生图描述（直接从输入中复制）

⚠️ 注意：appearance/voice/ttsPitch/ttsRate/imageFace/imageHair/imageBody/imageClothes/imageEnvironment 字段必须直接复制输入中的值，不要重新生成！`;

        const userContent = `【世界观概要】
${worldview}

【角色基础信息】
- 姓名：${charName}
- 性别：${charGender}
- 年龄：${charAge}
- 外貌：${charBasic.appearance || '待生成'}
- 声线：${charBasic.voice || '未指定'}
- 性格：${charBasic.personality || '待生成'}
- 关系网：${charBasic.relationships || '待生成'}
- 出身：${charBasic.origin || '待生成'}
- 核心动机：${charBasic.motivation || '待生成'}
- 能力与短板：${charBasic.abilities || '待生成'}
- 喜恶：${charBasic.likes || '待生成'}
- 习惯癖好：${charBasic.habits || '待生成'}
- TTS 音高：${charBasic.ttsPitch || '未指定'}
- TTS 语速：${charBasic.ttsRate || '未指定'}
- 面部生图：${charBasic.imageFace || '未指定'}
- 发型生图：${charBasic.imageHair || '未指定'}
- 身材生图：${charBasic.imageBody || '未指定'}
- 服装生图：${charBasic.imageClothes || '未指定'}
- 场景生图：${charBasic.imageEnvironment || '未指定'}

请为该角色生成人物内核档案。注意：
1. personality/background/motivation/secret/speechStyle/relationships/origin/abilities/likes/habits 由你创作
2. appearance/voice/ttsPitch/ttsRate/imageFace/imageHair/imageBody/imageClothes/imageEnvironment 必须直接复制上面的值
3. 按标准化文本格式输出，每行一个字段，格式为 key: value
4. 不要使用 markdown 代码块包裹输出，直接输出文本`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ];

        rpLog('info', 'CHARS-BIO', `生成 ${charName} 的小传...`);
        const rawResponse = await App.agnesChat(messages, { temperature: 0.8 });

        // 解析标准化文本格式（key: value）
        const bio = {};
        const lines = rawResponse.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) continue;
            const key = line.substring(0, colonIdx).trim();
            const value = line.substring(colonIdx + 1).trim();
            if (key && value) {
                bio[key] = value;
            }
        }

        // 校验必要字段
        if (!bio.name || bio.name === '?') {
            rpLog('warn', 'CHARS-BIO', `⚠️ ${charName} 小传校验失败：name 字段为空或无效`);
            return null;
        }

        // 补全缺失字段（从 Step 1 透传）
        if (!bio.appearance && charBasic.appearance) bio.appearance = charBasic.appearance;
        if (!bio.voice && charBasic.voice) {
            bio.voice = charBasic.voice;
            bio.ttsPitch = charBasic.ttsPitch || '';
            bio.ttsRate = charBasic.ttsRate || '';
        }
        if (!bio.imageFace && charBasic.imageFace) bio.imageFace = charBasic.imageFace;
        if (!bio.imageHair && charBasic.imageHair) bio.imageHair = charBasic.imageHair;
        if (!bio.imageBody && charBasic.imageBody) bio.imageBody = charBasic.imageBody;
        if (!bio.imageClothes && charBasic.imageClothes) bio.imageClothes = charBasic.imageClothes;
        if (!bio.imageEnvironment && charBasic.imageEnvironment) bio.imageEnvironment = charBasic.imageEnvironment;

        // 设置默认值
        bio.gender = bio.gender || charGender;
        bio.age = bio.age || String(charAge);
        bio.personality = bio.personality || (charBasic.personality || '');

        rpLog('info', 'CHARS-BIO', `✅ ${charName} 小传生成成功`);
        return bio;
    }

    // 顺序生成所有角色的生物（批量调用，只发1次LLM请求）
    const bioMap = {};
    const failedNames = [];
    const bioStartTime = Date.now();

    // 批量生成：1次LLM请求生成所有角色内核
    try {
        rpLog('info', 'CHARS-BIO', `批量生成 ${basicChars.length} 个角色内核...`);
        const batchSize = basicChars.length;
        const worldview = state.story.worldview || '未设定';

        const batchSystemPrompt = `你是资深角色编剧，擅长为虚构角色创作立体、有深度的背景故事。请根据世界观和角色基础信息，一次性为所有角色生成人物内核。

【输出格式要求】
每个角色按以下标准化文本格式输出（每行一个字段，格式为 key: value），一个角色输出完成后换行再输出下一个角色：

name: 角色名
gender: 性别
age: 年龄
personality: 性格特点（50字以内，包含优点和缺点）
background: 背景故事（100字以内）
motivation: 核心动机（20字以内）
secret: 秘密（30字以内）
speechStyle: 说话风格（20字以内）
relationships: 角色关系网（30字以内）
origin: 出身（50字以内）
abilities: 能力与短板（30字以内）
likes: 喜恶（20字以内）
habits: 习惯癖好（20字以内）
appearance: 外貌描述（直接复制输入中的值）
voice: 声线（直接复制输入中的值）
ttsPitch: TTS音高参数（直接复制）
ttsRate: TTS语速参数（直接复制）
imageFace: 面部生图描述（直接复制）
imageHair: 发型生图描述（直接复制）
imageBody: 身材生图描述（直接复制）
imageClothes: 服装生图描述（直接复制）
imageEnvironment: 场景环境生图描述（直接复制）

⚠️ 注意：appearance/voice/ttsPitch/ttsRate/imageFace/imageHair/imageBody/imageClothes/imageEnvironment 字段必须直接复制输入中的值！`;

        let batchUserContent = `【世界观概要】\n${worldview}\n\n`;
        batchUserContent += `请为以下 ${batchSize} 个角色生成完整人物内核档案，严格按格式输出每个角色的全部字段：\n\n`;

        for (let i = 0; i < basicChars.length; i++) {
            const c = basicChars[i];
            batchUserContent += `【角色${i + 1}：${c.name}】\n`;
            batchUserContent += `name: ${c.name}\n`;
            batchUserContent += `gender: ${c.gender || '未知'}\n`;
            batchUserContent += `age: ${c.age || 20}\n`;
            batchUserContent += `appearance: ${c.appearance || '待生成'}\n`;
            batchUserContent += `voice: ${c.voice || '未指定'}\n`;
            batchUserContent += `personality: ${c.personality || '待生成'}\n`;
            batchUserContent += `relationship: ${c.relationship || '与主角的关系待定'}\n`;
            batchUserContent += `relationships: ${c.relationships || '待生成'}\n`;
            batchUserContent += `origin: ${c.origin || '待生成'}\n`;
            batchUserContent += `motivation: ${c.motivation || '待生成'}\n`;
            batchUserContent += `abilities: ${c.abilities || '待生成'}\n`;
            batchUserContent += `likes: ${c.likes || '待生成'}\n`;
            batchUserContent += `habits: ${c.habits || '待生成'}\n`;
            batchUserContent += `ttsPitch: ${c.ttsPitch || '未指定'}\n`;
            batchUserContent += `ttsRate: ${c.ttsRate || '未指定'}\n`;
            batchUserContent += `imageFace: ${c.imageFace || '未指定'}\n`;
            batchUserContent += `imageHair: ${c.imageHair || '未指定'}\n`;
            batchUserContent += `imageBody: ${c.imageBody || '未指定'}\n`;
            batchUserContent += `imageClothes: ${c.imageClothes || '未指定'}\n`;
            batchUserContent += `imageEnvironment: ${c.imageEnvironment || '未指定'}\n\n`;
        }

        const batchResponse = await App.agnesChat([
            { role: 'system', content: batchSystemPrompt },
            { role: 'user', content: batchUserContent }
        ], { temperature: 0.8 });

        rpLog('info', 'CHARS-BIO', `批量生成完成，解析 ${basicChars.length} 个角色内核...`);

        // 解析批量输出：按角色分隔符分割
        const charBlocks = batchResponse.split('【角色').filter(block => block.trim());
        rpLog('info', 'CHARS-BIO', `解析到 ${charBlocks.length} 个角色块`);

        for (let i = 0; i < charBlocks.length && i < basicChars.length; i++) {
            const block = charBlocks[i].trim();
            const bio = {};
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                const colonIdx = line.indexOf(':');
                if (colonIdx === -1) continue;
                const key = line.substring(0, colonIdx).trim();
                const value = line.substring(colonIdx + 1).trim();
                if (key && value) {
                    bio[key] = value;
                }
            }
            if (bio.name) {
                bioMap[bio.name] = bio;
            }
        }
    } catch (e) {
        rpLog('error', 'CHARS-BIO', `批量生成失败: ${e.message}`);
    }

    // 补全缺失字段
    for (const c of basicChars) {
        if (!bioMap[c.name]) {
            failedNames.push(c.name);
            continue;
        }
        const bio = bioMap[c.name];
        // 补全从 Step 1 透传的字段
        if (!bio.appearance && c.appearance) bio.appearance = c.appearance;
        if (!bio.voice && c.voice) {
            bio.voice = c.voice;
            bio.ttsPitch = c.ttsPitch || '';
            bio.ttsRate = c.ttsRate || '';
        }
        if (!bio.imageFace && c.imageFace) bio.imageFace = c.imageFace;
        if (!bio.imageHair && c.imageHair) bio.imageHair = c.imageHair;
        if (!bio.imageBody && c.imageBody) bio.imageBody = c.imageBody;
        if (!bio.imageClothes && c.imageClothes) bio.imageClothes = c.imageClothes;
        if (!bio.imageEnvironment && c.imageEnvironment) bio.imageEnvironment = c.imageEnvironment;
        // 设置默认值
        bio.gender = bio.gender || (c.gender || '未知');
        bio.age = bio.age || String(c.age || 20);
        bio.personality = bio.personality || (c.personality || '');
    }

    const bioElapsed = Date.now() - bioStartTime;
    const successCount = Object.keys(bioMap).length;
    rpLog('info', 'CHARS', `Step 2 完成: ${successCount}/${basicChars.length} 角色小传生成成功，耗时 ${bioElapsed}ms`);
    if (failedNames.length > 0) {
        rpLog('warn', 'CHARS', `失败角色: ${failedNames.join(', ')}`);
    }

    // ===== 3. 保存角色（过滤掉与玩家同名的角色）=====
    const playerName = state.player?.name || null;
    state.characters = basicChars
        .filter(c => {
            if (playerName && c.name === playerName) {
                rpLog('warn', 'CHARS', `已过滤与玩家同名的角色 "${c.name}"，避免身份重叠`);
                return false;
            }
            return true;
        })
        .map((c, i) => {
        const bio = bioMap[c.name] || {};
        const modules = {
            imageFace: bio.imageFace || c.imageFace || '',
            imageHair: bio.imageHair || c.imageHair || '',
            imageBody: bio.imageBody || c.imageBody || '',
            imageClothes: bio.imageClothes || c.imageClothes || '',
            imageEnvironment: bio.imageEnvironment || c.imageEnvironment || ''
        };

        const hasAnyModule = modules.imageFace || modules.imageHair || modules.imageBody || modules.imageClothes || modules.imageEnvironment;

        // 兼容旧格式
        let imagePrompt = bio.imagePrompt || '';
        if (!imagePrompt && !hasAnyModule) {
            const gender = c.gender === '男' ? 'male' : c.gender === '女' ? 'female' : 'person';
            const age = c.age || 20;
            const appearance = bio.appearance || c.appearance || '';
            const safeName = (c.name || 'unknown').replace(/[\u4e00-\u9fff]/g, '').trim() || 'unknown';
            imagePrompt = `Portrait of ${safeName}, ${age} year old ${gender}, ${appearance}, professional character concept art, detailed facial features, clean background`;
            rpLog('info', 'CHARS', `角色 #${i} "${c.name}" 无生图数据，已生成备用 prompt (safeName=${safeName})`);
        } else if (!imagePrompt && hasAnyModule) {
            const gender = c.gender === '男' ? 'male' : c.gender === '女' ? 'female' : 'person';
            const safeName = (c.name || 'unknown').replace(/[\u4e00-\u9fff]/g, '').trim() || 'unknown';
            imagePrompt = `Portrait of ${safeName}, ${c.age || 20} year old ${gender}, ${modules.imageFace || 'detailed facial features'}, ${state.story?.imageStyle || 'cel shaded anime style'}`;
            rpLog('info', 'CHARS', `角色 #${i} "${c.name}" 有模块化字段但无 imagePrompt，已生成兼容 prompt (safeName=${safeName})`);
        }

        return {
            name: c.name || bio.name || '未知角色',
            age: bio.age || parseInt(c.age) || 20,
            gender: bio.gender || c.gender || '未知',
            appearance: bio.appearance || c.appearance || '',
            personality: bio.personality || c.personality || '',
            background: bio.background || '',
            relationship: bio.relationship || c.relationship || c.relationships || '',
            faceImageUrl: '',
            portraitImageUrl: '',
            imagePrompt: imagePrompt,
            perception: '',
            secret: bio.secret || '',
            currentMood: '',
            motivation: bio.motivation || c.motivation || '',
            speechStyle: bio.speechStyle || '',
            voice: bio.voice || c.voice || '',
            ttsPitch: bio.ttsPitch || c.ttsPitch || '',
            ttsRate: bio.ttsRate || c.ttsRate || '',
            origin: bio.origin || c.origin || '',
            abilities: bio.abilities || c.abilities || '',
            likes: bio.likes || c.likes || '',
            habits: bio.habits || c.habits || '',
            relationships: bio.relationships || c.relationships || '',
            __modules__: modules
        };
    });

    // 诊断：记录角色字段结构
    if (state.characters.length > 0) {
        const sampleChar = state.characters[0];
        const rawKeys = Object.keys(sampleChar);
        rpLog('info', 'CHARS', `角色 #0 字段名: ${rawKeys.join(', ')}`);
        rpLog('info', 'CHARS', `角色 #0 数据预览: ${JSON.stringify(sampleChar).slice(0, 300)}`);

        // 检查每个角色的 image* 模块字段完整性
        for (let i = 0; i < state.characters.length; i++) {
            const c = state.characters[i];
            const imgFields = ['imageFace', 'imageHair', 'imageBody', 'imageClothes', 'imageEnvironment'];
            const filled = imgFields.filter(f => c.__modules__[f] && c.__modules__[f].trim().length > 0);
            const empty = imgFields.filter(f => !c.__modules__[f] || c.__modules__[f].trim().length === 0);
            if (empty.length > 0) {
                rpLog('warn', 'CHARS', `角色 #${i} "${c.name}" 缺少 image* 字段: ${empty.join(', ')} (已填: ${filled.join(', ')})`);
            }
        }

        const hasModules = sampleChar.__modules__ && Object.values(sampleChar.__modules__).some(v => v && v.trim().length > 0);
        if (!hasModules) {
            rpLog('warn', 'CHARS', '角色数据中没有模块化字段，头像将使用备用 prompt');
        } else {
            rpLog('info', 'CHARS', '检测到模块化字段，将使用模块化三级降级生图');
        }
    }

    // ===== 4. 声线去重 =====
    const voiceModule = await import('/static/js/roleplay/voice-allocation.js?v=' + Date.now());
    // TTS_VOICES 从全局 App 对象获取（tts-engine.js 已挂载到 window.App）
    const ttsVoices = (typeof window !== 'undefined' && window._TTS_VOICES) || {};
    voiceModule.allocateVoices(state.characters);

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
