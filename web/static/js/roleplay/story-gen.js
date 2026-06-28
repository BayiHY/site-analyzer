// === Section: 世界观生成 ===
// 第一阶段：基于世界观因子生成故事骨架 + JSON 解析

App.manualJsonParse = function(str) {
    let normalized = str
        .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
        .replace(/\u201c/g, '"').replace(/\u201d/g, '"')
        .replace(/\uFF07/g, "'").replace(/\uFF02/g, '"')
        .replace(/\u300C/g, '"').replace(/\u300D/g, '"')
        .replace(/\u300E/g, '"').replace(/\u300F/g, '"');
    normalized = normalized.replace(/,\s*([\]}])/g, '$1');
    normalized = normalized.replace(/:\s*'([^']*)'/g, function(m, val) {
        return ': "' + val.replace(/'/g, "\\'").replace(/"/g, '\\"') + '"';
    });
    normalized = normalized.replace(/'([^']*)'\s*:/g, '"$1":');
    normalized = normalized.replace(/:\s*'([^']*)'/g, ':"$1"');
    
    return JSON.parse(normalized);
};

App.generateWorldview = async function(userInspiration) {
    const factors = App.WorldviewFactors.roll();
    const factorPrompt = App.WorldviewFactors.toPrompt(factors);

    rpLog('info', 'WORLDVIEW', '随机因子: ' + JSON.stringify({
        era: factors.era,
        powerSystem: factors.powerSystem.substring(0, 20) + '...',
        atmosphere: factors.atmosphere
    }));

    let systemPrompt = '你是世界观架构师和故事策划。请根据以下世界观因子，创作一个完整的故事骨架。';

    if (userInspiration && userInspiration.length > 0) {
        systemPrompt += `\n\n用户提供了灵感方向：${userInspiration}。请尽量将这个灵感融入世界观中，但不要受其限制——如果因子组合出的世界与灵感冲突，以因子组合出的世界为准。`;
    }

    const userPrompt = `请根据以下世界观因子生成故事骨架：

${factorPrompt}

输出严格的 JSON 格式（不要输出任何其他文字，只输出 JSON）：
{
    "storyTitle": "故事标题（简洁有力，8字以内）",
    "worldviewSummary": "世界观概要（100-200字，描述这个世界的核心特色、社会形态和运转规则）",
    "openingScene": "开场场景描写（100-200字，具体且有画面感，让玩家有代入感）",
    "mainArc": [
        {"phase": "起", "description": "故事起始，主角的日常生活和初始处境"},
        {"phase": "承", "description": "事件触发，主角被迫卷入冲突"},
        {"phase": "转", "description": "冲突升级，主角面临重大抉择"},
        {"phase": "合", "description": "高潮对决，真相揭露"},
        {"phase": "余韵", "description": "结局后的新平衡，为续写留空间"}
    ],
    "toneKeywords": ["关键词1", "关键词2", "关键词3"],
    "worldviewNotes": "给后续角色生成的额外设定约束（50字以内，确保角色设计符合这个世界观）"
}

要求：
1. 世界观要自洽、有细节、有独特性
2. 开场场景要有画面感，能立刻吸引玩家
3. 主线弧光要有起伏，不能平淡
4. toneKeywords 用3个词概括整体氛围
5. worldviewNotes 要包含角色设计的硬性约束`;

    rpLog('info', 'WORLDVIEW', '调用 LLM 生成世界观骨架');
    const resp = await App.agnesChat([{
        role: 'system',
        content: systemPrompt
    }, {
        role: 'user',
        content: userPrompt
    }]);

    let data;
    try {
        const firstBrace = resp.indexOf('{');
        const lastBrace = resp.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) {
            throw new Error('No JSON braces found');
        }
        data = JSON.parse(resp.slice(firstBrace, lastBrace + 1));
    } catch (e) {
        rpLog('error', 'WORLDVIEW', 'JSON 解析失败: ' + e.message);
        try {
            data = App.manualJsonParse(resp);
        } catch (e2) {
            rpLog('error', 'WORLDVIEW', '手动解析也失败: ' + e2.message);
            throw new Error('世界观生成失败：无法解析 LLM 返回的数据');
        }
    }

    state.story = {
        title: data.storyTitle || '未命名故事',
        worldview: data.worldviewSummary || '',
        mainArc: Array.isArray(data.mainArc) ? data.mainArc : [],
        openingScene: data.openingScene || '',
        toneKeywords: Array.isArray(data.toneKeywords) ? data.toneKeywords : [],
        worldviewNotes: data.worldviewNotes || '',
        factors: factors,
        phase: 'worldview'
    };

    await saveState();
    updateStoryHeader();
    updateGenerationControls();

    rpLog('info', 'WORLDVIEW', '世界观生成完成: ' + state.story.title);
    return data;
};
