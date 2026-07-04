// === Section: 序章生成 ===
// 在角色生成完成后，基于角色数据生成序章场景

App.generateOpeningScene = async function() {
    if (!state.story || !state.story.worldview) {
        rpLog('warn', 'OPENING', '世界观尚未生成，跳过序章生成');
        return '';
    }
    if (!state.characters || state.characters.length === 0) {
        rpLog('warn', 'OPENING', '角色尚未生成，跳过序章生成');
        return '';
    }

    rpLog('info', 'OPENING', '开始生成序章场景');
    addSystemMessage('✍️ 正在生成序章场景...');

    const worldview = state.story.worldview;
    const title = state.story.title || '';
    const mainArc = (state.story.mainArc || []).map(a => `・${a.phase}：${a.description}`).join('\n');
    const toneKeywords = (state.story.toneKeywords || []).join('、');
    const userInspiration = state.story.userInspiration || '';
    
    // 构建角色信息列表（供 LLM 在序章中使用真实角色名和外貌）
    const charInfoList = state.characters.map((c, i) => {
        const gender = c.gender === '女' ? '女性' : c.gender === '男' ? '男性' : '未知';
        const age = c.age || '?';
        const appearance = c.appearance || '未描述';
        const personality = c.personality || '';
        return `角色${i + 1}：${c.name}（${gender}，${age}岁，${appearance}，${personality ? '性格：' + personality : ''}`;
    }).join('\n');

    const systemPrompt = `你是专业的小说作家和剧本创作者。请根据世界观、角色设定和主线剧情，创作一段沉浸式的序章场景。`;

    const userPrompt = `请根据以下信息创作一段序章场景：

【世界观】
${worldview}

【故事标题】
${title}

【主线剧情概要】
${mainArc}

【氛围关键词】
${toneKeywords}

【可用角色列表】（序章中必须使用以下真实角色名，不得使用其他名字）
${charInfoList}

【用户原始灵感】
${userInspiration || '无'}

【输出格式】
请严格按照以下格式输出，不要输出任何其他文字：

{场景描述}
:角色1:(动作/神态)"对话内容"[内心想法]
:角色2:(动作/神态)"对话内容"[内心想法]
<建议回复1┇建议回复2┇建议回复3>

具体要求：
1. 场景描述：150-250字的沉浸式环境描写，包含氛围、光影、声音等细节，用 {场景描述} 包裹
2. 角色对话：格式为 :角色名:(动作/神态)"对话内容"[内心想法]，每行一个角色，必须使用真实角色名
3. 建议回复：提供 2-3 个玩家可选的行动建议，用 ┇ 分隔，包裹在 <> 标签中，每条不超过20字
4. 场景描述中不要出现 :角色名: 这种格式，那是角色对话格式
5. 对话部分要体现角色性格
6. 必须包含至少一个主要角色在场
7. ⚠️ 即使只有一个角色回复，也必须明确写出 :角色名: 前缀
8. ⚠️ 每一轮消息都必须包含 <> 建议回复选项内容，不能省略

⚠️ 重要：序章中出现的角色必须来自上述角色列表，使用真实姓名，不能使用"夜鸢""烬"等临时名称。`;

    try {
        const startTime = Date.now();
        rpLog('info', 'TIMEOUT', `LLM 请求开始: opening_scene`);
        const resp = await App.agnesChatWithFallback([{
            role: 'system',
            content: systemPrompt
        }, {
            role: 'user',
            content: userPrompt
        }], { route: 'opening' });
        const elapsed = Date.now() - startTime;
        rpLog('info', 'TIMEOUT', `LLM 请求完成: opening_scene, 耗时 ${elapsed}ms`);

        // 清理可能的 markdown 代码块包裹
        let openingScene = resp.trim();
        const codeBlockMatch = openingScene.match(/```(?:json|text)?\s*\n([\s\S]*?)\n```/);
        if (codeBlockMatch) {
            openingScene = codeBlockMatch[1].trim();
        }

        rpLog('info', 'OPENING', `序章生成完成，长度: ${openingScene.length}`);
        return openingScene;
    } catch (err) {
        rpLog('error', 'OPENING', `序章生成失败: ${err.message}`);
        addSystemMessage(`⚠️ 序章生成失败: ${err.message}`);
        return '';
    }
};
