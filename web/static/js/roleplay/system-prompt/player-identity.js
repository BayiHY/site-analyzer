// === 玩家身份模块 ===
// 构建玩家身份信息，注入到系统提示词中
// 核心职责：明确区分"玩家角色"与"NPC角色"的身份边界

export function buildPlayerIdentity(state) {
    const p = state.player || {};
    const playerName = p.name || '无名旅者';
    const playerGender = p.gender || '未知';

    return `=== 玩家身份 ===
玩家扮演的角色名：${playerName}
玩家角色性别：${playerGender}
⚠️ 玩家角色（${playerName}）是独立于场景中所有NPC的个体。
⚠️ 严禁替玩家角色说话、做决定或描写内心想法。
⚠️ 所有NPC的对话和动作只针对玩家角色（${playerName}），不得互相替代。
⚠️ 如果玩家角色名出现在NPC列表中，说明发生了身份重叠错误——此时应将玩家视为独立于该NPC的存在。`;
}

/**
 * 从用户输入中提取玩家名字（用于前端初始化时解析）
 * @param {string} inspiration - 用户灵感文本
 * @param {string} defaultName - 默认名字
 * @returns {string} 提取的玩家名字
 */
export function extractPlayerName(inspiration, defaultName) {
    if (!inspiration) return defaultName;

    // 匹配 "扮演XXX"、"我是XXX"、"主角叫XXX" 等模式
    const patterns = [
        /(?:扮演|我[是叫]|主角[叫名]?|玩家[叫名]?)[:\s:：]*([^\s|]{2,8})/,
        /(?:扮作|饰演)[^\s|]{2,8}/,
    ];

    for (const pattern of patterns) {
        const match = inspiration.match(pattern);
        if (match && match[1]) {
            const name = match[1].trim();
            // 排除非名字词汇
            if (/^[^\d\.\,\;\:\!\?\$\#\&\*\(\)\[\]\{\}]+$/.test(name)) {
                return name;
            }
        }
    }

    return defaultName;
}
