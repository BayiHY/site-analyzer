// === Section: 角色身份一致性校验 ===
// 检测 LLM 回复中是否存在 OOC 串号：角色名与发言内容不匹配
// 2026-07-04 新增

/**
 * 从角色人设中提取关键词特征（用于简易 OOC 检测）
 * 返回 {keywords: string[], sentiment: 'warm'|'cold'|'neutral'|'hostile'}
 */
function extractCharSignature(character) {
    if (!character) return { keywords: [], sentiment: 'neutral' };
    
    const sig = {
        keywords: [],
        sentiment: 'neutral'
    };
    
    // 性格关键词
    if (character.personality) {
        const personality = character.personality.toLowerCase();
        if (/温柔|体贴|善良|耐心|善解人意|柔和/i.test(personality)) {
            sig.sentiment = 'warm';
            sig.keywords.push('温柔', '体贴');
        }
        if (/冷淡|冷漠|疏离|高傲|孤僻/i.test(personality)) {
            sig.sentiment = 'cold';
            sig.keywords.push('冷淡', '疏离');
        }
        if (/暴躁|易怒|冲动|火爆/i.test(personality)) {
            sig.sentiment = 'hostile';
            sig.keywords.push('暴躁', '冲动');
        }
        // 提取更多性格关键词
        const kwPatterns = [/热情|开朗|活泼|外向|幽默|风趣|理性|冷静|谨慎|细心|粗心|直率|委婉|强势|软弱/i];
        kwPatterns.forEach(p => {
            if (p.test(personality)) {
                sig.keywords.push(p.source);
            }
        });
    }
    
    // 说话习惯
    if (character.speechStyle) {
        const speech = character.speechStyle;
        sig.keywords.push(speech);
    }
    
    return sig;
}

/**
 * 检测发言内容是否与角色签名一致（简易版）
 * 返回 {consistent: boolean, reason: string}
 */
function checkConsistency(content, signature) {
    if (!signature || signature.keywords.length === 0) {
        return { consistent: true, reason: '无签名数据，跳过检测' };
    }
    
    // 如果角色有明确的性格倾向，检测内容是否矛盾
    if (signature.sentiment === 'warm') {
        // 温柔角色不应该说攻击性话语
        const hostilePhrases = [/滚出去/, /闭嘴/, /滚/, /恶心/, /令人作呕/, /废物/, /蠢货/];
        for (const p of hostilePhrases) {
            if (p.test(content)) {
                return { consistent: false, reason: '温柔角色说出攻击性话语' };
            }
        }
    }
    
    if (signature.sentiment === 'cold') {
        // 冷淡角色不应该说过于亲昵的话语
        const warmPhrases = [/亲爱的/, /宝贝/, /心爱你/, /好想你/, /最喜欢你了/];
        for (const p of warmPhrases) {
            if (p.test(content)) {
                return { consistent: false, reason: '冷淡角色说出亲昵话语' };
            }
        }
    }
    
    return { consistent: true, reason: '通过检测' };
}

/**
 * 校验角色身份一致性
 * @param {Array} parsedMessages - 解析后的消息数组
 * @param {Array} allCharacters - 所有角色列表
 * @returns {{valid: boolean, conflicts: Array<{charName, reason}>}}
 */
export function validateIdentityConsistency(parsedMessages, allCharacters) {
    if (!parsedMessages || parsedMessages.length === 0 || !allCharacters || allCharacters.length === 0) {
        return { valid: true, conflicts: [] };
    }
    
    const conflicts = [];
    const charSignatureMap = {};
    
    // 预计算所有角色的签名
    for (const char of allCharacters) {
        charSignatureMap[char.name] = extractCharSignature(char);
    }
    
    // 逐条消息校验
    for (const msg of parsedMessages) {
        if (msg.role !== 'char' || msg.isScene) continue;
        
        const charName = msg.charName;
        if (!charName) continue;
        
        // 获取发言内容（拼接 action + dialogue + thought）
        let content = '';
        if (msg.action) content += msg.action + ' ';
        if (msg.dialogue) content += msg.dialogue + ' ';
        if (msg.thought) content += msg.thought;
        if (!content) content = msg.content || '';
        
        // 检查角色是否存在
        const charData = allCharacters.find(c => c.name === charName);
        if (!charData) {
            conflicts.push({ charName, reason: '角色不存在于角色列表中' });
            continue;
        }
        
        // 检查 OOC
        const signature = charSignatureMap[charName];
        const result = checkConsistency(content, signature);
        if (!result.consistent) {
            conflicts.push({ charName, reason: result.reason });
            if (typeof rpLog !== 'undefined') {
                rpLog('warn', 'IDENTITY-CHECK', `⚠️ 角色"${charName}"发言可能OOC: ${result.reason}`);
            }
        }
    }
    
    const valid = conflicts.length === 0;
    
    if (typeof rpLog !== 'undefined') {
        rpLog('INFO', 'IDENTITY-CHECK', `角色身份一致性校验: valid=${valid}, conflicts=${conflicts.length}`);
        if (conflicts.length > 0) {
            rpLog('warn', 'IDENTITY-CHECK', `冲突详情: ${JSON.stringify(conflicts)}`);
        }
    }
    
    return { valid, conflicts };
}
