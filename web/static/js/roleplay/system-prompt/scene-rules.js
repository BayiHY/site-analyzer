// === 场景规则与角色关系 ===
// 从 state 中提取角色列表、关系网、在场状态

export function buildSceneRules(allChars, activeChar, state) {
    // 角色间关系提示（从 background 中提取与其他角色的关系名）
    const relationshipHints = allChars.flatMap((c, i) => {
        if (!c.background) return [];
        const otherNames = allChars
            .filter((_, j) => j !== i)
            .map(o => o.name);
        const mentions = otherNames.filter(n => c.background.includes(n));
        return mentions.map(m => `  ${c.name} ↔ ${m}（背景中提及）`);
    });
    const relationshipSection = relationshipHints.length > 0
        ? '\n【角色关系网】\n' + relationshipHints.join('\n')
        : '';

    // 场景中角色状态
    const inSceneNote = allChars.map(c => {
        if (c.name === activeChar.name) {
            return `- ${c.name}（**当前对话角色**，在场）`;
        }
        return `- ${c.name}（${c.gender}，${c.age}岁）— ${c.appearance ? '外貌：' + c.appearance.slice(0, 30) : ''}${c.relationship ? '，与主角：' + c.relationship : ''}`;
    }).join('\n');

    return `=== 场景中其他角色 ===${inSceneNote}${relationshipSection}
        
**场景规则**：
- 只有**当前对话角色**（${activeChar.name}）和**刚刚在对话中出现过的角色**才在场
- 如果用户说要找某个角色但该角色不在场景中，**不要让在场角色替被找的角色回答**
- 例如：用户说"我来找小满"，小满不在场 → 林浅可以说"小满刚走了"，但不能代替小满说话`;
}
