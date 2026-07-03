// === 场景在场规则校验器 ===
// 检测 LLM 回复中是否违反了"声明不在场角色不得出现"的规则

/**
 * 校验场景在场规则
 * @param {string} replyText - LLM 回复原文
 * @param {string} activeCharName - 当前对话角色名
 * @param {Array} allCharacters - 所有角色列表
 * @returns {{valid: boolean, declaredAbsent: string[], actuallyPresent: string[], conflicts: string[]}}
 */
export function validateScenePresence(replyText, activeCharName, allCharacters) {
    if (!replyText || !allCharacters || allCharacters.length === 0) {
        return { valid: true, declaredAbsent: [], actuallyPresent: [], conflicts: [] };
    }

    // 1. 从 replyText 中提取"声明不在场"的角色
    const declaredAbsent = [];
    const absentRe = /([^\s|┆]{2,10})[^\n]{0,30}(不|没|没有|不在|没在|不在这里|不在场|还没到|还没来|不在这儿)/g;
    let rm;
    while ((rm = absentRe.exec(replyText)) !== null) {
        const name = rm[1].trim();
        if (name && allCharacters.some(c => c.name === name) && !declaredAbsent.includes(name)) {
            declaredAbsent.push(name);
        }
    }

    // 2. 从 replyText 中提取实际出现的角色名
    const actuallyPresent = [];
    const charNameSet = new Set(allCharacters.map(c => c.name));
    const namePattern = /([^\s|:：]{1,10})[:：](?!\s*\()/g;
    let nm;
    while ((nm = namePattern.exec(replyText)) !== null) {
        const n = nm[1].trim();
        if (n && charNameSet.has(n) && !actuallyPresent.includes(n)) {
            actuallyPresent.push(n);
        }
    }

    // 3. 检测冲突：声明不在场但实际出场
    const conflicts = declaredAbsent.filter(name => actuallyPresent.includes(name));

    rpLog('info', 'SCENE-RULE', `声明不在场角色: [${declaredAbsent.join(', ') || '无'}], 实际出场角色: [${actuallyPresent.join(', ')}], 冲突: ${conflicts.length > 0}`);
    if (conflicts.length > 0) {
        rpLog('warn', 'SCENE-RULE', `⚠️ 场景在场规则违反: ${conflicts.join(', ')} 被声明不在场但实际出场了`);
    }

    return { valid: conflicts.length === 0, declaredAbsent, actuallyPresent, conflicts };
}
