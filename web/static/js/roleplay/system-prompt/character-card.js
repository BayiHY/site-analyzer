// === 角色档案 ===
// 从 activeChar 和 state 中提取角色信息、动态属性、披露状态
// 序章专用精简版：只保留必要字段，不包含完整背景故事

export function buildCharacterCard(state) {
    const allChars = state.characters || [];
    let section = '=== 所有角色档案（精简版）===\n';

    for (const char of allChars) {
        // 序章只展示精简信息，完整档案运行时按需注入
        section += `\n【${char.name}】`;
        section += `\n性别：${char.gender || '未知'} | 年龄：${char.age || '未知'}`;
        section += `\n性格标签：${char.personality || '待发现'}`;
        section += `\n说话风格：${char.speechStyle || '普通'}`;
        section += `\n与主角关系：${char.relationship || '初识'}`;
        section += `\n核心秘密：${char.secret || '暂未发现'}`;
        section += `\n外貌特征：${char.appearance ? char.appearance.slice(0, 50) : '待发现'}`;
    }

    return section;
}

// 完整版角色档案（运行时动态注入，仅当前出场角色使用）
export function buildCharacterCardFull(state, activeCharName) {
    const char = state.characters?.find(c => c.name === activeCharName);
    if (!char) return '';
    
    return `【当前出场角色完整档案】
姓名：${char.name}
性别：${char.gender || '未知'} | 年龄：${char.age || '未知'}
性格：${char.personality || '温柔'}
背景故事：${char.background || '未公开'}
核心动机：${char.motivation || '未明确'}
隐藏秘密：${char.secret || '暂未发现'}
说话风格：${char.speechStyle || ''}
与主角关系：${char.relationship || '普通认识'}
外貌描述：${char.appearance || '未指定'}
能力与短板：${char.abilities || '未知'}`;
}
