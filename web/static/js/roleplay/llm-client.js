// === Section: LLM API 调用 ===
// 直调 Agnes AI 兼容端点

App.agnesChat = async function(messages, options = {}) {
    const apiKey = state.apiKeys.chat;
    if (!apiKey) {
        throw new Error('请先在设置中配置 API Key');
    }

    const temperature = options.temperature ?? 1.0;
    const model = options.model || 'agnes-2.0-flash';
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
    rpLog('info', 'LLM', `端点: https://apihub.agnes-ai.com/v1/chat/completions`);
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
    const resp = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: effectiveTemp,
            max_tokens: 2048
        }),
        signal: AbortSignal.timeout(120000)
    });
    const elapsedMs = Date.now() - startTime;

    if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData.error?.message || errData.message || `API 错误 (${resp.status})`;
        rpLog('error', 'LLM', `❌ 对话请求失败: ${errMsg}`);
        throw new Error(errMsg);
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || '';
    const outputChars = reply.length;

    // 【日志】输出完整返回内容
    rpLog('info', 'LLM-RESPONSE', '--- 完整返回内容 ---');
    const respDisplay = reply.length > 10000 ? reply.slice(0, 10000) + '\n\n[内容过长，已截断至10000字符，原始长度=' + reply.length + ']' : reply;
    rpLog('info', 'LLM-RESPONSE', respDisplay);

    rpLog('info', 'LLM', `✅ 对话请求成功, 耗时: ${(elapsedMs/1000).toFixed(1)}s, 输入: ${inputChars}字符, 输出: ${outputChars}字符`);
    rpLog('debug', 'LLM', `回复预览: ${reply.slice(0, 120)}...`);
    return reply;
}
