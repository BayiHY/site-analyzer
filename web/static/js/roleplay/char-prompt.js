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
    const mainArc = (state.story.mainArc || []).map(a => `・${a.phase}：${a.description}`).join('\\\\n');
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
玩家扮演的主角性别：${pg}
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
字段顺序固定为 18 列：name|age|gender|appearance|personality|background|relationship|motivation|secret|speechStyle|voice|ttsPitch|ttsRate|imageFace|imageHair|imageBody|imageClothes|imageEnvironment
⚠️ 所有 5 个 image* 字段必须全部填写，不得省略任何一个！
⚠️ ttsPitch 和 ttsRate 必须在 voice 之后、imageFace 之前填写！

字段说明：
- name: 角色名（2-4个字，有特色）
- age: 年龄数字
- gender: 男/女
- appearance: 外貌特征（50字以内，具体且有辨识度）
- personality: 性格特点（50字以内，包含优点和缺点）
- background: 背景故事（80字以内，包含关键经历和转折点）
- relationship: 与主角/玩家的关系（30字以内，初始关系和可能的发展）
- motivation: 核心动机/欲望（20字以内）
- secret: 隐藏的秘密（30字以内）
- speechStyle: 说话风格（20字以内）
- voice: Edge TTS 语音名称（女声默认 zh-CN-XiaoyiNeural，男声默认 zh-CN-YunxiNeural）
- ttsPitch: 音色基底音高（格式如 -4Hz、-3Hz、-2Hz、-1Hz、0Hz、+1Hz、+2Hz、+3Hz、+4Hz，控制角色音色高低，范围 ±4Hz）
- ttsRate: 语速基底（格式如 -10%、-5%、0%、+5%、+10%、+15%，配合 pitch 塑造性格底色）
  设计原则：
  • pitch 决定音色基础（高低），rate 辅助塑造性格（快=急躁/活泼，慢=沉稳/阴柔）
  • ttsRate 严格控制在 -8% ~ +8% 范围内，超出会失真不自然
  • pitch 严格控制在 -4Hz ~ +4Hz 范围内，超出会失真不自然
  • 每个角色的 ttsPitch/ttsRate 必须根据其具体属性（年龄、职业、性格、身份、说话方式）量身定制
  • 角色间必须差异化：同一故事内，同性别角色的 pitch 值绝对不能完全相同（±1Hz 也算不同）。输出前先检查一遍所有同性别角色的 pitch 值。
  • 可以有各类音色参数参考，但是根据角色实际属性微调，避免每个故事都是刻板音色
  • pitch 分配完全随机但必须贴合角色性格、体型、外貌。不要套模板，不要刻板化。步长为 1Hz，例如：
    - 一个男角色可以是 0Hz，两个可以是 -1Hz 和 +2Hz，三个可以是 -3Hz、+1Hz、+4Hz
    - 前移一步或后移一步都可以，前增后减也可以，关键是贴合角色风格
    - 避免刻板印象：不是所有大叔都低沉、不是所有萝莉都高音、不是所有反派都尖锐
    - 考虑角色内在特质：温柔的大叔可以用 +2Hz，冷酷的少女可以用 -3Hz，反差更有记忆点
  • pitch 默认基准 -2Hz ~ +2Hz 随机。比基准高亢尖细就增加（+1~+2），比基准粗犷低沉就减少（-1~-2），步长 1Hz

- imageFace: 五官脸型（英文）
- imageHair: 发型发色（英文）
- imageBody: 体型体态（英文）
- imageClothes: 衣服配饰（英文）
- imageEnvironment: 环境特效（英文）
所有 image* 字段全部用英文，适合 AI 绘画。

示例（不要照抄内容，只照格式）：
阿德拉|28|女|苍白瘦削，左眼黄铜义眼|冷静理智，极度缺乏安全感|曾是贵族家替补厨师，因被诬陷遭驱逐|起初视主角为棋子，后转为生死搭档|复仇并查明父亲失踪真相|义眼中封印着低阶怨灵|冷嘲热讽，用烹饪术语隐喻人生险恶|zh-CN-XiaoyiNeural|-8Hz|0%|pale skin, left eye is a brass gear prosthetic, sharp cheekbones|long black hair in a neat bob cut, minimal makeup|slender and slightly hunched frame|white apron over dark Victorian dress, brass goggles on head|dimly lit kitchen with steam and warm amber glow
巴尔扎|45|男|魁梧如熊，右臂机械锅铲义肢|暴躁冲动，护短|前地下拳手，被深渊灶台改造为活体搅拌机|雇佣兵兼守护者，认为主角是少数不把他当怪物看的人|保护主角，终结自己作为器具的命运|机械义肢内部连接着未成熟的灵体心脏|粗鲁直白，常伴有吞咽口水的声音|zh-CN-YunxiNeural|-10Hz|-5%|broad square jaw, scar across nose, thick eyebrows|short buzz cut, sweat-dampened hair|massive muscular build, right arm is a mechanical spatula|torn tank top revealing mechanical parts, leather combat pants|gritty underground arena with sparks and smoke

要求：
1. 角色之间要有关系网（亲友、敌对、师徒、竞争对手等）
2. 每个角色必须有鲜明的个性和缺陷
3. 角色设计必须符合世界观设定，不能出现违和感
4. 生图字段全部用英文，适合 AI 绘画
5. 避免脸谱化和套路化
6. ⚠️ ttsPitch/ttsRate 必须差异化！同性别角色不能全部相同。输出前先检查一遍。`;
}
