// === Section: LLM 降级重试封装 ===
// 统一封装 agnesChat，提供自动降级 + 重试能力
// 所有 LLM 调用都通过此模块发起，避免各模块各自实现重试逻辑

// 降级链定义：按优先级排列的模型列表
// 每个元素: { model, temperature, label }
App.LLM_FALLBACK_CHAIN = [
    { model: 'agnes-2.0-flash', temperature: null, label: 'agnes-2.0-flash' },
    { model: 'agnes-1.5-flash', temperature: null, label: 'agnes-1.5-flash' },
    { model: 'glm-4.5-flash', temperature: null, label: 'glm-4.5-flash' },
];

/**
 * 判断错误是否需要降级重试
 * @param {Error|string} err - 错误对象或消息
 * @returns {{ shouldRetry: boolean, reason: string }}
 */
App.shouldRetryOnError = function(err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    
    // 超时/中断 — 需要重试
    if (msg.includes('abort') || msg.includes('timed out') || msg.includes('network_error') || msg.includes('failed to fetch')) {
        return { shouldRetry: true, reason: '超时/网络中断' };
    }
    
    // 429 限流
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
        return { shouldRetry: true, reason: 'API 限流' };
    }
    
    // 5xx 服务端错误
    if (msg.match(/5\d\d/)) {
        return { shouldRetry: true, reason: '服务端错误' };
    }
    
    // 404 Not Found — 模型不存在/路由错误，需要降级重试
    if (msg.includes('not found') || msg.includes('404') || msg.includes('notfound') || msg.includes('openaipredictionnotfoundexception')) {
        return { shouldRetry: true, reason: '模型不存在/路由错误' };
    }
    
    // 模型不存在/切换
    if (msg.includes('model not found') || msg.includes('does not exist') || msg.includes('invalid model')) {
        return { shouldRetry: true, reason: '模型不可用' };
    }
    
    // 400 客户端错误 — 部分可重试（如参数格式问题）
    if (msg.includes('400') || msg.includes('bad request')) {
        return { shouldRetry: true, reason: '请求参数错误' };
    }
    
    // 内容过滤（不算重试，直接抛错）
    if (msg.includes('content policy') || msg.includes('safety') || msg.includes('filtered')) {
        return { shouldRetry: false, reason: '内容过滤' };
    }
    
    return { shouldRetry: false, reason: '未知错误' };
};

/**
 * 带自动降级的 LLM 调用
 * @param {Array} messages - 消息数组
 * @param {Object} options - { route, temperature, maxRetries, fallbackChain }
 * @returns {Promise<string>} LLM 回复文本
 */
App.agnesChatWithFallback = async function(messages, options = {}) {
    const route = options.route || 'default';
    const maxRetries = options.maxRetries ?? 2;
    const baseTemperature = options.temperature;
    
    // 构建当前 API key 对应的降级链
    const apiKey = state.apiKeys.chat;
    const provider = App.detectProvider(apiKey);
    
    // 从配置中取降级链，允许外部覆盖
    let chain = options.fallbackChain || App.LLM_FALLBACK_CHAIN;
    
    // 如果是 glm key，glm-4.5-flash 应该在链首
    if (provider === 'glm') {
        chain = chain.filter(c => c.label !== 'agnes-2.0-flash' && c.label !== 'agnes-1.5-flash');
        chain.unshift({ model: 'glm-4.5-flash', temperature: null, label: 'glm-4.5-flash' });
    }
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // 确定当前使用的模型
        let currentModel;
        let currentTemp = baseTemperature;
        
        if (attempt === 0) {
            // 首次尝试：用用户指定的模型或默认
            currentModel = options.model;
        } else {
            // 降级：取链中下一个模型
            const fallbackIdx = attempt - 1;
            if (fallbackIdx < chain.length) {
                currentModel = chain[fallbackIdx].model;
                currentTemp = baseTemperature ?? chain[fallbackIdx].temperature;
                rpLog('warn', 'FALLBACK', `降级到模型: ${currentModel} (第 ${attempt} 次重试)`);
            } else {
                rpLog('error', 'FALLBACK', `所有降级模型已耗尽`);
                break;
            }
        }
        
        // 计算路由温度
        const tempByRoute = {
            'chat': 0.3,
            'opening': 0.7,       // 序章：高温度创意，结构化智能体兜底格式
            'emotion': 0.2,
            'disclosure': 0.2,
            'worldview': 0.7,
            'characters': 0.3,
            'repair': 0.1,        // 兜底修正：极低温度
            'default': currentTemp ?? 1.0
        };
        const effectiveTemp = tempByRoute[route] ?? tempByRoute.default;
        
        rpLog('info', 'FALLBACK', `调用模型: ${currentModel}, 路由: ${route}, 温度: ${effectiveTemp}, 重试次数: ${attempt}`);
        
        try {
            const result = await App.agnesChat(messages, {
                model: currentModel,
                temperature: effectiveTemp,
                route: route
            });
            
            if (attempt > 0) {
                rpLog('info', 'FALLBACK', `✅ 降级重试成功 (使用 ${currentModel})`);
            }
            
            return result;
        } catch (err) {
            lastError = err;
            const errInfo = App.shouldRetryOnError(err);
            
            if (!errInfo.shouldRetry || attempt >= maxRetries) {
                // 不再重试
                rpLog('error', 'FALLBACK', `❌ 不再重试: ${errInfo.reason} - ${err.message || String(err)}`);
                break;
            }
            
            rpLog('warn', 'FALLBACK', `⚠️ 第 ${attempt} 次尝试失败 (${errInfo.reason}): ${err.message || String(err)}，准备降级重试...`);
        }
    }
    
    // 所有重试都失败了
    throw lastError || new Error('LLM 调用失败，所有重试均已耗尽');
};
