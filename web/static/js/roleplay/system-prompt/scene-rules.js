// === 场景规则与角色关系 ===
// 从 state 中提取角色列表、关系网、在场状态
// 序章专用精简版：压缩空间规则，删除示例

export function buildSceneRules(allChars, state) {
    const playerName = state.player?.name || null;
    const npcChars = playerName
        ? allChars.filter(c => c.name !== playerName)
        : allChars;
    const inSceneNote = npcChars.map(c => {
        return `- ${c.name}（${c.gender}，${c.age}岁）— ${c.appearance ? '外貌：' + c.appearance.slice(0, 30) : ''}${c.relationship ? '，与主角：' + c.relationship : ''}`;
    }).join('\n');

    return `=== 场景中所有角色 ===${inSceneNote}

【空间系统规则（精简版）】
1. 序章只让一个角色先登场发起对话
2. 距离 > 10 的角色默认听不到玩家说话
3. 玩家直接呼唤某角色名字 → 该角色必然听见
4. 玩家对大家说话 → 只有距离 ≤ 10 的角色能听见
5. 只有"在场且能听见"的角色才能参与回复
6. 场景切换时，所有角色离场后重新登场`;
}
