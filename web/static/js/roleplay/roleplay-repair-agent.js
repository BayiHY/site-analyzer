// === Section: 角色消息兜底智能体 ===
// 当 LLM 回复内容严重偏离（空回复、纯口水、无角色参与）时触发修正
// 由于对话智能体现在输出自然语言叙事，repair agent 只处理内容质量问题

/**
 * 检测原始 LLM 回复是否需要兜底修正
 */
export function diagnoseRawReply(rawText, parsedMessages) {
    const trimmed = (rawText || '').trim();
    
    // 条件1：空回复或极短
    if (trimmed.length < 20) {
        return { needsRepair: true, reason: '回复过短（可能为空）' };
    }
    
    // 条件2：没有任何角色参与（解析后无角色消息）
    const charMsgCount = parsedMessages.filter(m => m.role === 'char' && m.type !== 'scene').length;
    if (charMsgCount === 0 && trimmed.length > 50) {
        return { needsRepair: true, reason: '回复中没有角色互动内容' };
    }
    
    // 条件3：场景消息吞掉了所有内容
    const sceneMsgCount = parsedMessages.filter(m => m.isScene === true).length;
    if (sceneMsgCount > 0) {
        const sceneMsg = parsedMessages.find(m => m.isScene === true);
        if (sceneMsg && sceneMsg.content && sceneMsg.content.length > 200) {
            return { needsRepair: true, reason: '场景描述过长（>200字符），可能吞掉了角色对话' };
        }
    }
    
    return { needsRepair: false, reason: '' };
}

/**
 * 构建兜底修正的系统提示词
 * @param {Array} characters - 所有角色信息
 * @param {string} userMessage - 玩家本轮输入
 * @param {string} rawReply - 原始 LLM 回复（用于参考内容）
 * @param {string} diagnosisReason - 诊断原因
 * @returns {string}
 */
export function buildRepairPrompt(characters, userMessage, rawReply, diagnosisReason) {
    const charCards = characters.map(c => {
        return `- ${c.name}（${c.gender}，${c.age || '?'}岁）：${c.personality || '无'} | ${c.background || '无背景'}`;
    }).join('\n');
    
    return `你是一个剧情修正器。你的任务是重写一段不符合要求的 LLM 回复，使其包含完整的角色互动。

【当前问题】${diagnosisReason}

【角色列表】
${charCards}

【玩家本轮输入】
${userMessage}

【原始 LLM 回复（内容参考，不要照抄）】
${rawReply}

【输出要求】
1. 使用纯自然语言叙事，不要使用格式标记（如 :角色名:、(动作)、[想法] 等）
2. 所有在场的角色都必须参与，每人至少有一段包含：表情动作、语言、内心想法的描写
3. 角色之间应有真实互动，直接回应玩家行为
4. 在回复末尾提供 2-3 条玩家可选回复，每条以"→ "开头
5. 选项必须是玩家视角的具体行动/语言，以"我"为主语，对剧情有推进作用

【输出示例】
深夜的酒馆里烛火摇曳，壁炉中的木柴噼啪作响。

酒馆老板擦了擦手中的玻璃杯，抬眼打量着你，语气客气却不失警惕："打烊时间快到了，客官还要坐多久？"他暗自思忖，这生面孔看着面善，但深夜来酒馆总归有些奇怪。

神秘女子指尖轻抚酒杯边缘，嘴角微扬："老板何必赶客人呢？"她心里却想着又一个不请自来的 outsider...有趣。

→ 我想询问酒馆老板关于失踪的事
→ 我走向神秘女子坐下
→ 我起身准备离开

【绝对禁止】
- 不要使用 :角色名: 格式标记
- 不要使用 (动作)「对话」[想法] 格式标记
- 不要输出任何解释性文字、前言后语`;
}

/**
 * 调用兜底智能体修正回复
 * @param {string} rawText - 原始 LLM 输出
 * @param {Array} characters - 角色信息
 * @param {string} userMessage - 玩家输入
 * @param {string} diagnosisReason - 诊断原因
 * @returns {Promise<string>} 修正后的标准格式回复
 */
export async function repairReply(rawText, characters, userMessage, diagnosisReason) {
    const systemPrompt = buildRepairPrompt(characters, userMessage, rawText, diagnosisReason);
    
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请修正以下回复为标准格式：\n\n${rawText}` }
    ];
    
    rpLog('info', 'REPAIR', `兜底修正开始: ${diagnosisReason}`);
    rpLog('info', 'REPAIR', `原始回复长度: ${rawText?.length || 0} 字符, 角色数: ${characters?.length || 0}`);
    
    // 调用 LLM，使用极低温度保证格式稳定
    const repaired = await App.agnesChat(messages, {
        temperature: 0.1,
        route: 'repair'  // 自定义路由，使用极低温度
    });
    
    rpLog('info', 'REPAIR', `兜底修正完成: ${(repaired || '').length} 字符`);
    rpLog('info', 'REPAIR-OUTPUT', `修正后的回复:\n${repaired}`);
    
    return repaired || rawText;
}
