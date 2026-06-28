// === Section: 随机世界观因子库 ===
// 两阶段生成的第一阶段：随机组合世界观因子

App.WorldviewFactors = {
    // 时代背景因子
    eras: [
        '上古神话时代', '中世纪封建时期', '文艺复兴时期', '工业革命时期',
        '近未来赛博朋克', '星际殖民纪元', '后末日废土时代', '架空异世界',
        '民国乱世', '架空王朝盛世', '蒸汽朋克黄金时代', '太空歌剧时代',
        '大航海时代', '维多利亚时代', '现代都市日常', '远古洪荒时代'
    ],

    // 力量体系因子
    powerSystems: [
        '传统修仙体系（炼气→筑基→金丹→元婴→化神→渡劫）',
        '魔法元素体系（火水风土冰雷光暗八系）',
        '异能觉醒体系（E级到SSS级，战斗/辅助/感知三分类）',
        '科技义体改造体系（脑机接口、机械飞升、意识上传）',
        '武道真气体系（先天、宗师、大宗师、陆地神仙）',
        '灵能 psychic 体系（念力、预知、心灵感应）',
        '符文炼金体系（等价交换、物质转化、封印术式）',
        '契约召唤体系（与异界生物签订契约获得力量）',
        '血脉觉醒体系（古老血脉逐步复苏）',
        '无超自然力量，纯靠智谋和武艺',
        '信仰神力体系（祈祷获赐福，神殿晋升）',
        '魂环猎杀体系（击杀魂兽获取魂环提升自身）'
    ],

    // 核心冲突因子
    conflicts: [
        '富人与穷人的阶级对立，底层人民反抗压迫',
        '不同种族/阵营之间的资源争夺与领土争端',
        '古老预言与个人意志的碰撞',
        '科技进步与人性的冲突',
        '正义与道德灰色地带的抉择',
        '外来入侵者与本土守护者的对抗',
        '宿命论与自由意志的对立',
        '两大家族/势力的世代恩怨',
        '守护世界与拯救至亲的两难选择',
        '隐藏身份暴露后的连锁危机',
        '被误解与渴望被认可的内心挣扎',
        '秩序与混乱的理念之争',
        '探索未知与安于现状的分歧',
        '复仇与宽恕的道德困境'
    ],

    // 氛围基调因子
    atmospheres: [
        '轻松治愈的日常风，温暖如春日阳光',
        '紧张刺激的冒险风，步步惊心',
        '压抑沉重的黑暗风，人性考验',
        '浪漫唯美的恋爱风，命运红线',
        '悬疑诡谲的探案风，层层反转',
        '热血激昂的战斗风，友情与努力',
        '荒诞幽默的搞笑风，反差萌',
        '诗意朦胧的文艺风，物哀之美',
        '史诗宏大的战争风，群像叙事',
        '神秘幽暗的哥特风，禁忌之恋'
    ],

    // 特殊设定因子（可选，增加独特性）
    specialElements: [
        '这个世界有一种独特的货币或交易方式',
        '存在一个神秘的地下情报组织',
        '每年会举行一次决定命运的大型活动/比赛',
        '某种自然现象或天象影响着整个世界',
        '传说中存在一件改变一切的远古神器',
        '城市建在巨大的移动机械之上',
        '天空中有两颗月亮，潮汐影响魔力',
        '人们通过梦境进行跨地域交流',
        '动物可以说话，与人类共同生活',
        '时间流速在不同区域有所差异',
        '所有人生来就有一个无法选择的命运标签',
        '存在一个专门处理超自然事件的官方机构',
        '食物具有特殊功效，烹饪是一门战斗技艺',
        '音乐和舞蹈可以转化为战斗力',
        '没有特别说明，一切正常',
        '不存在特别说明，一切正常'
    ],

    /**
     * 随机抽取一个世界观因子组
     * 返回：{ era, powerSystem, conflict, atmosphere, specialElement, combinedDescription }
     */
    roll: function() {
        const era = this.eras[Math.floor(Math.random() * this.eras.length)];
        const powerSystem = this.powerSystems[Math.floor(Math.random() * this.powerSystems.length)];
        const conflict = this.conflicts[Math.floor(Math.random() * this.conflicts.length)];
        const atmosphere = this.atmospheres[Math.floor(Math.random() * this.atmospheres.length)];
        const specialElement = this.specialElements[Math.floor(Math.random() * this.specialElements.length)];

        return { era, powerSystem, conflict, atmosphere, specialElement };
    },

    /**
     * 将因子组合成一个连贯的世界观描述文本（供 LLM prompt 使用）
     */
    toPrompt: function(factors) {
        return `时代背景：${factors.era}
力量体系：${factors.powerSystem}
核心冲突：${factors.conflict}
氛围基调：${factors.atmosphere}
特殊设定：${factors.specialElement}`;
    },

    /**
     * 将因子组合成一个简短的世界观名称（LLM 会在后续生成更具体的名称）
     */
    toBrief: function(factors) {
        return `${factors.era}·${factors.atmosphere}`;
    }
};
