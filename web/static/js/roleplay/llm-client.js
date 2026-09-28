// === Section: LLM API 调用 ===
// 直调 Agnes AI 兼容端点

App.agnesChat = async function(messages, options = {}) {
    const apiKey = state.apiKeys.chat;
    if (!apiKey) {
        throw new Error('请先在设置中配置 API Key');
    }

    const temperature = options.temperature ?? 1.0;
    const model = options.model || 'agnes-2.5-flash';
    const route = options.route || 'default';

    // 结构化输出路由使用低温度保证格式稳定
    const tempByRoute = {
        'chat': 0.3,          // 多角色对话回复：严格格式
        'opening': 0.7,       // 序章生成：高温度创意，结构化智能体兜底格式
        'emotion': 0.2,       // 情感评估：JSON 格式
        'disclosure': 0.2,    // 信息披露：JSON 格式
        'worldview': 0.7,     // 世界观生成：需要创意
        'characters': 0.3,    // 角色生成：TSV 格式
        'repair': 0.1,        // 角色消息兜底修正：极低温度保证格式稳定
        'default': temperature
    };
    const effectiveTemp = tempByRoute[route] ?? temperature;

    // 计算输入总字符数
    const inputChars = JSON.stringify(messages).length;

    rpLog('info', 'LLM', `=== 对话请求开始 ===`);
    rpLog('info', 'LLM', `模型: ${model}`);
    rpLog('info', 'LLM', `端点: https://api.agnes-ai.cn/v1/chat/completions`);
    rpLog('info', 'LLM', `路由: ${route}, 温度: ${effectiveTemp} (原始=${temperature})`);
    rpLog('info', 'LLM', `输入字符数: ${inputChars}`);

    // 【日志】输出完整请求内容（每条消息的 role + content）
    rpLog('info', 'LLM-REQUEST', '--- 完整请求内容 ---');
    messages.forEach((m, idx) => {
        rpLog('info', 'LLM-REQUEST', `[消息 ${idx}] role=${m.role}, content_len=${(m.content || '').length}`);
        const c = m.content || '';
        rpLog('info', 'LLM-REQUEST', c.length > 10000 ? c.slice(0, 10000) + '\n\n[内容过长，已截断至10000字符，原始长度=' + c.length + ']' : c);
    });

    const startTime = Date.now();
    
    // 动态计算 max_tokens：输入字符估算为 token，留出足够输出空间
    // Agnes 上下文最大是 8192，输入 + 输出不超过这个值
    const estimatedInputTokens = Math.ceil(inputChars / 4);
    const maxOutputTokens = Math.max(1024, 8192 - estimatedInputTokens);
    // [fix#9] 提高上限：结构化拆分需要输出完整 JSON，4096 不够用
    const finalMaxTokens = Math.min(maxOutputTokens, 8192);
    
    rpLog('info', 'LLM', `输入估算 ${estimatedInputTokens} tokens, 输出上限 ${finalMaxTokens} tokens`);
    
    const resp = await fetch('https://api.agnes-ai.cn/v1/chat/completions', {
        method: 'POST',
        headers: Object.assign({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        }),
        body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: effectiveTemp,
            max_tokens: finalMaxTokens
        }),
        signal: AbortSignal.timeout(120000)
    });
    const elapsedMs = Date.now() - startTime;

    if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData.error?.message || errData.message || `API 错误 (${resp.status})`;
        rpLog('error', 'LLM', `❌ 对话请求失败: ${errMsg}`);
        
        // 将详细错误信息返回给调用方，便于前端展示具体原因
        throw new Error(`${errMsg} (状态码: ${resp.status})`);
    }

    const rawText = await resp.text();
    rpLog('info', 'LLM-API', `[fix#9] Chat API 原始响应 (${resp.status}): ${rawText.slice(0, 500)}`);
    
    // [fix#9] 先解析 JSON，再提取 content，最后清洗 markdown
    let data;
    try {
        data = JSON.parse(rawText);
    } catch (e) {
        rpLog('error', 'LLM-API', `[fix#9] 原始 JSON 解析失败: ${e.message}`);
        rpLog('error', 'LLM-API', `[fix#9] 原始文本前300字符: ${rawText.slice(0, 300)}`);
        throw new Error(`API 响应不是合法 JSON: ${e.message}`);
    }
    
    let reply = data.choices?.[0]?.message?.content || '';
    
    // [fix#9] 对 content 字段应用 markdown 清洗（移除代码块包裹、bold标记等）
    if (reply && typeof App.cleanMarkdown === 'function') {
        const cleaned = App.cleanMarkdown(reply);
        if (cleaned !== reply) {
            rpLog('info', 'LLM-API', `[fix#9] markdown 清洗完成: ${(reply||'').length} → ${cleaned.length} 字符`);
        }
        reply = cleaned;
    }
    
    const outputChars = reply.length;

    // 【日志】输出完整返回内容
    rpLog('info', 'LLM-RESPONSE', '--- 完整返回内容 ---');
    const respDisplay = reply.length > 10000 ? reply.slice(0, 10000) + '\n\n[内容过长，已截断至10000字符，原始长度=' + reply.length + ']' : reply;
    rpLog('info', 'LLM-RESPONSE', respDisplay);

    rpLog('info', 'LLM', `✅ 对话请求成功, 耗时: ${(elapsedMs/1000).toFixed(1)}s, 输入: ${inputChars}字符, 输出: ${outputChars}字符`);
    rpLog('debug', 'LLM', `回复预览: ${reply.slice(0, 120)}...`);
    
    // 检查空响应 — Agnes API 有时会返回空内容，抛出错误让重试机制处理
    if (outputChars === 0 || !reply.trim()) {
        rpLog('error', 'LLM', `❌ API 返回空响应，将触发重试`);
        throw new Error('Empty response from API');
    }
    
    return reply;
}
