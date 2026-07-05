// === 角色档案 ===
// 从 activeChar 和 state 中提取角色信息、动态属性、披露状态

export function buildCharacterCard(state) {
    const allChars = state.characters || [];
    let section = '=== 所有角色档案 ===\n';

    for (const char of allChars) {
        const revealed = state.revealed[char.name] || {};
        const revealedStatus = Object.entries(revealed)
            .filter(([k, v]) => typeof v === 'boolean' && k !== '_lastNew')
            .map(([k, v]) => `${k}: ${v ? '已发现' : '未发现'}`)
            .join('、');

        const perception = char.perception ? `玩家印象：${char.perception}` : '';
        const secret = char.secret ? `秘密线索：${char.secret}` : '';
        const currentMood = char.currentMood ? `当前心情：${char.currentMood}` : '';
        const dynamicAttrs = [perception, secret, currentMood].filter(Boolean).join('；') || '暂无';

        section += `\n--- ${char.name} ---
姓名：${char.name}
性别：${char.gender || '未指定'}
年龄：${char.age || '未知'}
外貌：${char.appearance || '未指定'}
性格：${char.personality || '温柔'}
背景：${char.background || ''}
与用户关系：${char.relationship || '普通认识'}
核心动机：${char.motivation || ''}
隐藏秘密：${char.secret || '暂未发现'}
说话风格：${char.speechStyle || ''}`;

        if (dynamicAttrs !== '暂无') {
            section += `\n【动态属性】${dynamicAttrs}`;
        }

        if (revealedStatus) {
            section += `\n【信息披露】${revealedStatus}`;
        }
    }

    return section;
}
