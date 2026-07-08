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
    const promptModule = await import('./char-prompt.js');
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

    // ===== Step 2: 调用后端 /api/roleplay/char-bio 生成详细小传 =====
    rpLog('info', 'CHARS', 'Step 2: 调用后端生成详细小传...');
    addSystemMessage(`正在生成 ${basicChars.length} 个角色的详细小传...`);

    const worldview = state.story.worldview || '未设定';
    const bioPayload = {
        worldview: worldview,
        characters: basicChars.map(c => ({
            name: c.name,
            gender: c.gender || '未知',
            age: parseInt(c.age) || 20,
            relationship: c.relationship || '与主角的关系待定'
        }))
    };

    let bioResp;
    try {
        const bioStartTime = Date.now();
        rpLog('info', 'TIMEOUT', `Step 2 后端请求开始: char-bio, count=${bioPayload.characters.length}`);
        
        const bioReq = await fetch('/api/roleplay/char-bio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bioPayload)
        });

        if (!bioReq.ok) {
            const errText = await bioReq.text();
            throw new Error(`后端请求失败: ${bioReq.status} - ${errText}`);
        }

        bioResp = await bioReq.json();
        const bioElapsed = Date.now() - bioStartTime;
        rpLog('info', 'TIMEOUT', `Step 2 后端请求完成: char-bio, 耗时 ${bioElapsed}ms`);
    } catch (e) {
        rpLog('error', 'CHARS', `Step 2 后端调用失败: ${e.message}`);
        throw new Error(`小传生成失败: ${e.message}`);
    }

    if (!bioResp || !bioResp.success || !bioResp.bios || bioResp.bios.length === 0) {
        throw new Error('小传生成失败：后端未返回有效数据');
    }

    rpLog('info', 'CHARS', `Step 2 完成: ${bioResp.success_count}/${bioResp.total} 角色小传生成成功`);
    if (bioResp.failed && bioResp.failed.length > 0) {
        rpLog('warn', 'CHARS', `失败角色: ${bioResp.failed.join(', ')}`);
    }

    // ===== 合并基本信息和详细小传 =====
    const bioMap = {};
    for (const item of bioResp.bios) {
        if (item.bio) {
            bioMap[item.name] = item.bio;
        }
    }

    // ===== 3. 保存角色 =====
    state.characters = basicChars.map((c, i) => {
        const bio = bioMap[c.name] || {};
        const modules = {
            imageFace: bio.imageFace || '',
            imageHair: bio.imageHair || '',
            imageBody: bio.imageBody || '',
            imageClothes: bio.imageClothes || '',
            imageEnvironment: bio.imageEnvironment || ''
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
            personality: bio.personality || '',
            background: bio.background || '',
            relationship: bio.relationship || c.relationship || '',
            faceImageUrl: '',
            portraitImageUrl: '',
            imagePrompt: imagePrompt,
            perception: '',
            secret: bio.secret || '',
            currentMood: '',
            motivation: bio.motivation || '',
            speechStyle: bio.speechStyle || '',
            voice: bio.voice || '',
            ttsPitch: bio.ttsPitch || '',
            ttsRate: bio.ttsRate || '',
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

        const hasModuleFields = rawKeys.some(k => k.startsWith('imageFace'));
        if (!hasModuleFields) {
            rpLog('warn', 'CHARS', '角色数据中没有模块化字段，头像将使用备用 prompt');
        } else {
            rpLog('info', 'CHARS', '检测到模块化字段，将使用模块化三级降级生图');
        }
    }

    // ===== 4. 声线去重 =====
    const voiceModule = await import('./voice-allocation.js');
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
