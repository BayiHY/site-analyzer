// === 角色生成提示词 ===
// 基于世界观和用户灵感构建 LLM 提示词
// 原则：提示词只管内容意图和约束，不管格式细节（格式由解析层处理）

/**
 * 构建角色生成提示词
 * @param {number} count - 期望角色数
 * @param {string} playerGender - 玩家性别
 * @param {string} inspiration - 用户灵感
 * @param {string} genderHint - 性别倾向
 * @param {object} state - 全局状态
 * @returns {string} 提示词文本
 */
export function buildCharPrompt(count, playerGender, inspiration, genderHint, state) {
    const pg = playerGender || state.player?.gender || '男';
    const visualStyle = state.story?.imageStyle || '';
    const worldview = state.story.worldview || '未设定';
    const title = state.story.title || '';
    const mainArc = (state.story.mainArc || []).map(a => `・${a.phase}：${a.description}`).join('\\n');
    const toneKeywords = (state.story.toneKeywords || []).join('、');
    const worldviewNotes = state.story.worldviewNotes || '无额外约束';

    // 中文数字映射
    const cnNums = {'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
    function parseCount(text) {
        // 匹配 "3名女角色" 或 "三名女角色" 或 "2名男角色"
        const m = text.match(/([一二两三四五六七八九十\d]+)[名个位]?[男女]/);
        if (!m) return null;
        const ch = m[1];
        if (cnNums[ch] !== undefined) return cnNums[ch];
        const n = parseInt(ch, 10);
        return isNaN(n) ? null : n;
    }

    // 根据用户灵感构建性别要求（同时提取角色数量）
    const genderConstraint = (() => {
        if (!inspiration) return '至少包含1个女性角色和1个男性角色';
        if (inspiration.includes('全女')) return '全部为女性角色';
        if (inspiration.includes('全男')) return '全部为男性角色';
        
        const femaleCount = parseCount(inspiration);
        const maleCount = (() => {
            const m = (inspiration || '').match(/([一二两三四五六七八九十\d]+)[名个位]?[男]/);
            if (!m) return null;
            if (cnNums[m[1]] !== undefined) return cnNums[m[1]];
            const n = parseInt(m[1], 10);
            return isNaN(n) ? null : n;
        })();
        
        // 如果用户明确要求了数量，角色总数 = 指定数量
        // 不额外填充凑数角色
        if (femaleCount && !maleCount) {
            return `包含${femaleCount}名女性角色，总角色数即为${femaleCount}人，无需额外填充`;
        }
        if (maleCount && !femaleCount) {
            return `包含${maleCount}名男性角色，总角色数即为${maleCount}人，无需额外填充`;
        }
        if (femaleCount && maleCount) {
            const total = femaleCount + maleCount;
            return `包含${femaleCount}名女性角色和${maleCount}名男性角色，共${total}人`;
        }
        
        if (inspiration.includes('后宫') || inspiration.includes('前女友')) return '包含多名女性角色';
        if (inspiration.includes('女角色')) return '包含女性角色';
        if (inspiration.includes('男角色')) return '包含男性角色';
        return '至少包含1个女性角色和1个男性角色';
    })();

    // 从用户灵感中解析实际角色数量，与 count 参数协调
    // 如果用户指定了数量，使用用户指定的值；否则使用传入的 count
    const effectiveCount = (() => {
        const fc = parseCount(inspiration);
        const mc = (() => {
            const m = (inspiration || '').match(/([一二两三四五六七八九十\d]+)[名个位]?[男]/);
            if (!m) return null;
            if (cnNums[m[1]] !== undefined) return cnNums[m[1]];
            const n = parseInt(m[1], 10);
            return isNaN(n) ? null : n;
        })();
        if (fc && mc) return fc + mc;
        if (fc) return fc;
        if (mc) return mc;
        return count; // fallback 到传入的 count
    })();

    const styleInstruction = visualStyle
        ? `全局统一的画面风格为「${visualStyle}」。所有角色的外观、服装、环境描写都必须符合这一视觉风格。角色生图字段（imageFace/imageHair/imageBody/imageClothes/imageEnvironment）要围绕这一风格构建。`
        : `画面风格随机：请根据故事灵感自由选择合适的画面风格，并在每个角色的 imageFace/imageHair/imageBody/imageClothes/imageEnvironment 字段中体现所选风格。`;

    return `你是角色设计师和编剧。请根据以下世界观和用户灵感生成恰好 ${effectiveCount} 个鲜活的角色。

⚠️ 【画面风格】${styleInstruction}

⚠️ 【用户灵感优先】用户明确要求：${inspiration || '无特定要求'}。角色设计必须严格遵循用户灵感中的所有要求（时代背景、地点、角色数量、性别比例、关系类型等）。

⚠️ 【性别要求】${genderConstraint}

⚠️ 【角色数量】必须生成恰好 ${effectiveCount} 个角色，一行一个数据行。

【世界观概要】
${worldview}

【故事标题】
${title}

【主线弧光】
${mainArc}

【氛围基调】
${toneKeywords}

【角色设计约束】
${worldviewNotes}

【玩家信息】
玩家扮演的角色名：${state.player?.name || '无名旅者'}
玩家扮演的主角性别：${pg}
⚠️ 玩家角色是独立个体，不要生成与玩家同名或身份重叠的NPC。
${(() => {
    // 如果用户明确要求了角色数量和性别（如"两名女角色"），不强制插入男性玩家/NPC
    const fc = parseCount(inspiration);
    if (fc && inspiration.includes('女角色') && !inspiration.includes('男角色')) {
        return `⚠️ 用户灵感指定了 ${fc} 名女性角色，无男性角色要求。NPC 关系描述应聚焦于女性角色之间的互动，玩家作为旁观者/参与者介入，不要强行添加男性 NPC。`;
    }
    return 'NPC角色与玩家的互动需要考虑玩家性别，关系描述要与玩家性别匹配。';
})()}
${genderHint ? `【性别倾向】${genderHint}` : ''}

输出格式要求（TSV 表格格式，用 | 分隔字段）：
⚠️ 第一行不要输出表头！直接输出角色数据行。
字段顺序固定为 4 列：name|age|gender|relationship

字段说明：
- name: 角色名（2-4个字，有特色）
- age: 年龄数字
- gender: 男/女
- relationship: 与主角/玩家的关系（30字以内，初始关系和可能的发展）

要求：
1. 角色之间要有关系网（亲友、敌对、师徒、竞争对手等）
2. 角色设计必须符合世界观设定，不能出现违和感
3. 避免脸谱化和套路化
4. 每个角色必须有鲜明的个性方向`;
}

/**
 * 构建角色基本信息生成提示词（第一步：仅生成 name, gender, age, relationship）
 * 用于两步流程的第一步，让 Agnes 快速生成角色基本信息
 * @param {number} count - 期望角色数
 * @param {string} playerGender - 玩家性别
 * @param {string} inspiration - 用户灵感
 * @param {string} genderHint - 性别倾向
 * @param {object} state - 全局状态
 * @returns {string} 提示词文本
 */
export function buildCharBasicPrompt(count, playerGender, inspiration, genderHint, state) {
    const pg = playerGender || state.player?.gender || '男';
    const visualStyle = state.story?.imageStyle || '';
    const worldview = state.story.worldview || '未设定';
    const title = state.story.title || '';
    const mainArc = (state.story.mainArc || []).map(a => `・${a.phase}：${a.description}`).join('\\n');
    const toneKeywords = (state.story.toneKeywords || []).join('、');
    const worldviewNotes = state.story.worldviewNotes || '无额外约束';

    // 复用数量解析逻辑
    const cnNums = {'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
    function parseCount(text) {
        const m = text.match(/([一二两三四五六七八九十\d]+)[名个位]?[男女]/);
        if (!m) return null;
        const ch = m[1];
        if (cnNums[ch] !== undefined) return cnNums[ch];
        const n = parseInt(ch, 10);
        return isNaN(n) ? null : n;
    }

    const genderConstraint = (() => {
        if (!inspiration) return '至少包含1个女性角色和1个男性角色';
        if (inspiration.includes('全女')) return '全部为女性角色';
        if (inspiration.includes('全男')) return '全部为男性角色';
        const femaleCount = parseCount(inspiration);
        const maleCount = (() => {
            const m = (inspiration || '').match(/([一二两三四五六七八九十\d]+)[名个位]?[男]/);
            if (!m) return null;
            if (cnNums[m[1]] !== undefined) return cnNums[m[1]];
            const n = parseInt(m[1], 10);
            return isNaN(n) ? null : n;
        })();
        if (femaleCount && !maleCount) return `包含${femaleCount}名女性角色`;
        if (maleCount && !femaleCount) return `包含${maleCount}名男性角色`;
        if (femaleCount && maleCount) return `包含${femaleCount}名女性和${maleCount}名男性`;
        if (inspiration.includes('后宫') || inspiration.includes('前女友')) return '包含多名女性角色';
        if (inspiration.includes('女角色')) return '包含女性角色';
        if (inspiration.includes('男角色')) return '包含男性角色';
        return '至少包含1个女性和1个男性';
    })();

    const effectiveCount = (() => {
        const fc = parseCount(inspiration);
        const mc = (() => {
            const m = (inspiration || '').match(/([一二两三四五六七八九十\d]+)[名个位]?[男]/);
            if (!m) return null;
            if (cnNums[m[1]] !== undefined) return cnNums[m[1]];
            const n = parseInt(m[1], 10);
            return isNaN(n) ? null : n;
        })();
        if (fc && mc) return fc + mc;
        if (fc) return fc;
        if (mc) return mc;
        return count;
    })();

    return `你是角色设计师和编剧。请根据以下世界观和用户灵感生成恰好 ${effectiveCount} 个鲜活的角色。

⚠️ 【用户灵感优先】用户要求：${inspiration || '无特定要求'}。
⚠️ 【性别要求】${genderConstraint}
⚠️ 【角色数量】必须生成恰好 ${effectiveCount} 个角色，一行一个数据行。

【世界观概要】
${worldview}

【故事标题】
${title}

【主线弧光】
${mainArc}

【氛围基调】
${toneKeywords}

【画面风格】${visualStyle || '未指定'}

【角色设计约束】
${worldviewNotes}

【玩家信息】
玩家扮演的角色名：${state.player?.name || '无名旅者'}
玩家扮演的主角性别：${pg}
⚠️ 玩家角色是独立个体，不要生成与玩家同名或身份重叠的NPC。

输出格式要求（TSV 表格格式，用 | 分隔字段）：
⚠️ 第一行不要输出表头！直接输出角色数据行。
字段顺序固定为 19 列：
name|gender|age|appearance|voice|personality|relationships|origin|motivation|abilities|likes|habits|ttsPitch|ttsRate|imageFace|imageHair|imageBody|imageClothes|imageEnvironment

=== 11 项基础信息（静态标签，不讲故事）===
1. name: 角色名（2-4个字，有特色，符合世界观）
2. gender: 男/女
3. age: 年龄数字
4. appearance: 外貌特征（纯标签化，标志性五官/体型/疤痕/发色/瞳色，不写故事，50字以内）
5. voice: 声线（音色+语速+说话习惯+口头禅风格，纯标签化，50字以内）
6. personality: 性格（主性格+反差性格+性格缺陷，纯特质标签，不解释成因，50字以内）
7. relationships: 角色关系网（亲属/羁绊/挚友/仇敌/上下级/阵营关联，标签式罗列，30字以内）
8. origin: 出身（家世背景/成长环境/阶层/出生地/原生条件，只写现状设定，不写经历故事，50字以内）
9. motivation: 核心动机（角色一生的核心执念/追求/行动的根本目的，20字以内）
10. abilities: 能力与短板（专属天赋/技能/武器/优势 + 弱点/限制/代价/短板，30字以内）
11. likes: 喜恶（喜欢的人和物/讨厌的事物/雷点/忌讳，20字以内）
12. habits: 习惯癖好（专属小动作/生活小怪癖/下意识行为/独有细节，20字以内）

=== 声线参数（从 voice 字段衍生）===
- ttsPitch: 音色基底音高（格式如 -40Hz、-32Hz、...、+40Hz，步长 8Hz，贴合角色性格）
- ttsRate: 语速基底（格式如 -10%、-5%、0%、+5%、+10%，控制在 -8% ~ +8% 范围内）

=== 生图字段（全部用英文，基于 appearance 字段衍生）===
- imageFace: 面部特征英文描述（适合 AI 绘画）
- imageHair: 发型英文描述
- imageBody: 体型英文描述
- imageClothes: 服装英文描述
- imageEnvironment: 环境/光影英文描述

=== 设计原则 ===
1. 外貌和声线必须配对设计，不能只写外貌不写声线
2. 声线 pitch/rate 要贴合角色性格：活泼角色语速稍快(+5%)，沉稳角色语速稍慢(-5%)
3. 同性别角色 pitch 不能相同，用 -40Hz/+32Hz/-24Hz 等微调区分
4. 所有 11 项基础信息都是静态标签，不讲故事、不解释成因
5. 角色之间要有关系网（亲友、敌对、师徒、竞争对手等）
6. 角色设计必须符合世界观设定，不能出现违和感
7. 避免脸谱化和套路化
8. 每个角色必须有独特性`;
}
