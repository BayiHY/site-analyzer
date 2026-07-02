// === 对话历史构建器 ===
// 从 state.messages 中筛选有意义的对话，过滤 UI 噪声，返回 LLM 可用的历史

const HISTORY_LIMIT = 20;

const uiNoisePatterns = [
    /^正在/, /^✅/, /^⚠️/, /^❌/, /^🎨/, /^🔄/, /^📝/, /^🔍/, /^👥/, /^📊/, /^🏗️/
];

const isUINoise = (text) => {
    if (!text || typeof text !== 'string') return false;
    return uiNoisePatterns.some(p => p.test(text.trim()));
};

/**
 * 构建 LLM 对话历史
 * @param {Array} messages - state.messages
 * @returns {Array<{role: string, content: string}>}
 */
export function buildHistory(messages) {
    return messages
        .filter(m => {
            // 保留 user 和 char 类型的消息
            if (m.role === 'user' || m.role === 'char') return true;
            // 过滤 UI 噪声
            if (m.type === 'system' && isUINoise(m.content)) return false;
            // 保留非噪声的 system 消息（如开场白）
            if (m.type === 'system') return true;
            return false;
        })
        .slice(-HISTORY_LIMIT)
        .map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content || ''
        }));
}
