// === Section: 角色生成 ===
// 第二阶段：基于世界观生成角色 + 两阶段流程编排

App.generateCharacters = async function(count) {
    count = count || 3;

    if (!state.story || !state.story.worldview) {
        throw new Error('先生成世界观再生成角色');
    }

    rpLog('info', 'CHARS', `开始基于世界观生成 ${count} 个角色`);
    addSystemMessage(`正在生成 ${count} 个角色...`);

    const prompt = `你是角色设计师和编剧。请根据以下世界观生成 ${count} 个鲜活的角色。

【世界观概要】
${state.story.worldview}

【故事标题】
${state.story.title}

【主线弧光】
${state.story.mainArc.map(a => `・${a.phase}：${a.description}`).join('\n')}

【氛围基调】
${(state.story.toneKeywords || []).join('、')}

【角色设计约束】
${state.story.worldviewNotes || '无额外约束'}

输出严格的 JSON 格式（不要输出任何其他文字，只输出 JSON）：
{
    "characters": [
        {
            "name": "角色名（2-4个字，有特色）",
            "age": 20,
            "gender": "男/女/其他",
            "appearance": "外貌特征（50字以内，具体且有辨识度）",
            "personality": "性格特点（50字以内，包含优点和缺点）",
            "background": "背景故事（80字以内，包含关键经历和转折点）",
            "relationship": "与主角/玩家的关系（30字以内，初始关系和可能的发展）",
            "motivation": "核心动机/欲望（20字以内，驱动角色行动的根本原因）",
            "secret": "隐藏的秘密（30字以内，可以在冒险中逐步揭示）",
            "speechStyle": "说话风格（20字以内，比如毒舌、温柔、简洁等）",
            "imagePrompt": "角色头像的AI绘画提示词（英文，详细描述外貌、发型、服装、表情、背景风格）"
        }
    ]
}

要求：
1. 角色之间要有关系网（亲友、敌对、师徒、竞争对手等）
2. 每个角色必须有鲜明的个性和缺陷
3. 角色设计必须符合世界观设定，不能出现违和感
4. 至少包含1个女性角色和1个男性角色
5. imagePrompt 要用英文，适合 AI 绘画，风格统一
6. 避免脸谱化和套路化`;

    const resp = await App.agnesChat([{
        role: 'system',
        content: '你是专业的角色设计师，擅长创造立体、有深度的虚构角色。输出必须是严格合法的 JSON。'
    }, {
        role: 'user',
        content: prompt
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
        rpLog('error', 'CHARS', 'JSON 解析失败: ' + e.message);
        try {
            data = App.manualJsonParse(resp);
        } catch (e2) {
            rpLog('error', 'CHARS', '手动解析也失败: ' + e2.message);
            throw new Error('角色生成失败：无法解析 LLM 返回的数据');
        }
    }

    const charList = Array.isArray(data.characters) ? data.characters : [];
    if (charList.length === 0) {
        throw new Error('角色生成失败：API 未返回有效角色数据');
    }

    // 诊断：检查原始数据中 imagePrompt 字段的实际名称
    const sampleChar = charList[0] || {};
    const rawKeys = Object.keys(sampleChar);
    rpLog('info', 'CHARS', '角色 #0 原始字段: ' + rawKeys.join(', '));
    const hasImageField = rawKeys.some(k => k.toLowerCase().includes('image') && k.toLowerCase().includes('prompt'));
    if (!hasImageField && charList.length > 0) {
        rpLog('warn', 'CHARS', '警告：角色数据中没有 imagePrompt/image_prompt 字段，头像将跳过生成');
    }

    // 保存角色
    state.characters = charList.map((c, i) => {
        let imagePrompt = c.imagePrompt || c.image_prompt || c.ImagePrompt || c.Image_Prompt || '';
        if (!imagePrompt) {
            const gender = c.gender === '男' ? 'male' : c.gender === '女' ? 'female' : 'person';
            const age = c.age || 20;
            const appearance = c.appearance || '';
            const name = c.name || 'unknown';
            imagePrompt = `Portrait of ${name}, ${age} year old ${gender}, ${appearance}, professional character concept art, detailed facial features, clean background`;
            rpLog('info', 'CHARS', `角色 #${i} "${c.name}" 缺少 imagePrompt，已自动生成`);
        }
        return {
            name: c.name || '未知角色',
            age: c.age || 20,
            gender: c.gender || '未知',
            appearance: c.appearance || '',
            personality: c.personality || '',
            background: c.background || '',
            relationship: c.relationship || '',
            faceImageUrl: '',
            imagePrompt: imagePrompt,
            perception: '',
            secret: c.secret || '',
            currentMood: '',
            motivation: c.motivation || '',
            speechStyle: c.speechStyle || ''
        };
    });

    state.characters.forEach((c, i) => {
        if (!c.imagePrompt) {
            rpLog('warn', 'CHARS', `角色 #${i} "${c.name}" imagePrompt 为空，原始数据: ${JSON.stringify(charList[i]).slice(0, 200)}`);
        }
    });

    state.activeCharIndex = 0;
    state.emotions = {};
    state.revealed = {};
    state.characters.forEach(c => {
        state.emotions[c.name] = {
            好感度: { current: 50, initial: 50 },
            亲密感: { current: 20, initial: 20 },
            信任度: { current: 50, initial: 50 },
            吸引力: { current: 30, initial: 30 },
            依赖感: { current: 30, initial: 30 }
        };
        state.revealed[c.name] = {
            appearance: false,
            personality: false,
            background: false,
            relationship: false
        };
    });

    state.story.phase = 'chat';
    state.story.generatedAt = new Date().toISOString();

    await saveState();
    updateStoryHeader();
    updateGenerationControls();

    rpLog('info', 'CHARS', `角色生成完成: ${state.characters.map(c => c.name).join(', ')}`);
    return state.characters;
};
