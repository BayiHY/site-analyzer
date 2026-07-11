// === Section: 序章生成（使用对话智能体 + 结构化拆分） ===
// 序章生成不再使用独立的 opening-gen 提示词，而是复用对话智能体的完整系统提示词
// 生成后通过 structuredParseReply 拆分为结构化数据，再由 structuredToMessages 渲染

App.generateOpeningScene = async function() {
    if (!state.story || !state.story.worldview) {
        rpLog('warn', 'OPENING', '世界观尚未生成，跳过序章生成');
        return { rawText: '', structured: null };
    }
    if (!state.characters || state.characters.length === 0) {
        rpLog('warn', 'OPENING', '角色尚未生成，跳过序章生成');
        return { rawText: '', structured: null };
    }

    rpLog('info', 'OPENING', '开始生成序章场景（对话智能体模式）');
    addSystemMessage('✍️ 正在生成序章场景...');

    // 加载与 chat-sender 相同的提示词模块
    const [worldviewModule, cardModule, sceneModule, emotionModule, formatModule] = await Promise.all([
        import('./system-prompt/worldview.js'),
        import('./system-prompt/character-card.js'),
        import('./system-prompt/scene-rules.js'),
        import('./system-prompt/emotion-guide.js'),
        import('./system-prompt/format-requirements.js'),
    ]);

    const allChars = state.characters || [];

    // 构建系统提示词（与对话智能体完全一致）
    const systemPrompt = `你是沉浸式多人角色扮演游戏专属剧情生成智能体。请严格依据以下全部输入信息进行创作：故事大纲、当前剧情阶段、完整历史对话、所有角色基础信息、各角色对玩家的情感指标、玩家最新行为/对话。
请使用中文回复。

${worldviewModule.buildWorldview(state)}

${cardModule.buildCharacterCard(state)}

${sceneModule.buildSceneRules(allChars, state)}

${emotionModule.buildEmotionGuide(state)}

${formatModule.buildFormatRequirements()}`;

    // 用户消息：序章阶段没有历史对话，直接给出创作指令
    const userInspiration = state.story.userInspiration || '无';
    const userMessage = `【序章创作指令】\n\n这是故事的开端，请基于世界观和角色设定创作一段沉浸式序章场景。要求：\n1. 场景描写生动，角色对话自然\n2. 必须使用以下角色的真实姓名\n3. 体现角色性格和世界观氛围\n4. 结尾附上 3 条玩家可选回复\n\n用户原始灵感：${userInspiration}`;

    try {
        const startTime = Date.now();
        rpLog('info', 'TIMEOUT', `LLM 请求开始: opening_scene (对话智能体)`);

        // 调用对话智能体（route='opening', 温度 0.7），走降级重试
        const response = await App.agnesChatWithFallback([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ], { route: 'opening' });

        const elapsed = Date.now() - startTime;
        rpLog('info', 'TIMEOUT', `LLM 请求完成: opening_scene, 耗时 ${elapsed}ms, 输出长度: ${response?.length || 0}`);

        // 调用结构化智能体拆分
        rpLog('info', 'TIMEOUT', '调用结构化智能体拆分序章回复...');
        const structStart = Date.now();
        const structuredResult = await App.structuredParseReply(response, {
            characters: allChars,
            emotions: state.emotions || {},
            dynamicAttrs: Object.fromEntries(
                allChars.map(c => [c.name, {
                    perception: c.perception || '',
                    secret: c.secret || '',
                    currentMood: c.currentMood || ''
                }])
            ),
            revealedInfo: state.revealed || {}
        });
        rpLog('info', 'TIMEOUT', `结构化拆分完成: 耗时 ${Date.now()-structStart}ms, scene=${(structuredResult.scene || '').length}字符, chars=${(structuredResult.characters || []).length}个`);

        rpLog('info', 'OPENING', `序章生成完成（对话智能体模式）: scene=${(structuredResult.scene || '').length}字符, chars=${structuredResult.characters?.length || 0}`);
        // 生成 rawText 供场景图生成使用（create-flow.js / two-stage.js 取 result.rawText）
        const rawText = App.structuredToRawText(structuredResult);
        rpLog('info', 'OPENING', `rawText 长度: ${rawText.length} 字符`);
        return { rawText, structured: structuredResult };

    } catch (err) {
        rpLog('error', 'OPENING', `序章生成失败: ${err.message}`);
        addSystemMessage(`⚠️ 序章生成失败: ${err.message}`);
        return { rawText: '', structured: null };
    }
};

/**
 * 将结构化结果转换为原始文本（场景+角色对话），用于场景图生成和旧管线兼容
 * @param {Object} structured - structuredParseReply 的返回结果
 * @returns {string} 原始文本
 */
App.structuredToRawText = function(structured) {
    const parts = [];
    if (structured.scene) {
        parts.push(structured.scene);
    }
    for (const charData of (structured.characters || [])) {
        let line = `:${charData.name}:`;
        if (charData.action) line += `(${charData.action})`;
        if (charData.dialogue) line += charData.dialogue;
        if (charData.thought) line += `[${charData.thought}]`;
        parts.push(line);
    }
    return parts.join('\n');
};
