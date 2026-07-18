// === 场景规则与角色关系 ===
// 从 state 中提取角色列表、关系网、在场状态

export function buildSceneRules(allChars, state) {
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

    // 场景中角色状态 — 排除玩家角色，避免身份重叠
    const playerName = state.player?.name || null;
    const npcChars = playerName
        ? allChars.filter(c => c.name !== playerName)
        : allChars;
    const inSceneNote = npcChars.map(c => {
        return `- ${c.name}（${c.gender}，${c.age}岁）— ${c.appearance ? '外貌：' + c.appearance.slice(0, 30) : ''}${c.relationship ? '，与主角：' + c.relationship : ''}`;
    }).join('\n');

    // 当前场景描述（从 sceneHistory 取最新一条）
    const lastSceneEntry = (state.sceneHistory && state.sceneHistory.length > 0) ? state.sceneHistory[state.sceneHistory.length - 1] : null;
    const currentSceneNote = lastSceneEntry ? `\n\n【当前场景】${lastSceneEntry.sceneDesc || lastSceneEntry.sceneDescription || '未设定'}` : '\n\n【当前场景】序章开场，尚未设定具体场景';

    return `=== 场景中所有角色 ===${inSceneNote}${relationshipSection}${currentSceneNote}
        
**场景规则**：
- 只有**刚刚在对话历史中出现过的角色**才在场
- 如果用户说要找某个角色但该角色不在场景中，**不要让在场角色替被找的角色回答**
- 例如：用户说"我来找小满"，小满不在场 → 林浅可以说"小满刚走了"，但不能代替小满说话
- LLM 应根据玩家最新消息和历史对话自主判断哪些角色在场、哪些角色应该回应

**场景描述规则**：
- 如果你看到【当前场景】，说明场景尚未变化。除非场景确实发生了明显变化（地点/时间/天气/突发事件），否则**不要输出新的场景描述**。
- 直接以 :角色名: 开头写对话即可，不要重复描述已经确定的场景。
- 只有当剧情需要你描述一个新场景时（如角色移动到新地点、天气突变、突发事件），才输出新的场景描述。`;
}
