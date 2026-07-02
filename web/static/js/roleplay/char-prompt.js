// === 角色生成提示词 ===
// 基于世界观和用户灵感构建 LLM 提示词

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
    const visualStyle = state.story?.imageStyle || 'anime';
    const worldview = state.story.worldview || '未设定';
    const title = state.story.title || '';
    const mainArc = (state.story.mainArc || []).map(a => `・${a.phase}：${a.description}`).join('\\n');
    const toneKeywords = (state.story.toneKeywords || []).join('、');
    const worldviewNotes = state.story.worldviewNotes || '无额外约束';

    return `你是角色设计师和编剧。请根据以下世界观和用户灵感生成恰好 ${count} 个鲜活的角色。

⚠️ 【画面风格】全局统一的画面风格为「${visualStyle}」。所有角色的外观、服装、环境描写都必须符合这一视觉风格。角色生图字段（imageStyle/imageFace/imageHair/imageBody/imageClothes/imageEnvironment）要围绕这一风格构建。

⚠️ 【用户灵感优先】用户明确要求：${inspiration || '无特定要求'}。角色设计必须严格遵循用户灵感中的所有要求（时代背景、地点、角色数量、性别比例、关系类型等）。

⚠️ 【数量强制要求】必须生成 ${count} 个角色，一行一个数据行，绝不能少！生成 ${count-1} 个或更少将被视为失败。

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
NPC角色与玩家的互动需要考虑玩家性别，关系描述要与玩家性别匹配。
${genderHint ? `\n【性别倾向】${genderHint}` : ''}

输出格式要求（TSV 表格格式，用 | 分隔字段，不要输出任何其他文字）：

第一行必须是表头，后续每一行是一个角色：
name|age|gender|appearance|personality|background|relationship|motivation|secret|speechStyle|voice|imageStyle|imageFace|imageHair|imageBody|imageClothes|imageEnvironment

⚠️ 重要：第一行必须是完整的表头，不要省略任何字段！

⚠️ 【画面风格统一】所有角色的 imageStyle 字段必须使用同一个风格：${visualStyle}。这是全局统一的画面风格，每个角色的 imageStyle 都要填完全相同的值。

基础字段说明：
- name: 角色名（2-4个字，有特色）
- age: 年龄数字
- gender: 男/女
- appearance: 外貌特征（50字以内，具体且有辨识度）
- personality: 性格特点（50字以内，包含优点和缺点）
- background: 背景故事（80字以内，包含关键经历和转折点）
- relationship: 与主角/玩家的关系（30字以内，初始关系和可能的发展）
- motivation: 核心动机/欲望（20字以内，驱动角色行动的根本原因）
- secret: 隐藏的秘密（30字以内，可以在冒险中逐步揭示）
- speechStyle: 说话风格（20字以内，比如毒舌、温柔、简洁等）
- voice: Edge TTS 语音名称（必须从以下列表中选取，不要编造不存在的声音）

【女声（4个）】zh-CN-XiaoxiaoNeural（温柔知性）、zh-CN-XiaoyiNeural（活泼甜美）、zh-CN-liaoning-XiaobeiNeural（东北俏皮）、zh-CN-shaanxi-XiaoniNeural（西北温婉）

【男声（4个）】zh-CN-YunxiNeural（沉稳磁性）、zh-CN-YunjianNeural（阳光开朗）、zh-CN-YunxiaNeural（温和儒雅）、zh-CN-YunyangNeural（成熟稳重）

根据角色性别和性格自动匹配对应声线。同一故事不同角色尽量用不同音色，避免重复。

生图模块化字段（全部用英文，供 AI 绘画使用）：
- imageStyle: 画面风格（英文，如 anime, watercolor, oil painting, digital realism, pencil sketch, comic book, photorealistic, 3D render, studio ghibli, cyberpunk, fantasy art, chibi, pixel art, ink wash, vaporwave, dark fantasy）
- imageFace: 五官脸型（英文，描述面部特征，如 sharp jawline, round face, large amber eyes, thin lips）
- imageHair: 妆扮发型（英文，发型+妆容，如 long silver hair in twin tails, light makeup with smoky eyes）
- imageBody: 身体四肢（英文，体型+姿态，如 slender figure, athletic build, graceful posture）
- imageClothes: 衣服配饰（英文，服装+饰品，如 white lab coat over black dress, gold necklace, round glasses）
- imageEnvironment: 环境特效（英文，背景+光影，如 warm sunset glow, soft bokeh background, misty forest）

完整角色图 = imageStyle + imageFace + imageHair + imageBody + imageClothes + imageEnvironment（全身）
降级半身 = imageStyle + imageFace + imageHair + imageBody（腰部以上）
降级特写 = imageStyle + imageFace（面部到锁骨）

示例（不要照抄内容，只照格式）：
name|age|gender|appearance|personality|background|relationship|motivation|secret|speechStyle|voice|imageStyle|imageFace|imageHair|imageBody|imageClothes|imageEnvironment
阿德拉|28|女|苍白瘦削，左眼黄铜义眼|冷静理智，极度缺乏安全感|曾是贵族家替补厨师，因被诬陷遭驱逐|起初视主角为棋子，后转为生死搭档|复仇并查明父亲失踪真相|义眼中封印着低阶怨灵|冷嘲热讽，用烹饪术语隐喻人生险恶|zh-CN-XiaoxiaoNeural|anime|pale skin, left eye is a brass gear prosthetic, sharp cheekbones|long black hair in a neat bob cut, minimal makeup|slender and slightly hunched frame|white apron over dark Victorian dress, brass goggles on head|dimly lit kitchen with steam and warm amber glow
巴尔扎|45|男|魁梧如熊，右臂机械锅铲义肢|暴躁冲动，护短|前地下拳手，被深渊灶台改造为活体搅拌机|雇佣兵兼守护者，认为主角是少数不把他当怪物看的人|保护主角，终结自己作为器具的命运|机械义肢内部连接着未成熟的灵体心脏|粗鲁直白，常伴有吞咽口水的声音|zh-CN-YunxiNeural|digital realism|broad square jaw, scar across nose, thick eyebrows|short buzz cut, sweat-dampened hair|massive muscular build, right arm is a mechanical spatula|torn tank top revealing mechanical parts, leather combat pants|gritty underground arena with sparks and smoke

要求：
1. 角色之间要有关系网（亲友、敌对、师徒、竞争对手等）
2. 每个角色必须有鲜明的个性和缺陷
3. 角色设计必须符合世界观设定，不能出现违和感
4. 至少包含1个女性角色和1个男性角色
5. 生图字段全部用英文，适合 AI 绘画
6. 避免脸谱化和套路化
7. 值中不要使用 | 符号，如有请用其他词替代`;
}
