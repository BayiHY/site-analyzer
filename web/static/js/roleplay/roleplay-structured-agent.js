// === Section: 角色扮演结构化智能体前端适配器 ===
// 管线：对话智能体编故事(原始文本) → structuredParseReply(调后端拆JSON) → 前端消费结构化数据

const ROLEPLAY_API_BASE = '/api';

/**
 * 结构化字段定义（供后端拆分智能体使用）
 * 对话智能体输出自然文本，结构化智能体负责拆分为 JSON
 */
const FIELD_SCHEMA = `【数据结构定义】
输入：对话智能体输出的标准化标签格式文本
输出：JSON 对象，包含以下字段

1. scene（string）: 场景环境描述
   - 仅包含环境、氛围、时间、地点等非对话内容
   - 从【场景环境】板块提取
   - 仅序章开场、场景变化、关键事件、角色高光时有内容
   - 场景未变化时无此板块 → 返回 ""

2. characters（array）: 在场角色消息列表，每项：
   - name（string）: 角色真实姓名
   - action（string）: 角色外部可见的动作/神态/表情
   - dialogue（string）: 角色说出的话
   - thought（string）: 角色的内心想法/感受/欲望/恐惧

3. suggestedReplies（array）: 玩家应对选项
4. emotionDelta（object）: 情感变化
5. dynamicAttrs（object）: 动态属性
6. revealedInfo（object）: 信息披露

【标签提取规则——核心优先级最高】
对话智能体使用【标签名】独占一行的方式组织内容。
你必须按以下规则精确提取，**优先使用标签匹配，不要启发式猜测**：

A) 板块标签识别：
   - 【场景环境】→ 提取其后所有内容直到下一个板块标签 → scene
   - 【角色互动】→ 进入角色解析模式
   - 【建议选项】→ 提取其后以"→ "开头的行 → suggestedReplies

B) 角色解析规则（在【角色互动】板块内）：
   - 找到【角色名】独占一行 → 其后内容为 name
   - 找到【动作】独占一行 → 其后内容为 action
   - 找到【语言】独占一行 → 其后内容为 dialogue
   - 找到【内心】独占一行 → 其后内容为 thought
   - 每个角色由一组连续的【角色名】【动作】【语言】【内心】组成
   - 四个子标签必须按顺序出现，缺一不可
   - 下一组【角色名】出现即表示上一个角色结束

C) 建议选项提取：
   - 在【建议选项】板块内，找到所有以"→ "开头的行
   - 提取 → 后面的文字 → suggestedReplies

D) 场景 vs 角色边界：
   - scene 仅来自【场景环境】板块的内容
   - 角色 action/dialogue/thought 仅来自【角色互动】板块
   - 两者严格分离，绝不交叉

【提取流程（严格按顺序执行）】
1. 扫描全文，定位所有【标签名】独占行的位置
2. 提取【场景环境】板块内容 → scene
3. 进入【角色互动】板块，按顺序解析角色块：
   a) 遇到【角色名】→ 开始新角色
   b) 依次读取【动作】【语言】【内心】→ 填充该角色字段
   c) 遇到下一个【角色名】或板块结束 → 保存当前角色，开始下一组
4. 提取【建议选项】板块内容 → suggestedReplies
5. 如果缺少某个板块或标签，对应字段返回空字符串或空数组

【互斥规则——严格执行】
- action 中**不得包含** dialogue 和 thought 的内容
- dialogue 中**不得包含** action 和 thought 的内容
- thought 中**不得包含** action 和 dialogue 的内容
- scene 中**不得包含**任何角色的台词或内心活动
- 每个角色的四个子标签内容严格来自各自标签后的文本行

【基本原则】
- 严格按【标签名】提取，不要推测或编造
- 如果某标签缺失，对应字段返回空字符串 ""
- 如果某板块不存在，对应字段返回空字符串或空数组`;

