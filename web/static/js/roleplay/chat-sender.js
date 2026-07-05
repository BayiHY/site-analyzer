// === Section: 消息发送主流程 ===
// 构建对话历史 → 调用 LLM → 渲染回复 → 触发后处理

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

        // ===== 4. 解析多角色回复 =====
        const parsedMessages = await App.parseMultiCharReply(response, state.activeCharIndex);

        // ===== 4.5 检查解析层重试信号（2026-07-04 新增） =====
        // 注意：建议回复缺失不再触发重试，改为后台异步生成
        let needsRetry = parsedMessages.some(m => m._needsRetry);
        if (needsRetry) {
            const firstRetryMsg = parsedMessages.find(m => m._needsRetry);
            let retryReason = firstRetryMsg?._retryReason || '未知原因';
            rpLog('error', 'PARSE-RETRY', `⚠️ 解析层要求重试: ${retryReason}，丢弃当前回复并重新请求`);
            // 重新请求 LLM
            rpLog('info', 'PARSE-RETRY', '重新构建历史并请求 LLM...');
            const retryMessages = [
                { role: 'system', content: systemPrompt },
                ...historyMessages,
                { role: 'user', content: text + '\n\n【强制要求】上一次回复格式严重偏离，请严格按照以下格式回复：\n场景描述（纯文本，不要加标签行）\n:角色1:(动作/神态)「对话内容」[内心想法]\n:角色2:(动作/神态)「对话内容」[内心想法]\n<回复1┇回复2┇回复3>' }
            ];
            const retryResponse = await App.agnesChatWithFallback(retryMessages, { route: 'chat' });
            const retryParsed = await App.parseMultiCharReply(retryResponse, state.activeCharIndex);
            for (const msg of retryParsed) {
                state.messages.push(msg);
                renderMessage(msg);
            }
            await saveMessages();
            hideTyping();
            document.getElementById('send-btn').disabled = false;
            rpLog('info', 'PARSE-RETRY', `✅ 重试成功`);
            // 更新 response 为重试结果，确保后处理使用正确的内容
            response = retryResponse;
        } else {
            for (const msg of parsedMessages) {
                state.messages.push(msg);
                renderMessage(msg);
            }
            await saveMessages();

            // 角色消息渲染完成，立即解锁发送按钮
            hideTyping();
            document.getElementById('send-btn').disabled = false;
        }

        // ===== 5. 后处理：5 项并行执行 =====
        rpLog('info', 'TIMEOUT', '后处理开始: 5 项并行');
        const postProcessStart = Date.now();
        Promise.allSettled([
            // 后处理 1: 场景图生成 → 见 scene-images.js
            (async () => {
                try {
                    rpLog('info', 'TIMEOUT', '后处理[1/5] 场景图生成开始');
                    const sceneDesc = App.parseSceneFromReply(response);
                    if (sceneDesc && App.isSceneChanged(activeChar.name, sceneDesc)) {
                        await App.generateSceneImage(activeChar.name, sceneDesc, activeChar, response, null);
                    }
                    rpLog('info', 'TIMEOUT', `后处理[1/5] 场景图完成 (${Date.now()-postProcessStart}ms)`);
                } catch (e) {
                    console.warn('场景图生成失败:', e);
                }
            })(),
            // 后处理 2: 情感指标更新 → 见 emotion-update.js
            (async () => {
                try {
                    rpLog('info', 'TIMEOUT', '后处理[2/5] 情感更新开始');
                    await App.updateEmotions(activeChar.name, text, response);
                    rpLog('info', 'TIMEOUT', `后处理[2/5] 情感完成 (${Date.now()-postProcessStart}ms)`);
                } catch (e) {
                    console.warn('情感更新失败:', e);
                }
            })(),
            // 后处理 3: 信息披露评估 → 见 progressive-disclosure.js
            (async () => {
                try {
                    rpLog('info', 'TIMEOUT', '后处理[3/5] 信息披露开始');
                    await App.updateRevealedInfo(activeChar.name, text, response);
                    if (state.currentPanel === 'characters') {
                        document.getElementById('panel-body').innerHTML = renderCharactersPanel();
                    }
                    rpLog('info', 'TIMEOUT', `后处理[3/5] 信息披露完成 (${Date.now()-postProcessStart}ms)`);
                } catch (e) {
                    console.warn('信息披露评估失败:', e);
                }
            })(),
            // 后处理 4: 动态属性更新 → 见 dynamic-attrs.js
            (async () => {
                try {
                    rpLog('info', 'TIMEOUT', '后处理[4/5] 动态属性开始');
                    await App.updateDynamicAttributes(activeChar.name, text, response);
                    rpLog('info', 'TIMEOUT', `后处理[4/5] 动态属性完成 (${Date.now()-postProcessStart}ms)`);
                } catch (e) {
                    console.warn('动态属性更新失败:', e);
                }
            })(),
            // 后处理 5: 异步生成建议回复选项（仅在 LLM 未提供 <> 标签时触发）
            (async () => {
                try {
                    rpLog('info', 'TIMEOUT', '后处理[5/5] 异步建议回复生成开始');
                    // 检查是否已有建议回复（从解析的消息中提取）
                    const lastMsg = state.messages[state.messages.length - 1];
                    const hasReplies = lastMsg && lastMsg.suggestedReplies && lastMsg.suggestedReplies.length >= 2;
                    if (hasReplies) {
                        rpLog('info', 'TIMEOUT', '后处理[5/5] 已有建议回复，跳过异步生成');
                        return;
                    }
                    rpLog('info', 'TIMEOUT', '后处理[5/5] 无建议回复，触发异步生成');
                    // 延迟 500ms 开始，避免与角色消息渲染竞争
                    await new Promise(r => setTimeout(r, 500));
                    const opts = await App.generateReplyOptions(text, response);
                    if (opts && opts.length >= 2) {
                        App.renderReplyOptions(opts, lastMsg?.id || 'unknown');
                        rpLog('info', 'TIMEOUT', `后处理[5/5] 异步建议回复完成 (${opts.length} 条)`);
                    } else {
                        rpLog('warn', 'TIMEOUT', `后处理[5/5] 异步生成选项不足 (${opts?.length || 0} 条)`);
                    }
                } catch (e) {
                    console.warn('异步建议回复生成失败:', e);
                }
            })()
        ]).then(() => {
            rpLog('info', 'TIMEOUT', `后处理全部完成 (${Date.now()-postProcessStart}ms)`);
        });

    } catch (err) {
        addSystemMessage(`回复失败: ${err.message || '未知错误'}`);
        hideTyping();
        document.getElementById('send-btn').disabled = false;
    }
}

