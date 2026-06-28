// === Section: LLM API 调用 ===
// 直调 OpenAI 兼容端点

App.agnesChat = async function(messages) {
    const apiKey = state.apiKeys.chat;
    if (!apiKey) {
        throw new Error('请先在设置中配置 API Key');
    }

    const resp = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'agnes-2.0-flash',
            messages: messages,
            temperature: 1.2,
            max_tokens: 2048
        }),
        signal: AbortSignal.timeout(120000)
    });

    if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData.error?.message || errData.message || `API 错误 (${resp.status})`;
        throw new Error(errMsg);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
}
