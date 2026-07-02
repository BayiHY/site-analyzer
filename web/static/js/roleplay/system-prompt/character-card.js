// === 角色档案 ===
// 从 activeChar 和 state 中提取角色信息、动态属性、披露状态

export function buildCharacterCard(activeChar, state) {
    const revealed = state.revealed[activeChar.name] || {};
    const revealedStatus = Object.entries(revealed)
        .filter(([k, v]) => typeof v === 'boolean' && k !== '_lastNew')
        .map(([k, v]) => `${k}: ${v ? '已发现' : '未发现'}`)
        .join('、');

    const perception = activeChar.perception ? `玩家印象：${activeChar.perception}` : '';
    const secret = activeChar.secret ? `秘密线索：${activeChar.secret}` : '';
    const currentMood = activeChar.currentMood ? `当前心情：${activeChar.currentMood}` : '';
    const dynamicAttrs = [perception, secret, currentMood].filter(Boolean).join('；') || '暂无';

    let section = `=== 当前角色档案 ===
姓名：${activeChar.name}
性别：${activeChar.gender || '未指定'}
年龄：${activeChar.age || '未知'}
外貌：${activeChar.appearance || '未指定'}
性格：${activeChar.personality || '温柔'}
背景：${activeChar.background || ''}
与用户关系：${activeChar.relationship || '普通认识'}
核心动机：${activeChar.motivation || ''}
隐藏秘密：${activeChar.secret || '暂未发现'}
说话风格：${activeChar.speechStyle || ''}`;

    if (dynamicAttrs !== '暂无') {
        section += `\n【动态属性】${dynamicAttrs}`;
    }

    if (revealedStatus) {
        section += `\n【信息披露】${revealedStatus}`;
    }

    return section;
}
