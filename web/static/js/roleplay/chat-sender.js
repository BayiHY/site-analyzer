// === Section: 消息发送主流程 ===
// 构建对话历史 → 调用 LLM → 渲染回复 → 触发后处理

App.sendMessage = async function() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    const activeChar = state.characters[state.activeCharIndex];

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

    try {
        // ===== 1. 构建对话历史 =====
        const historyModule = await import('./history-builder.js');
        const historyMessages = historyModule.buildHistory(state.messages);

        // ===== 2. 构建全局上下文 =====
        const allChars = state.characters || [];

        // ===== 3. 加载提示词模块 =====
        const [worldviewModule, cardModule, sceneModule, emotionModule, formatModule, metaModule] = await Promise.all([
            import('./system-prompt/worldview.js'),
            import('./system-prompt/character-card.js'),
            import('./system-prompt/scene-rules.js'),
            import('./system-prompt/emotion-guide.js'),
            import('./system-prompt/format-requirements.js'),
            import('./system-prompt/metadata-requirements.js'),
        ]);

        const systemPrompt = `你是${activeChar.name}，${activeChar.gender ? activeChar.gender + '性' : ''}${activeChar.age ? '，' + activeChar.age + '岁' : ''}。
请使用中文回复。

${worldviewModule.buildWorldview(state)}

${cardModule.buildCharacterCard(activeChar, state)}

${sceneModule.buildSceneRules(allChars, activeChar, state)}

${emotionModule.buildEmotionGuide(activeChar.name, state)}

${formatModule.buildFormatRequirements()}

${metaModule.buildMetadataRequirements()}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...historyMessages
        ];

        rpLog('info', 'TIMEOUT', `LLM 请求开始: chat, history_msgs=${messages.length}`);
        const chatStart = Date.now();
        const response = await App.agnesChat(messages);
        const chatElapsed = Date.now() - chatStart;
        rpLog('info', 'TIMEOUT', `LLM 请求完成: chat, 耗时 ${chatElapsed}ms, output_chars=${(response || '').length}`);
        if (chatElapsed > 60000) {
            rpLog('error', 'TIMEOUT', `⚠️ 超时警告: chat 请求耗时 ${chatElapsed}ms`);
        }

        hideTyping();

        // ===== 4. 提取场景元数据 =====
        const metaModuleRaw = await import('./scene-metadata.js');
        const meta = metaModuleRaw.extractSceneMetadata(response);
        if (meta) {
            rpLog('info', 'META', `解析到场景元数据: presentCharacters=${JSON.stringify(meta.presentCharacters)}, sceneDesc=${meta.sceneDesc?.slice(0, 50)}`);
        } else {
            rpLog('warn', 'META', '未解析到场景元数据，将使用正则 fallback');
        }

        // ===== 5. 解析多角色回复 =====
        const parsedMessages = await App.parseMultiCharReply(response, state.activeCharIndex, meta);

        for (const msg of parsedMessages) {
            state.messages.push(msg);
            renderMessage(msg);
        }
        await saveMessages();

        // 角色消息渲染完成，立即解锁发送按钮
        document.getElementById('send-btn').disabled = false;

        // ===== 6. 后处理：4 项并行执行 =====
        Promise.allSettled([
            // 后处理 1: 场景图生成 → 见 scene-images.js
            (async () => {
                try {
                    const sceneDesc = meta?.sceneDesc || App.parseSceneFromReply(response);
                    if (sceneDesc && App.isSceneChanged(activeChar.name, sceneDesc)) {
                        await App.generateSceneImage(activeChar.name, sceneDesc, activeChar, response, meta);
                    }
                } catch (e) {
                    console.warn('场景图生成失败:', e);
                }
            })(),
            // 后处理 2: 情感指标更新 → 见 emotion-update.js
            (async () => {
                try {
                    await App.updateEmotions(activeChar.name, text, response);
                } catch (e) {
                    console.warn('情感更新失败:', e);
                }
            })(),
            // 后处理 3: 信息披露评估 → 见 progressive-disclosure.js
            (async () => {
                try {
                    await App.updateRevealedInfo(activeChar.name, text, response);
                    if (state.currentPanel === 'characters') {
                        document.getElementById('panel-body').innerHTML = renderCharactersPanel();
                    }
                } catch (e) {
                    console.warn('信息披露评估失败:', e);
                }
            })(),
            // 后处理 4: 动态属性更新 → 见 dynamic-attrs.js
            (async () => {
                try {
                    await App.updateDynamicAttributes(activeChar.name, text, response);
                } catch (e) {
                    console.warn('动态属性更新失败:', e);
                }
            })()
        ]);

    } catch (err) {
        hideTyping();
        addSystemMessage(`回复失败: ${err.message || '未知错误'}`);
        document.getElementById('send-btn').disabled = false;
    }
}

// === 多角色回复解析器 ===
// 编排 json-stripper → scene-extractor → reply-extractor → char-splitter → content-parser
// 格式: {场景}角色1:(动作)语言[内心想法]┆角色2:(动作)语言[内心想法]<建议回复1|建议回复2|建议回复3>

App.parseMultiCharReply = async function(rawText, defaultCharIndex, metadata) {
    const messages = [];
    let text = rawText.trim();

    // 步骤 1: 剥离 JSON 元数据块
    const jsonStripper = await import('./json-stripper.js');
    text = jsonStripper.stripJsonBlock(text);

    // 步骤 2: 提取场景
    const sceneExtractor = await import('./scene-extractor.js');
    const { sceneText, remaining: afterScene } = sceneExtractor.extractScene(text);

    // 步骤 3: 提取建议回复
    const replyExtractor = await import('./reply-extractor.js');
    const { replies: suggestedReplies, remaining: afterReply } = replyExtractor.extractSuggestedReplies(afterScene);

    // 步骤 4: 分割角色段落
    const charSplitter = await import('./char-splitter.js');
    const charParts = charSplitter.splitCharParts(afterReply);

    // 步骤 5: 解析每个角色段落
    const contentParser = await import('./content-parser.js');
    for (const part of charParts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const { charName, charIdx, action, dialogue, thought, formattedContent } = contentParser.parseContent(trimmed, null, defaultCharIndex, suggestedReplies);

        messages.push({
            id: 'msg_char_' + Date.now() + '_' + charIdx,
            role: 'char',
            type: 'multi_char',
            content: formattedContent,
            charIndex: charIdx,
            charName: charName || state.characters[charIdx]?.name || '',
            action: action,
            dialogue: dialogue,
            thought: thought,
            suggestedReplies: suggestedReplies,
            timestamp: new Date().toISOString()
        });
        rpLog('INFO', 'PARSE-CHAR', `角色消息 #${messages.length} (charIdx=${charIdx}): 建议回复=${JSON.stringify(suggestedReplies)}, 动作="${action}", 对话="${dialogue}", 想法="${thought}"`);
    }

    // 附加场景消息
    if (sceneText) {
        const sceneMsg = {
            id: 'msg_scene_' + Date.now(),
            role: 'char',
            type: 'text',
            content: sceneText,
            charIndex: defaultCharIndex,
            isScene: true,
            timestamp: new Date().toISOString()
        };
        if (metadata) {
            sceneMsg._sceneMeta = metadata;
        }
        messages.unshift(sceneMsg);
    }

    // 如果没有解析出任何角色消息，fallback 为单条普通消息
    if (messages.length === 0) {
        messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: text,
            charIndex: defaultCharIndex,
            timestamp: new Date().toISOString()
        });
    }

    return messages;
};