// === 多角色回复解析器 ===
// 编排 scene-extractor → reply-extractor → char-splitter → content-parser
// 格式: {场景}角色1:(动作)语言[内心想法]┆角色2:(动作)语言[内心想法]<建议回复1|建议回复2|建议回复3>

App.parseMultiCharReply = async function(rawText, defaultCharIndex) {
    const messages = [];
    let text = rawText.trim();
    rpLog('info', 'TIMEOUT', `解析多角色回复开始: ${(text||'').length} 字符`);
    const parseStart = Date.now();

    // 统一时间戳基准：确保场景消息的时间戳早于角色消息
    const baseTimestamp = new Date().toISOString();
    const baseMs = Date.now();

    try {
        // 步骤 1: 提取场景
        const sceneExtractor = await import('./scene-extractor.js');
        const { sceneText, remaining: afterScene } = sceneExtractor.extractScene(text);

        // 步骤 2: 提取建议回复（2026-07-04 增强：返回 needsRetry 信号）
        const replyExtractor = await import('./reply-extractor.js');
        const replyResult = replyExtractor.extractSuggestedReplies(afterScene);
        const { replies: suggestedReplies, remaining: afterReply, needsRetry: replyNeedsRetry, retryReason: replyRetryReason } = replyResult;

        // 步骤 3: 分割角色段落
        const charSplitter = await import('./char-splitter.js');
        const charParts = charSplitter.splitCharParts(afterReply);

        // 步骤 4: 解析每个角色段落
        const contentParser = await import('./content-parser.js');
        for (let i = 0; i < charParts.length; i++) {
            const trimmed = charParts[i].trim();
            if (!trimmed) continue;

            const { charName, charIdx, action, dialogue, thought, formattedContent } = contentParser.parseContent(trimmed, null, defaultCharIndex, suggestedReplies);

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
                suggestedReplies: suggestedReplies,
                timestamp: new Date(baseMs + i + 1).toISOString()
            });
            rpLog('INFO', 'PARSE-CHAR', `角色消息 #${messages.length} (charIdx=${charIdx}): 建议回复=${JSON.stringify(suggestedReplies)}, 动作="${action}", 对话="${dialogue}", 想法="${thought}"`);
        }

        // ===== 格式校验层：检测 LLM 回复是否严重偏离格式 =====
        const formatValidator = await import('./format-validator.js');
        const formatResult = formatValidator.validateFormat(rawText, messages);
        if (formatResult.missingScene || formatResult.missingPrefix || formatResult.missingReplies) {
            rpLog('warn', 'FORMAT-CHECK', `格式偏离: 场景描述=${formatResult.missingScene ? '缺失' : '有'}, 角色前缀=${formatResult.missingPrefix ? '缺失' : '有'}, 建议回复=${formatResult.missingReplies ? '缺失' : '有'}, 触发重试: ${formatResult.shouldRetry}`);
        }

        // ===== 角色身份一致性校验（2026-07-04 新增） =====
        const identityValidator = await import('./identity-validator.js');
        const identityResult = identityValidator.validateIdentityConsistency(messages, state.characters);
        if (!identityResult.valid) {
            rpLog('warn', 'IDENTITY-CHECK', `身份校验失败: ${identityResult.conflicts.map(c => `${c.charName}: ${c.reason}`).join('; ')}`);
        }

        // ===== 场景在场规则校验 =====
        if (messages.length > 0) {
            const presenceValidator = await import('./scene-presence-validator.js');
            const presenceResult = presenceValidator.validateScenePresence(
                rawText,
                state.characters[state.activeCharIndex]?.name,
                state.characters
            );
            if (!presenceResult.valid) {
                rpLog('warn', 'SCENE-RULE', `场景在场规则违反: ${presenceResult.conflicts.join(', ')} 声明不在场但实际出场`);
                // 标记为需要重试，后续在 sendMessage 中处理
                messages[0]._sceneRuleViolation = presenceResult;
            }
        }

        // ===== 综合重试信号（2026-07-04 增强） =====
        // 注意：建议回复缺失/质量差不再触发重试，改为后台异步生成
        // 重试仅针对严重格式偏离和身份冲突
        let overallNeedsRetry = formatResult.shouldRetry || identityResult.conflicts.length > 2;
        // 同时记录是否需要后台异步生成建议回复
        const needsAsyncReplyOptions = !replyResult.replies || replyResult.replies.length < 2;
        if (overallNeedsRetry) {
            const reasons = [];
            if (formatResult.shouldRetry) reasons.push(`格式偏离[${formatResult.details.join(',')}]`);
            if (identityResult.conflicts.length > 2) reasons.push(`身份冲突[${identityResult.conflicts.length}条]`);
            rpLog('error', 'PARSE-RETRY', `⚠️ 解析层触发重试信号: ${reasons.join('; ')}`);
            // 在第一条消息上标记重试原因，供 sendMessage 捕获
            if (messages.length > 0) {
                messages[0]._needsRetry = true;
                messages[0]._retryReason = reasons.join('; ');
            }
        }
        // 将异步生成信号附加到第一条消息，供 sendMessage 捕获
        if (needsAsyncReplyOptions && messages.length > 0) {
            messages[0]._needsAsyncReplyOptions = true;
        }

        // 附加场景消息（时间戳必须在所有角色消息之前）
        if (sceneText) {
            const sceneMsg = {
                id: 'msg_scene_' + baseMs,
                role: 'char',
                type: 'text',
                content: sceneText,
                charIndex: defaultCharIndex,
                isScene: true,
                timestamp: baseTimestamp
            };
            messages.unshift(sceneMsg);
        }

        // 如果没有解析出任何角色消息，fallback 为单条普通消息
        if (messages.length === 0) {
            rpLog('warn', 'PARSE', '⚠️ 未解析出任何角色消息，使用 fallback 原始文本');
            messages.push({
                id: 'msg_' + baseMs,
                role: 'char',
                type: 'text',
                content: text,
                charIndex: defaultCharIndex,
                timestamp: baseTimestamp
            });
        }
    } catch (parseErr) {
        // 解析异常兜底：确保至少有一条消息返回，不会让消息被吞
        rpLog('error', 'PARSE', `解析异常，使用兜底消息: ${parseErr.message}`);
        messages.push({
            id: 'msg_' + baseMs,
            role: 'char',
            type: 'text',
            content: rawText,
            charIndex: defaultCharIndex,
            timestamp: baseTimestamp
        });
    }

    rpLog('info', 'TIMEOUT', `解析多角色回复完成: ${messages.length} 条消息, 耗时 ${Date.now()-parseStart}ms`);
    return messages;
};
