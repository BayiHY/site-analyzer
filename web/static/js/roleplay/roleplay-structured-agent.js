// === Section: 角色扮演结构化智能体前端适配器 ===
// 管线：对话智能体编故事(原始文本) → structuredParseReply(调后端拆JSON) → 前端消费结构化数据

const ROLEPLAY_API_BASE = '/api';

/**
 * 结构化字段定义（供后端拆分智能体使用）
 * 对话智能体输出自然文本，结构化智能体负责拆分为 JSON
 */
const FIELD_SCHEMA = `【数据结构定义】
输入：对话智能体输出的自然语言叙事文本
输出：JSON 对象，包含以下字段

1. scene（string）: 场景环境描述
   - 提取叙事中描写地点、时间、天气、环境氛围的内容
   - 仅序章开场、场景变化、关键事件、角色高光时有内容
   - 场景未变化时返回 ""

2. characters（array）: 在场角色消息列表，每项：
   - name（string）: 角色真实姓名
   - action（string）: 角色外部可见的动作/神态/表情
   - dialogue（string）: 角色说出的话（引号内的内容）
   - thought（string）: 角色的内心想法/感受/欲望/恐惧

3. suggestedReplies（array）: 玩家应对选项
4. emotionDelta（object）: 情感变化
5. dynamicAttrs（object）: 动态属性
6. revealedInfo（object）: 信息披露

【解析规则】
- 对话智能体输出纯自然语言，不使用任何格式标记
- 每个角色的描写段落通常以"角色名+动词/动作"开头
- 识别方法：遍历文本，找到所有角色名出现的位置，以其为起点分割段落

【字段拆分规则】
对每个角色的描写段落，按以下规则拆分：
- name: 段落中出现的角色真实姓名（与角色列表匹配）
- action: 段落中描述该角色外部可见行为的文本（肢体动作、表情、神态）
- dialogue: 段落中被引号（""「」''）包围的对话内容
- thought: 段落中描述该角色内部心理活动的文本

【互斥规则——严格执行】
- action 中**不得包含** dialogue 和 thought 的内容
- dialogue 中**不得包含** action 和 thought 的内容  
- thought 中**不得包含** action 和 dialogue 的内容
- 同一段落中如果同时包含动作、对话、心理，必须拆到三个字段，不要合并

【判断依据】
- action 的判断标志：外部可见的肢体行为（站/坐/靠/握/推/抬/看/笑/皱眉...）
- dialogue 的判断标志：被引号包围的说话内容，或"说/道/问/回答"等引导词后的引号内容
- thought 的判断标志：心理活动词汇（想/觉得/感到/渴望/希望/认为/暗自/心里/心想...）之后的内容
- 如果一段文本同时包含动作引导词和心理引导词，前面的归 action，后面的归 thought
- 如果某字段确实不存在，返回空字符串 ""
- 示例："她攥紧拳头，心中充满不甘" → action: "她攥紧拳头"，thought: "心中充满不甘"
- 示例："她抬起头，笑着说：你好" → action: "她抬起头，笑着说"，dialogue: "你好"
- 示例："她望着远方，想着如果能回到过去就好了" → action: "她望着远方"，thought: "如果能回到过去就好了"
- 示例："她靠在椅背上，不在乎这群人是谁" → action: "她靠在椅背上"，thought: "不在乎这群人是谁"
- 示例："她微微一笑，觉得这件事没那么简单" → action: "她微微一笑"，thought: "这件事没那么简单"`;

/**
 * 调用后端结构化智能体拆分原始文本为 JSON
 * @param {string} rawText - 对话智能体输出的原始文本
 * @param {Object} context - 上下文信息
 * @param {Array} context.characters - 角色列表
 * @param {Object} context.emotions - 情感指标
 * @param {Object} context.dynamicAttrs - 动态属性
 * @param {Object} context.revealedInfo - 已发现信息
 * @returns {Promise<{scene, characters: [{name,action,dialogue,thought}], suggestedReplies, emotionDelta, dynamicAttrs, revealedInfo}>}
 */
