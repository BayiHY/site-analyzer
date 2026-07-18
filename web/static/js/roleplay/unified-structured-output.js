// === Section: 统一结构化输出智能体 ===
// 前端直接调用 Agnes LLM 执行结构化转换

/**
 * 统一的结构化输出调用函数
 * @param {Object} inputConfig - 输入配置
 * @param {string} inputConfig.content - 需要结构化的内容
 * @param {string} inputConfig.format - 输入格式 (默认: text/plain)
 * @param {Object} inputConfig.context - 上下文信息 (可选)
 * @param {Object} outputConfig - 输出配置
 * @param {Array} outputConfig.schema - 字段定义数组
 * @param {string} outputConfig.format - 输出格式 (默认: application/json)
 * @param {Object} outputConfig.rules - 验证规则 (可选)
 * @returns {Promise<object>} 结构化数据对象
 */
App.unifiedStructuredOutput = async function(inputConfig, outputConfig) {
    if (!inputConfig || !inputConfig.content) {
        throw new Error('inputConfig.content 不能为空');
    }
    if (!outputConfig || !outputConfig.schema) {
        throw new Error('outputConfig.schema 不能为空');
    }

    rpLog('info', 'STRUCTURED', `=== 统一结构化输出请求 ===`);
    rpLog('info', 'STRUCTURED', `content_len=${inputConfig.content.length}, schema=${outputConfig.schema.map(f => f.name).join(',')}`);

    try {
        // 构建 system prompt
        const fieldDefs = outputConfig.schema.map(f => 
            `- ${f.name} (${f.type || 'string'}): ${f.description || ''}${f.required ? ' [必填]' : ''}`
        ).join('\n');
        
        const rulesStr = outputConfig.rules ? JSON.stringify(outputConfig.rules, null, 2) : '';
        const systemPrompt = `你是一个结构化数据提取器。你的任务是将输入文本解析为严格的 JSON 对象。

【字段定义】
${fieldDefs}

${rulesStr ? `【验证规则】\n${rulesStr}` : ''}

【重要】你必须只输出合法的 JSON 对象，不要输出任何其他文字、解释或 markdown 标记。JSON 必须能被标准 JSON.parse() 解析。`;

        // 构建 user message
        let userMessage = `请从以下内容中提取结构化数据：\n\n${inputConfig.content}`;
        if (inputConfig.context && Object.keys(inputConfig.context).length > 0) {
            userMessage += `\n\n【上下文信息】\n${JSON.stringify(inputConfig.context, null, 2)}`;
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        rpLog('info', 'STRUCTURED', '调用 Agnes LLM 进行统一结构化输出...');
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

/**
 * 角色扮演场景的结构化拆分
 * @param {string} rawText - LLM 输出的自然语言文本
 * @param {Array} characters - 角色列表
 * @param {Object} emotions - 情感状态
 * @param {Object} dynamicAttrs - 动态属性
 * @param {Object} revealedInfo - 已发现信息
 * @returns {Promise<object>} 结构化拆分结果
 */
App.structuredParseReply = async function(rawText, characters = [], emotions = {}, dynamicAttrs = {}, revealedInfo = {}) {
    if (!rawText || !rawText.trim()) {
        throw new Error('rawText 不能为空');
    }

    rpLog('info', 'STRUCTURED-PARSE', `结构化拆分开始: rawText=${rawText.length}字符`);
    rpLog('info', 'STRUCTURED-PARSE', `rawText 前500字符: ${rawText.substring(0, 500)}`);
    rpLog('info', 'STRUCTURED-PARSE', `characters=${characters.length}个, emotions=${Object.keys(emotions).length}个`);

    try {
        const result = await App.unifiedStructuredOutput(
            {
                content: rawText,
                format: 'text/plain',
                context: {
                    characters,
                    emotions,
                    dynamicAttrs,
                    revealedInfo,
                    player: state.player
                }
            },
            {
                schema: [
                    {
                        name: 'scene',
                        type: 'string',
                        description: '场景描述',
                        required: true
                    },
                    {
                        name: 'characters',
                        type: 'array',
                        description: '角色列表',
                        required: true,
                        items: {
                            name: 'string',
                            action: 'string',
                            dialogue: 'string',
                            thought: 'string'
                        }
                    },
                    {
                        name: 'suggestedReplies',
                        type: 'array',
                        description: '建议回复选项',
                        required: true,
                        items: 'string'
                    },
                    {
                        name: 'emotionDelta',
                        type: 'object',
                        description: '情感变化',
                        required: false
                    },
                    {
                        name: 'dynamicAttrs',
                        type: 'object',
                        description: '动态属性',
                        required: false
                    },
                    {
                        name: 'revealedInfo',
                        type: 'object',
                        description: '信息披露',
                        required: false
                    }
                ],
                format: 'application/json',
                rules: {
                    requiredFields: ['scene', 'characters', 'suggestedReplies'],
                    allowExtraFields: false,
                    fieldTypes: {
                        'scene': 'string',
                        'characters': 'array',
                        'suggestedReplies': 'array',
                        'emotionDelta': 'object',
                        'dynamicAttrs': 'object',
                        'revealedInfo': 'object'
                    }
                }
            }
        );

        rpLog('info', 'STRUCTURED-PARSE', `✅ 结构化拆分成功: scene=${(result.scene || '').length}字符, chars=${(result.characters || []).length}个, replies=${(result.suggestedReplies || []).length}条`);
        // 详细日志：每个角色的 thought 字段
        for (const c of (result.characters || [])) {
            rpLog('info', 'STRUCTURED-PARSE', `  角色[${c.name || '?'}]: action=${(c.action||'').length}字, dialogue=${(c.dialogue||'').length}字, thought=${(c.thought||'').length}字 [预览:${(c.thought||'').substring(0,80)}]`);
        }

        return {
            scene: result.scene || '',
            characters: (result.characters || []).map(c => ({
                name: c.name || '',
                action: c.action || '',
                dialogue: c.dialogue || '',
                thought: c.thought || ''
            })),
            suggestedReplies: result.suggestedReplies || [],
            emotionDelta: result.emotionDelta || {},
            dynamicAttrs: result.dynamicAttrs || {},
            revealedInfo: result.revealedInfo || {}
        };

    } catch (e) {
        rpLog('error', 'STRUCTURED-PARSE', `❌ ${e.message}`);
        throw e;
    }
};

/**
 * 通用文本结构化
 * @param {string} content - 需要结构化的内容
 * @param {Array} fieldDefinitions - 字段定义数组
 * @returns {Promise<object>} 结构化数据对象
 */
App.generalStructuredParse = async function(content, fieldDefinitions) {
    if (!content || !content.trim()) {
        throw new Error('content 不能为空');
    }
    if (!Array.isArray(fieldDefinitions) || fieldDefinitions.length === 0) {
        throw new Error('fieldDefinitions 不能为空数组');
    }

    rpLog('info', 'GENERAL-STRUCTURED', `=== 通用结构化请求 ===`);
    rpLog('info', 'GENERAL-STRUCTURED', `content_len=${content.length}, fields=${fieldDefinitions.map(f => f.name).join(',')}`);

    try {
        const result = await App.unifiedStructuredOutput(
            {
                content: content,
                format: 'text/plain'
            },
            {
                schema: fieldDefinitions,
                format: 'application/json',
                rules: {
                    allowExtraFields: false,
                    fieldTypes: {}
                }
            }
        );

        rpLog('info', 'GENERAL-STRUCTURED', `✅ 通用结构化成功: ${Object.keys(result).join(',')}`);
        return result;

    } catch (e) {
        rpLog('error', 'STRUCTURED', `❌ ${e.message}`);
        throw e;
    }
};
