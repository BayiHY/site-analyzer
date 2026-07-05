// === Section: 角色消息兜底智能体 ===
// 当 LLM 第一轮回复格式偏离（缺少 :角色名: 前缀、单角色回复、多角色被当场景等）时，
// 将此模块作为"格式修正器"，补全角色基础信息后重新生成符合结构的回复。
// 调用时使用极低温度（0.1）保证格式稳定。

/**
 * 检测原始 LLM 回复是否需要兜底修正
 * @param {string} rawText - LLM 原始输出
 * @param {Array} parsedMessages - 解析后的消息列表
 * @returns {{ needsRepair: boolean, reason: string, charCount: number, hasPrefix: boolean, hasReplies: boolean }}
 */
export function diagnoseRawReply(rawText, parsedMessages) {
    const trimmed = (rawText || '').trim();
    const lines = trimmed.split('\n').filter(l => l.trim());
    
    // 检测是否有 :角色名: 前缀
    const hasPrefix = /:[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_\u2022\u00B7·]{0,12}:\s*[\(]/.test(trimmed);
    
    // 检测是否有 <> 建议回复
    const hasReplies = /<[^>]+>/.test(trimmed);
    
    // 检测解析出的角色消息数量
    const charMsgCount = parsedMessages.filter(m => m.role === 'char' && m.type === 'multi_char').length;
    
    // 检测是否有场景消息吞掉了角色对话
    const sceneMsgCount = parsedMessages.filter(m => m.isScene === true).length;
    
    // 检测单角色短回复（可能是格式退化）
    const isShortReply = trimmed.length < 150 && charMsgCount <= 1;
    
    let needsRepair = false;
    let reason = '';
    
    // 条件1：完全没有 :角色名: 前缀 — 严重格式偏离
    if (!hasPrefix) {
        needsRepair = true;
        reason = '缺少 :角色名: 前缀';
    }
    // 条件2：解析出场景消息吞掉了角色对话（场景长度 > 100 且有多角色特征）
    else if (sceneMsgCount > 0) {
        const sceneMsg = parsedMessages.find(m => m.isScene === true);
        if (sceneMsg && sceneMsg.content && sceneMsg.content.length > 100) {
            // 场景消息中包含多个 (动作) 段落，说明是多角色对话被误判为场景
            const actionParagraphs = sceneMsg.content.match(/\([^)]*\)[^[\]]*\[/g) || [];
            if (actionParagraphs.length >= 2) {
                needsRepair = true;
                reason = `多角色段落被误判为场景描述（检测到 ${actionParagraphs.length} 个角色段落）`;
            }
        }
    }
    // 条件3：单角色短回复 — LLM 退化为单角色
    else if (isShortReply) {
        needsRepair = true;
        reason = '单角色短回复（可能退化为单角色）';
    }
    // 条件4：没有 <> 建议回复
    else if (!hasReplies) {
        needsRepair = true;
        reason = '缺少 <> 建议回复标签';
    }
    
    return {
        needsRepair,
        reason,
        charCount: trimmed.length,
        hasPrefix,
        hasReplies
    };
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
    
    return `你是一个严格的格式修正器。你的任务是将不符合格式的 LLM 回复重写为标准格式。

【当前问题】${diagnosisReason}

【角色列表】
${charCards}

【玩家本轮输入】
${userMessage}

【原始 LLM 回复（内容参考，不要照抄）】
${rawReply}

【你必须遵守的输出格式】
1. 每行一个角色，格式严格为：:角色名:(动作/神态)「对话内容」[内心想法]
2. :角色名: 前后各一个冒号（双冒号格式），这是强制标志，绝对不可省略
3. 即使只有一个角色在场，也必须写 :角色名: 前缀
4. 所有在场的角色都必须参与回复，每人一行
5. 最后一行必须包含尖括号包裹的建议回复，格式：<回复1┇回复2┇回复3>
6. 每条回复用 ┇（U+2507）分隔，恰好3条
7. 建议回复必须是玩家视角的行动/语言，以"我/我们"为主语
8. 禁止输出任何解释性文字、前言后语、markdown 标记

【输出示例】
:凛:(手指微动，枪口并未放下)「别在那傻站着。既然来了，就选边站。」[这家伙突然打招呼是想干什么？]
:绯:(掩唇轻笑)「哟，这就见外了？」[想拉拢我？哼，得看看你手里有什么筹码。]
:幽:(歪着头，瞳孔绿光闪烁)「温暖……源？」[他在害怕吗？]
:霜:(合上数据板，推了推眼镜)「寒暄结束。」[多余的情绪交流只会降低效率。]
<我想询问凛刚才的意图┇我想逗弄绯┇我想安抚幽>

【绝对禁止】
- 不要省略 :角色名: 前缀
- 不要把角色对话写成纯 (动作)「对话」[想法] 格式
- 不要输出任何额外文字
- 不要输出 markdown 代码块标记
- 不要只回复一个角色（除非场景中真的只有一个人）`;
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
