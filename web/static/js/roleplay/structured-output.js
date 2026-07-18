// === Section: 结构化输出智能体调用 ===
// 前端直接调用 Agnes LLM 返回结构化 JSON

/**
 * 调用 Agnes LLM 将非结构化故事内容解析为结构化 JSON
 * @param {string} storyContent - 非结构化故事内容
 * @param {Array<{name: string, desc: string, type?: string}>} schemaFields - 字段定义
 * @returns {Promise<object>} 结构化数据对象
 */
App.structuredOutput = async function(storyContent, schemaFields) {
    if (!storyContent || !storyContent.trim()) {
        throw new Error('storyContent 不能为空');
    }
    if (!Array.isArray(schemaFields) || schemaFields.length === 0) {
        throw new Error('schemaFields 不能为空数组');
    }

    rpLog('info', 'STRUCTURED', `=== 结构化输出请求 ===`);
    rpLog('info', 'STRUCTURED', `content_len=${storyContent.length}, fields=${schemaFields.map(f => f.name).join(',')}`);

    try {
        // 构建 system prompt
        const fieldDefs = schemaFields.map(f => `- ${f.name} (${f.type}): ${f.description || ''}`).join('\n');
        const systemPrompt = `你是一个结构化数据提取器。你的任务是将输入文本解析为严格的 JSON 对象，只包含以下定义的字段：

${fieldDefs}

【重要】你必须只输出合法的 JSON 对象，不要输出任何其他文字、解释或 markdown 标记。JSON 必须能被标准 JSON.parse() 解析。`;

        // 构建 user message
        const userMessage = `请从以下内容中提取结构化数据：\n\n${storyContent}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        rpLog('info', 'STRUCTURED', '调用 Agnes LLM 进行结构化输出...');
        const rawResponse = await App.agnesChat(messages, { temperature: 0.1 });
        
        rpLog('info', 'STRUCTURED', `LLM 原始返回 (长度=${rawResponse?.length || 0}): "${rawResponse?.substring(0, 200)}..."`);

        // 解析 JSON（处理中文引号、markdown 包裹等）
        const data = App.parseJson(rawResponse);
        if (!data) {
            throw new Error(`JSON 解析失败，原始返回: ${rawResponse.substring(0, 200)}`);
        }

        rpLog('info', 'STRUCTURED', `✅ 成功: ${Object.keys(data).join(',')}`);
        return data;

    } catch (e) {
        rpLog('error', 'STRUCTURED', `❌ ${e.message}`);
        throw e;
    }
};