App.structuredParseReply = async function(rawText, context = {}) {
    const {
        characters = [],
        emotions = {},
        dynamicAttrs = {},
        revealedInfo = {}
    } = context;

    rpLog('info', 'STRUCTURED-PARSE', `结构化拆分开始: rawText=${rawText?.length || 0}字符`);
    rpLog('info', 'STRUCTURED-PARSE', `rawText 前500字符: ${rawText?.substring(0, 500)}`);
    rpLog('info', 'STRUCTURED-PARSE', `characters=${characters.length}个, emotions=${Object.keys(emotions).length}个`);

    try {
        const response = await fetch(`${ROLEPLAY_API_BASE}/roleplay-structure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rawText,
                characters,
                emotions,
                dynamicAttrs,
                revealedInfo,
                fieldSchema: FIELD_SCHEMA,
                contextInfo: `【上下文信息】
- 共有 ${characters.length} 个角色：${characters.map(c => c.name).join('、')}
- 玩家姓名：${state.player?.name || '未知'}
- 当前情感指标和动态属性已在下方提供，请在拆分时参考这些数据进行 emotionDelta 和 dynamicAttrs 的判断`
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '结构化拆分失败');
        }

        const data = result.structuredData;

        rpLog('info', 'STRUCTURED-PARSE', `✅ 结构化拆分成功: scene=${(data.scene || '').length}字符, chars=${(data.characters || []).length}个, replies=${(data.suggestedReplies || []).length}条`);
        // 详细日志：每个角色的 thought 字段
        for (const c of (data.characters || [])) {
            rpLog('info', 'STRUCTURED-PARSE', `  角色[${c.name || '?'}]: action=${(c.action||'').length}字, dialogue=${(c.dialogue||'').length}字, thought=${(c.thought||'').length}字 [预览:${(c.thought||'').substring(0,80)}]`);
        }

        return {
            scene: data.scene || '',
            characters: (data.characters || []).map(c => ({
                name: c.name || '',
                action: c.action || '',
                dialogue: c.dialogue || '',
                thought: c.thought || ''
            })),
            suggestedReplies: (data.suggestedReplies || []).slice(0, 4),
            emotionDelta: data.emotionDelta || {},
            dynamicAttrs: data.dynamicAttrs || {},
            revealedInfo: data.revealedInfo || {},
            truncated: !!result.truncated
        };

    } catch (error) {
        rpLog('error', 'STRUCTURED-PARSE', `❌ 调用失败: ${error.message}`);
        throw error;
    }
};

/**
 * 异步生成快捷回复选项
 * @param {Object} params
 * @param {string} params.lastUserMessage - 上一轮用户消息
 * @param {string} params.lastCharResponse - 上一轮角色回复
 * @param {Array} params.recentMessages - 最近对话历史
 * @returns {Promise<string[]>} 建议回复选项数组
 */
App.generateReplyOptions = async function(params) {
    const {
        lastUserMessage = '',
        lastCharResponse = '',
        recentMessages = []
    } = params;

    rpLog('info', 'REPLY-OPTIONS', `异步生成建议回复选项`);

    // 序章阶段（无用户消息）：走降级逻辑，不调 GLM
    if (!lastUserMessage || lastUserMessage.trim() === '') {
        rpLog('info', 'REPLY-OPTIONS', '序章阶段，走降级选项生成');
        // 降级逻辑从 state 直接读取活跃角色
        const activeChar = state.characters[state.activeCharIndex] || state.characters[0];
        const opts = App.getDefaultReplyOptions(activeChar, { content: lastCharResponse || '' }, { content: '' });
        return opts;
    }

    try {
        const response = await fetch(`${ROLEPLAY_API_BASE}/roleplay-reply-options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lastUserMessage,
                lastCharResponse,
                recentMessages
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !result.options || result.options.length < 2) {
            rpLog('warn', 'REPLY-OPTIONS', `返回选项不足: ${result.options?.length || 0} 条`);
            return [];
        }

        rpLog('info', 'REPLY-OPTIONS', `✅ 生成 ${result.options.length} 条选项`);
        return result.options;

    } catch (error) {
        rpLog('warn', 'REPLY-OPTIONS', `生成失败: ${error.message}`);
        return [];
    }
};

