// === Section: 消息发送主流程 ===
// 构建对话历史 → 对话智能体编故事 → 结构化智能体拆JSON → 前端消费结构化数据

App.sendMessage = async function() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    // 发送任何消息前清理底部选项胶囊，避免旧选项残留
    const replyOpts = document.getElementById('reply-options');
    if (replyOpts) replyOpts.innerHTML = '';

    input.value = '';
    input.style.height = 'auto';

    rpLog('info', 'TIMEOUT', `sendMessage 开始: "${text.slice(0, 50)}..."`);

    // 用户消息
    state.messages.push({
        id: 'msg_' + Date.now(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: new Date().toISOString()
    });
    renderMessage(state.messages[state.messages.length - 1]);
    await saveMessages();

    // 显示加载
    document.getElementById('send-btn').disabled = true;
    showTyping();
    rpLog('info', 'TIMEOUT', '用户消息已渲染，开始构建历史');

    try {
        // ===== 1. 构建对话历史 =====
        const historyModule = await import('./history-builder.js');
        const historyMessages = historyModule.buildHistory(state.messages);

        // ===== 2. 构建全局上下文 =====
        const allChars = state.characters || [];

        // ===== 3. 加载提示词模块 =====
        const [worldviewModule, cardModule, sceneModule, emotionModule, formatModule] = await Promise.all([
            import('./system-prompt/worldview.js'),
            import('./system-prompt/character-card.js'),
            import('./system-prompt/scene-rules.js'),
            import('./system-prompt/emotion-guide.js'),
            import('./system-prompt/format-requirements.js'),
        ]);

        const systemPrompt = `你是沉浸式多人角色扮演游戏专属剧情生成智能体。请严格依据以下全部输入信息进行创作：故事大纲、当前剧情阶段、完整历史对话、所有角色基础信息、各角色对玩家的情感指标、玩家最新行为/对话。
请使用中文回复。

${worldviewModule.buildWorldview(state)}

${cardModule.buildCharacterCard(state)}

${sceneModule.buildSceneRules(allChars, state)}

${emotionModule.buildEmotionGuide(state)}

${formatModule.buildFormatRequirements()}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...historyMessages
        ];

        rpLog('info', 'TIMEOUT', `LLM 请求开始: chat, history_msgs=${messages.length}`);
        const chatStart = Date.now();
        let response = await App.agnesChat(messages, { route: 'chat' });
        const chatElapsed = Date.now() - chatStart;
        rpLog('info', 'TIMEOUT', `LLM 请求完成: chat, 耗时 ${chatElapsed}ms, output_chars=${(response || '').length}`);
        if (chatElapsed > 60000) {
            rpLog('error', 'TIMEOUT', `⚠️ 超时警告: chat 请求耗时 ${chatElapsed}ms`);
        }

        // ===== 4. 调用结构化智能体拆 JSON =====
        rpLog('info', 'TIMEOUT', '调用结构化智能体拆分回复...');
        rpLog('info', 'TIMEOUT', `原始回复内容: ${response.slice(0, 500)}${response.length > 500 ? '...' : ''}`);
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

        // ===== 5. 渲染结构化消息 =====
        const baseMs = Date.now();
        const renderedMessages = App.structuredToMessages(structuredResult, 'msg_' + baseMs);

        for (const msg of renderedMessages) {
            state.messages.push(msg);
            renderMessage(msg);
        }
        await saveMessages();

        // 角色消息渲染完成，立即解锁发送按钮
        hideTyping();
        document.getElementById('send-btn').disabled = false;

        // ===== 6. 应用结构化更新（情感/属性/信息披露） =====
        const charNames = structuredResult.characters ? structuredResult.characters.map(c => c.name) : [];
        App.applyStructuredUpdates(structuredResult, charNames);

        // ===== 7. 后处理 =====
        rpLog('info', 'TIMEOUT', '后处理开始');
        const postProcessStart = Date.now();
        // 从结构化结果中提取首个发言角色（用于场景图/建议回复）
        const firstChar = structuredResult.characters?.[0] || null;
        Promise.allSettled([
            // 后处理 1: 场景图生成（异步，不阻塞对话渲染）
            (async () => {
                try {
                    rpLog('info', 'TIMEOUT', '后处理[1/3] 场景图生成开始');
                    const sceneImgModule = await import('./scene-images.js');
                    if (structuredResult.scene && firstChar && App.isSceneChanged(firstChar.name, structuredResult.scene)) {
                        App.generateSceneImage(firstChar.name, structuredResult.scene, firstChar, structuredResult, null).catch(e => {
                            rpLog('error', 'SCENE', `场景图生成失败: ${e.message}`);
                        });
                    }
                    rpLog('info', 'TIMEOUT', `后处理[1/3] 场景图已提交（不等待完成）`);
                } catch (e) {
                    console.warn('场景图生成失败:', e);
                }
            })(),
            // 后处理 2: 异步生成建议回复选项
            (async () => {
                try {
                    rpLog('info', 'TIMEOUT', '后处理[2/3] 异步建议回复生成开始');
                    await new Promise(r => setTimeout(r, 500));
                    const lastCharDialog = structuredResult.characters?.[0]?.dialogue || '';
                    const opts = await App.generateReplyOptions({
                        lastUserMessage: text,
                        lastCharResponse: lastCharDialog,
                        recentMessages: state.messages.filter(m => m.role !== 'system').slice(-6)
                    });
                    if (opts && opts.length >= 2) {
                        App.renderReplyOptions(opts, state.messages[state.messages.length - 1]?.id || 'unknown');
                        rpLog('info', 'TIMEOUT', `后处理[2/3] 异步建议回复完成 (${opts.length} 条)`);
                    } else {
                        rpLog('warn', 'TIMEOUT', `后处理[2/3] 异步生成选项不足 (${opts?.length || 0} 条)`);
                    }
                } catch (e) {
                    console.warn('异步建议回复生成失败:', e);
                }
            })(),
            // 后处理 3: TTS 生成（原有逻辑）
            (async () => {
                try {
                    rpLog('info', 'TIMEOUT', '后处理[3/3] TTS 开始');
                    const ttsModule = await import('./tts-manager.js');
                    if (ttsModule && ttsModule.handlePostReply) {
                        await ttsModule.handlePostReply(structuredResult);
                    }
                    rpLog('info', 'TIMEOUT', `后处理[3/3] TTS 完成 (${Date.now()-postProcessStart}ms)`);
                } catch (e) {
                    console.warn('TTS 处理失败:', e);
                }
            })()
        ]).then(() => {
            rpLog('info', 'TIMEOUT', `后处理全部完成 (${Date.now()-postProcessStart}ms)`);
        });

    } catch (err) {
        rpLog('error', 'SEND', `❌ 发送失败: ${err.message}`);
        addSystemMessage(`回复失败: ${err.message || '未知错误'}`);
        hideTyping();
        document.getElementById('send-btn').disabled = false;
    }
}

// === 多角色回复解析器（保留作为向后兼容兜底） ===

App.parseMultiCharReply = async function(rawText, defaultCharIndex) {
    rpLog('warn', 'PARSE', 'parseMultiCharReply 已被弃用，请使用 structuredToMessages');
    const messages = [];
    const baseMs = Date.now();
    const baseTimestamp = new Date().toISOString();

    const sceneExtractor = await import('./scene-extractor.js');
    const { sceneText, remaining: afterScene } = sceneExtractor.extractScene(rawText);

    const replyExtractor = await import('./reply-extractor.js');
    replyExtractor.extractSuggestedReplies(afterScene);

    const charSplitter = await import('./char-splitter.js');
    const charParts = charSplitter.splitCharParts(afterScene);

    const contentParser = await import('./content-parser.js');
    for (let i = 0; i < charParts.length; i++) {
        const trimmed = charParts[i].trim();
        if (!trimmed) continue;

        const { charName, charIdx, action, dialogue, thought, formattedContent } = contentParser.parseContent(trimmed, null, defaultCharIndex);

        messages.push({
            id: 'msg_char_' + (baseMs + i + 1),
            role: 'char',
            type: 'multi_char',
            content: formattedContent,
            charIndex: charIdx,
            charName: charName || state.characters[charIdx]?.name || '',
            action: action,
            dialogue: dialogue,
            thought: thought,
            timestamp: new Date(baseMs + i + 1).toISOString()
        });
    }

    if (sceneText) {
        messages.unshift({
            id: 'msg_scene_' + baseMs,
            role: 'char',
            type: 'text',
            content: sceneText,
            charIndex: defaultCharIndex,
            isScene: true,
            timestamp: baseTimestamp
        });
    }

    if (messages.length === 0) {
        messages.push({
            id: 'msg_' + baseMs,
            role: 'char',
            type: 'text',
            content: rawText,
            charIndex: defaultCharIndex,
            timestamp: baseTimestamp
        });
    }

    return messages;
};
