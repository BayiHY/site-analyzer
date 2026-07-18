// === 对话历史构建器 ===
// 从 state.messages 中筛选有意义的对话，过滤 UI 噪声，返回 LLM 可用的历史

const HISTORY_LIMIT = 20;

const uiNoisePatterns = [
    /^正在/, /^✅/, /^⚠️/, /^❌/, /^🎨/, /^🔄/, /^📝/, /^🔍/, /^👥/, /^📊/, /^🏗️/
];

// 检测是否为图片 URL（外部图片链接）
const isImageUrl = (text) => {
    if (!text || typeof text !== 'string') return false;
    return /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i.test(text.trim()) ||
           /https?:\/\/.*\.(png|jpg|jpeg|gif|webp|svg|bmp)/i.test(text.trim());
};

// 检测是否为系统提示/生成状态消息
const isSystemHint = (text) => {
    if (!text || typeof text !== 'string') return false;
    return /正在生成|生成中|🖼️|🎨|✅ 角色|✅ 头像|✅ 场景|💾|📋|🔄 正在|⏳|📊|🔧|📁|🗂️|📦|🛠️|🧹|🏗️|📐|🔌|⚙️/.test(text.trim());
};

const isUINoise = (text) => {
    if (!text || typeof text !== 'string') return false;
    return uiNoisePatterns.some(p => p.test(text.trim()));
};

/**
 * 构建 LLM 对话历史
 * 严格过滤：只保留真正的对话内容
 * - user 消息：玩家发言
 * - char 对话消息：NPC 实际发言（排除场景描述、动作、内心想法）
 * - 过滤：图片URL、系统提示、场景描述、动作神态
 * @param {Array} messages - state.messages
 * @returns {Array<{role: string, content: string}>}
 */
export function buildHistory(messages) {
    const filtered = [];
    let totalFiltered = 0;

    for (const m of messages) {
        const content = (m.content || '').trim();

        // 保留 user 消息（玩家发言）
        if (m.role === 'user') {
            filtered.push({ role: 'user', content: content, _source: 'user' });
            continue;
        }

        // 过滤：场景消息（isScene=true 或包含图片URL）
        if (m.isScene === true || m.type === 'scene') {
            totalFiltered++;
            continue;
        }

        // 过滤：图片URL消息
        if (m.type === 'image' || isImageUrl(content)) {
            totalFiltered++;
            continue;
        }

        // 过滤：UI 噪声
        if (m.type === 'system' && isUINoise(content)) {
            totalFiltered++;
            continue;
        }

        // 过滤：系统提示/生成状态消息
        if (m.type === 'system' && isSystemHint(content)) {
            totalFiltered++;
            continue;
        }

        // 保留非噪声的 system 消息（如开场白）
        if (m.type === 'system') {
            filtered.push({ role: 'system', content: content, _source: 'system' });
            continue;
        }

        // char 消息：保留对话内容，但过滤掉纯场景描述和结构化解析后的动作/神态/内心想法片段
        if (m.role === 'char') {
            // 如果是多角色消息，需要过滤掉其中的动作/想法片段
            if (m.type === 'multi_char') {
                // 结构化解析后的消息，使用角色对话智能体提示词要求的标准化格式
                // 格式：【角色名】xxx 【动作】xxx 【语言】xxx 【内心】xxx
                // 移除【内心】标记，只保留角色名+动作+语言，但保留格式让 LLM 学习
                let cleanContent = content
                    .replace(/【内心】.*?/g, '')  // 移除【内心】xxx 标记
                    .replace(/\s+/g, ' ')     // 合并多余空格
                    .trim();

                // 如果过滤后内容为空，说明全是标记，不入历史
                if (!cleanContent) {
                    totalFiltered++;
                } else {
                    filtered.push({ role: 'assistant', content: cleanContent, _source: 'char-multi' });
                }
            } else if (m.type === 'text') {
                // 普通文本消息：如果是场景描述（以括号开头或包含大量环境词），过滤
                if (content.match(/^\(.*\)$/)) {
                    // 純动作描述，不入历史
                    totalFiltered++;
                } else {
                    filtered.push({ role: 'assistant', content: content, _source: 'char-text' });
                }
            } else {
                filtered.push({ role: 'assistant', content: content, _source: 'char-' + (m.type || 'unknown') });
            }
        }
    }

    rpLog('info', 'HISTORY-BUILD', `消息过滤: 原始 ${messages.length} 条 → 保留 ${filtered.length} 条, 过滤 ${totalFiltered} 条`);

    // 只保留最近 HISTORY_LIMIT 条
    const result = filtered.slice(-HISTORY_LIMIT).map(m => ({
        role: m.role,
        content: m.content
    }));

    rpLog('info', 'HISTORY-FILTER', `最终历史消息数: ${result.length}, 来源分布: ${countSources(filtered)}`);

    return result;
}

function countSources(filtered) {
    const counts = {};
    for (const m of filtered) {
        const src = m._source || 'unknown';
        counts[src] = (counts[src] || 0) + 1;
    }
    return Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(', ');
}