/**
 * 将结构化数据转换为消息对象（供渲染层消费）
 * @param {Object} structured - 结构化数据
 * @param {string} messageId - 消息 ID
 * @returns {Array<Object>} 消息数组
 */
App.structuredToMessages = function(structured, messageId, options = {}) {
    const messages = [];
    const { skipCharacters = false } = options;

    // 场景消息
    if (structured.scene) {
        messages.push({
            id: messageId,
            role: 'scene',
            type: 'scene',
            content: structured.scene,
            isScene: true
        });
    }

    // 角色消息
    if (!skipCharacters) {
        for (const charData of (structured.characters || [])) {
            let fullContent = '';
            if (charData.action) fullContent += `(${charData.action})`;
            if (charData.dialogue) fullContent += charData.dialogue;
            if (charData.thought) fullContent += `[${charData.thought}]`;
            if (!fullContent) fullContent = charData.dialogue || '(无内容)';

            messages.push({
                id: messageId + '-' + charData.name,
                role: 'char',
                type: 'multi_char',
                charName: charData.name,
                charIndex: state.characters.findIndex(c => c.name === charData.name),
                content: fullContent,
                action: charData.action || '',
                dialogue: charData.dialogue || '',
                thought: charData.thought || ''
            });
        }
    }

    return messages;
};

/**
 * 应用结构化更新到 state
 */
App.applyStructuredUpdates = function(structured, charNames) {
    // 情感更新
    const emotionDelta = structured.emotionDelta || {};
    for (const charName of charNames) {
        const charEmotions = emotionDelta[charName] || {};
        if (Object.keys(charEmotions).length > 0) {
            for (const [key, delta] of Object.entries(charEmotions)) {
                if (state.emotions[charName] && state.emotions[charName][key]) {
                    const prevVal = state.emotions[charName][key].current || 50;
                    const newVal = Math.max(0, Math.min(100, prevVal + (delta || 0)));
                    state.emotions[charName][key].current = newVal;
                    rpLog('info', 'EMOTION-DELTA', `${charName}.${key}: ${prevVal}→${newVal} (${delta >= 0 ? '+' : ''}${delta})`);
                }
            }
        }
    }

    // 动态属性更新
    const dynAttrs = structured.dynamicAttrs || {};
    for (const charName of charNames) {
        const c = state.characters.find(ch => ch.name === charName);
        if (!c) continue;
        const charAttrs = dynAttrs[charName] || {};
        for (const attr of ['perception', 'secret', 'currentMood']) {
            const newVal = charAttrs[attr] || '';
            if (newVal && c[attr] !== newVal) {
                c[attr] = newVal;
                rpLog('info', 'ATTR-DELTA', `${charName}.${attr}: "${c[attr]}" [已更新]`);
            }
        }
    }

    // 信息披露
    const revealed = structured.revealedInfo || {};
    for (const charName of charNames) {
        if (!state.revealed[charName]) {
            state.revealed[charName] = {};
        }
        const charRevealed = revealed[charName] || {};
        const newDiscoveries = [];
        for (const [field, found] of Object.entries(charRevealed)) {
            if (found && !state.revealed[charName][field]) {
                state.revealed[charName][field] = true;
                const fieldLabels = {
                    appearance: '发现了「' + charName + '」的外貌细节',
                    personality: '了解了「' + charName + '」的性格特点',
                    background: '知道了「' + charName + '」的背景故事',
                    relationship: '明白了「' + charName + '」与你的关系'
                };
                newDiscoveries.push(fieldLabels[field] || `发现了关于「${charName}」的新信息`);
                rpLog('info', 'INFO-DISCLOSE', `${charName}.${field}=true`);
            }
        }
        if (newDiscoveries.length > 0) {
            state.revealed[charName]._lastNew = newDiscoveries;
        }
    }

    saveState();
};