/**
 * 前端直接调用 Agnes LLM 拆分原始文本为 JSON
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
        // 构建 system prompt：结构化提取规则
        const systemPrompt = `你是一个结构化数据提取器。你的任务是将对话智能体输出的自然文本解析为严格的 JSON 对象。

${FIELD_SCHEMA}

【重要】你必须只输出合法的 JSON 对象，不要输出任何其他文字、解释或 markdown 标记。JSON 必须能被标准 JSON.parse() 解析。`;

        // 构建 user message
        const userMessage = `请解析以下对话内容：

${rawText}

【上下文信息】
- 共有 ${characters.length} 个角色：${characters.map(c => c.name).join('、')}
- 玩家姓名：${state.player?.name || '未知'}
- 当前情感指标和动态属性已在下方提供，请在拆分时参考这些数据进行 emotionDelta 和 dynamicAttrs 的判断`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        rpLog('info', 'STRUCTURED-PARSE', '调用 Agnes LLM 进行结构化拆分...');
        const rawResponse = await App.agnesChat(messages, { temperature: 0.1 });
        
        rpLog('info', 'STRUCTURED-PARSE', `LLM 原始返回 (长度=${rawResponse?.length || 0}): "${rawResponse?.substring(0, 200)}..."`);

        // 解析 JSON（处理中文引号、markdown 包裹等）
        const data = App.parseJson(rawResponse);
        if (!data) {
            throw new Error(`JSON 解析失败，原始返回: ${rawResponse.substring(0, 200)}`);
        }

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
            truncated: false
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
        const activeChar = state.characters[state.activeCharIndex] || state.characters[0];
        const systemPrompt = `你是回复选项生成器，不是角色扮演角色。你的唯一任务是为用户生成3-4条可选回复按钮文案。

【绝对禁止】
- 不要输出任何角色对话、动作描写、内心独白
- 不要用括号 ()、花括号 {}、方括号 [] 包裹内容
- 不要写 "(瞥了一眼)" "(转身牵起他的手)" 这类格式
- 不要输出解释性文字、前言后语

【必须做的事】
- 生成 3-4 条简短回复选项（每条 ≤20 字）
- 每条单独一行，以"→ "开头
- 选项必须是玩家视角的具体行动/语言，以"我"为主语
- 选项要对剧情有推进作用，不能是口水词（如"好的"、"嗯"、"然后呢"等无效回复）

【选项类型要求】
1. 探索型：追问细节、原因或背后故事
2. 行动型：提出下一步行动或计划
3. 冲突/转折型：引入新信息、质疑或矛盾
4. （可选）沉默/观望型：选择不说话或等待

【示例输出】
→ 我想询问酒馆老板关于失踪的事
→ 我走向神秘女子坐下
→ 我起身准备离开`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...recentMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
        ];

        rpLog('info', 'REPLY-OPTIONS', '调用 agnes chat 生成选项...');
        const raw = await App.agnesChat(messages);
        rpLog('info', 'REPLY-OPTIONS', `LLM 原始返回 (长度=${raw?.length || 0}): "${raw?.substring(0, 200)}..."`);

        // 解析选项：优先提取以"→ "开头的行
        const arrowLines = raw.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('→ '))
            .map(line => line.replace(/^→\s*/, '').trim())
            .filter(line => line.length > 0);

        if (arrowLines.length >= 2) {
            rpLog('info', 'REPLY-OPTIONS', `✅ 生成 ${arrowLines.length} 条选项`);
            return arrowLines.slice(0, 4);
        }

        // 兜底：尝试 | 分隔符（旧格式兼容）
        const pipeItems = raw.split('|').map(s => s.trim()).filter(s => s.length > 0);
        if (pipeItems.length >= 3) {
            rpLog('info', 'REPLY-OPTIONS', `| 分割兜底找到 ${pipeItems.length} 项`);
            return pipeItems.slice(0, 4);
        }

        rpLog('warn', 'REPLY-OPTIONS', `分隔符解析失败，退回降级选项`);
        throw new Error('快捷回复解析失败');
    } catch (error) {
        rpLog('warn', 'REPLY-OPTIONS', `生成失败: ${error.message}，使用降级选项`);
        // 降级：从 state 读取活跃角色生成通用选项
        const activeChar = state.characters[state.activeCharIndex] || state.characters[0];
        return App.getDefaultReplyOptions(activeChar, { content: lastCharResponse || '' }, { content: lastUserMessage });
    }
};

/**
 * 将结构化数据转换为消息对象（供渲染层消费）
 * @param {Object} structured - 结构化数据
 * @param {string} messageIdPrefix - 消息 ID 前缀（如 'msg_1784378515489'）
 * @param {Object} options - 选项
 * @param {string} [options.timestamp] - 共享时间戳（ISO 格式），同批消息共用同一时间戳保证排序正确
 * @param {boolean} [options.skipCharacters=false] - 跳过角色消息
 * @returns {Array<Object>} 消息数组
 */
App.structuredToMessages = function(structured, messageIdPrefix, options = {}) {
    const messages = [];
    const { skipCharacters = false, timestamp } = options;

    // 统一时间戳：同批消息共享同一时间戳，避免排序时交错
    const nowTs = timestamp || new Date().toISOString();

    // 场景消息
    if (structured.scene) {
        messages.push({
            id: messageIdPrefix,
            role: 'scene',
            type: 'scene',
            content: structured.scene,
            isScene: true,
            timestamp: nowTs
        });
    }

    // 角色消息
    if (!skipCharacters) {
        for (const charData of (structured.characters || [])) {
            // 保留原始标签格式，不要扁平化拼接
            // 这样 LLM 在历史中也能看到清晰的【角色名】【动作】【语言】【内心】结构
            let parts = [];
            parts.push(`【角色名】${charData.name}`);
            if (charData.action) parts.push(`【动作】${charData.action}`);
            if (charData.dialogue) parts.push(`【语言】${charData.dialogue}`);
            if (charData.thought) parts.push(`【内心】${charData.thought}`);
            let formattedContent = parts.join(' ') || charData.dialogue || `${charData.name}(无内容)`;

            messages.push({
                id: messageIdPrefix + '-' + charData.name,
                role: 'char',
                type: 'multi_char',
                charName: charData.name,
                charIndex: state.characters.findIndex(c => c.name === charData.name),
                content: formattedContent,
                action: charData.action || '',
                dialogue: charData.dialogue || '',
                thought: charData.thought || '',
                timestamp: nowTs
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
