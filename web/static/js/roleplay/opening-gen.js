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

【输出格式 — 严格逐行输出，不要任何额外文字或标记】

[第一行] 场景描述（纯文本，不要加 {场景描述及旁白} 这样的标签行，不要加花括号包裹）
:角色1:(动作/神态)「对话内容」[内心想法]
:角色2:(动作/神态)「对话内容」[内心想法]
<回复1┇回复2┇回复3>

严格规则：
1. 第一行直接输出场景描述文字（150-250字沉浸式环境描写），**不要**用花括号包裹，**不要**输出 {场景描述及旁白} 这样的标签
2. 从第二行开始，每行一个角色，格式严格为 :角色名:(动作/神态)「对话内容」[内心想法]
   - ⚠️ :角色名: 前后各一个冒号（双冒号格式），不可省略
   - ⚠️ 即使只有一个角色在场，也必须写 :角色名: 前缀
3. 最后一行必须是 <建议回复1┇建议回复2┇建议回复3>，用尖括号包裹，┇（U+2507）分隔
4. ⚠️ 每条回复不超过20字，必须是玩家视角的具体行动/语言，要有剧情推进作用
5. 不能是"好的""嗯"等口水词
6. 三条回复风格差异化：温和保守 / 主动试探 / 强势叛逆
7. 「」为对话内容的固定包裹符号，不可省略或用其他符号替代
8. (动作/神态) 为外在表现，[内心想法] 为角色隐秘心理，不对外表露
9. 对话部分要体现角色性格，与角色设定一致
10. ⚠️ 角色名字必须与实际发言内容匹配——禁止 :林悦: 的名字下写攻击性台词（如果人设是温柔型）

⚠️ 重要：序章中出现的角色必须来自上述角色列表，使用真实姓名。`;

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
