// === Section: 快捷回复选项 ===
// 每轮对话后调用 LLM 生成 ≥3 条可选回复，用户点击即可自动发送

App.replyOptionsPromise = null;

App.generateReplyOptions = async function(userMessage, charResponse) {
    rpLog('INFO', 'REPLY-OPTS', '开始生成快捷回复选项');
    rpLog('INFO', 'REPLY-OPTS', `用户消息: "${String(userMessage?.content || userMessage).substring(0, 100)}..."`);
    rpLog('INFO', 'REPLY-OPTS', `角色回复: "${String(charResponse?.content || charResponse).substring(0, 100)}..."`);
    const container = document.getElementById('reply-options');
    if (!container) {
        rpLog('WARN', 'REPLY-OPTS', 'reply-options 容器不存在');
        return [];
    }

    const activeChar = state.characters[state.activeCharIndex];
    if (!activeChar) {
        rpLog('WARN', 'REPLY-OPTS', '没有活跃角色');
        return [];
    }

    // 获取最近的消息上下文用于生成更有针对性的降级选项
    const recentMessages = state.messages
        .filter(m => m.role !== 'system')
        .slice(-6)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    const lastUserMsg = recentMessages.filter(m => m.role === 'user').pop();
    const lastCharMsg = recentMessages.filter(m => m.role === 'assistant').pop();

    // 序章阶段（无用户消息）：使用降级选项生成器，基于开场场景生成引导选项
    if (!lastUserMsg) {
        rpLog('INFO', 'REPLY-OPTS', '序章阶段，使用降级选项生成器');
        const opts = App.getDefaultReplyOptions(activeChar, { content: charResponse || '' }, { content: '' });
        App.renderReplyOptions(opts, state.messages[state.messages.length - 1]?.id || 'prologue');
        return opts;
    }

    // 构建系统提示，要求 LLM 生成推动剧情的回复选项
    const systemPrompt = `你是回复选项生成器，不是角色扮演角色。你的唯一任务是为用户生成3-4条可选回复按钮文案。

【绝对禁止】
- 不要输出任何角色对话、动作描写、内心独白
- 不要用括号 ()、花括号 {}、方括号 [] 包裹内容
- 不要写 "(瞥了一眼)" "(转身牵起他的手)" 这类格式
- 不要输出解释性文字、前言后语

【必须做的事】
- 生成 3-4 条简短回复选项（每条 ≤20 字）
- 选项之间用 | 分隔
- 只输出选项文本，不要输出任何其他内容

【选项类型要求】
1. 探索型：追问细节、原因或背后故事
2. 行动型：提出下一步行动或计划
3. 冲突/转折型：引入新信息、质疑或矛盾
4. （可选）沉默/观望型：选择不说话或等待

【示例输出】
深入了解这个秘密|主动提出帮忙|质问对方真相|暂时保持沉默

【当前上下文】
活跃角色：${activeChar.name}，${activeChar.gender || '未知'}，${activeChar.age || '未知'}岁
性格：${activeChar.personality || '温柔'}
背景：${activeChar.background || '无'}
与用户关系：${activeChar.relationship || '普通认识'}`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...recentMessages
    ];

    try {
        rpLog('INFO', 'REPLY-OPTS', '调用 LLM 生成选项...');
        rpLog('INFO', 'REPLY-OPTS', `发送 ${messages.length} 条消息给 LLM (system prompt 长度: ${systemPrompt.length})`);
        const raw = await App.agnesChat(messages);
        rpLog('INFO', 'REPLY-OPTS', `LLM 原始返回 (长度=${raw?.length || 0}): "${raw?.substring(0, 200)}..."`);

        // 纯分隔符解析，不做 JSON 回退
        const items = parseDelimited(raw);
        rpLog('INFO', 'REPLY-OPTS', `parseDelimited 结果: ${JSON.stringify(items)}`);
        if (items && Array.isArray(items) && items.length >= 3) {
            rpLog('INFO', 'REPLY-OPTS', `选项结果: ${JSON.stringify(items)}`);
            return items.slice(0, 4); // 最多 4 条
        }

        // LLM 可能输出了少量选项（2条），也尝试提取
        if (items && Array.isArray(items) && items.length >= 2) {
            rpLog('WARN', 'REPLY-OPTS', `选项不足 ${items.length} 条，但已足够使用`);
            return items.slice(0, 4);
        }

        // 尝试从原始文本中提取 | 分隔的项
        const pipeItems = raw.split('|').map(s => s.trim()).filter(s => s.length > 0);
        if (pipeItems.length >= 3) {
            rpLog('WARN', 'REPLY-OPTS', `parseDelimited 失败，但直接 | 分割找到 ${pipeItems.length} 项`);
            return pipeItems.slice(0, 4);
        }

        rpLog('WARN', 'REPLY-OPTS', '分隔符解析失败或选项不足，LLM 未按要求格式输出');
        rpLog('WARN', 'REPLY-OPTS', `LLM 原始返回: ${raw}`);
        throw new Error(`快捷回复解析失败: LLM 未按要求 | 分隔符格式输出`);
    } catch (e) {
        rpLog('ERROR', 'REPLY-OPTS', `LLM 调用或解析失败: ${e.message}`);
        throw e;
    }

    // 解析失败直接抛错，不走降级
    throw new Error('generateReplyOptions 执行完毕但未返回结果');
};

App.getDefaultReplyOptions = function(activeChar, charMsg, userMsg) {
    const name = activeChar?.name || '对方';
    const charContent = charMsg?.content || '';

    // 序章场景（以【开头、以】结尾的纯场景描述）：生成场景引导选项
    const isPrologue = /^【.+】$/.test(charContent.trim());
    if (isPrologue) {
        const sceneText = charContent.replace(/【|】/g, '').trim();
        
        // 从场景描述中提取抉择点（「你面临选择：」后面的内容）
        const choiceMatch = sceneText.match(/你面临选择[::：]\s*(.+?)(?:\s*[或\/|]\s*)(.+)$/);
        const opts = [];
        
        if (choiceMatch) {
            // 直接使用抉择点中的选项
            opts.push(choiceMatch[1].trim());
            opts.push(choiceMatch[2].trim());
        } else {
            // 从场景描述中提取关键名词
            const nouns = sceneText.match(/[^，。！？、；：\s]{2,6}/g) || [];
            const keyNouns = nouns.filter(n => n.length >= 2 && n.length <= 6).slice(0, 4);
            
            if (keyNouns.length > 0) {
                opts.push('仔细打量周围的' + keyNouns[0] + '...');
                opts.push('试着向' + name + '询问这里的情况');
            } else {
                opts.push('环顾四周，观察环境');
                opts.push('向' + name + '打招呼');
            }
        }
        
        // 补充通用选项
        opts.push('询问接下来该做什么');
        opts.push('保持沉默，等待对方开口');
        rpLog('INFO', 'REPLY-OPTS', `序章降级选项: ${JSON.stringify(opts)}`);
        return opts;
    }

    // 从角色回复中提取关键信息来生成有针对性的选项
    const sceneMatch = charContent.match(/\{([^}]+)\}/);
    const actionMatch = charContent.match(/\(([^)]+)\)/);
    const speakMatch = charContent.match(/\(([^)]+)\)\s*([^\[]+)/);

    // 提取对话内容（去掉场景和动作标记）
    let dialogue = charContent
        .replace(/\{[^}]+\}/g, '')
        .replace(/\([^)]+\)/g, '')
        .replace(/\[[^\]]+\]/g, '')
        .trim();

    // 从对话中提取关键名词/动词
    const keywords = dialogue.match(/[^\s，。！？、；：]{2,4}/g) || [];
    const keyNouns = keywords.filter(k => k.length >= 2 && k.length <= 4).slice(0, 3);
    const keyVerb = keywords.find(k => ['看', '走', '去', '做', '问', '查', '找', '跟', '追', '阻止', '调查', '离开', '靠近'].some(v => k.includes(v))) || '';

    // 基于提取的信息生成有针对性的选项
    const opts = [];

    if (keyNouns.length > 0) {
        opts.push(`关于"${keyNouns[0]}"还有什么详情？`);
    } else {
        opts.push(`这背后还有什么故事？`);
    }

    if (keyVerb) {
        opts.push(`那我们现在就去${keyVerb}！`);
    } else {
        opts.push(`接下来我们该怎么做？`);
    }

    if (dialogue.length > 10) {
        // 从对话末尾提取最后几个中文字符作为质疑点
        const tail = dialogue.slice(-30);
        const segments = tail.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) || [];
        if (segments.length > 0) {
            const lastSeg = segments[segments.length - 1];
            const phrase = lastSeg.slice(-4);
            opts.push(`等等，你说的"${phrase}"是什么意思？`);
        } else {
            opts.push(`等等，你有在隐瞒什么吧？`);
        }
    } else {
        opts.push(`等等，你有在隐瞒什么吧？`);
    }

    rpLog('INFO', 'REPLY-OPTS', `降级选项（基于上下文）: ${JSON.stringify(opts)}`);
    return opts;
};

App.renderReplyOptions = function(options, msgId) {
    rpLog('INFO', 'REPLY-OPTS', `渲染 ${options?.length || 0} 个选项`);
    const container = document.getElementById('reply-options');
    if (!container || !options || options.length < 2) {
        rpLog('WARN', 'REPLY-OPTS', `跳过渲染: container=${!!container}, optionsLen=${options?.length}`);
        return;
    }

    container.innerHTML = '';
    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'reply-option-btn';
        btn.textContent = opt;
        btn.onclick = () => App.sendReplyOption(opt, btn);
        container.appendChild(btn);
    });

    // 持久化：保存到 state 和 IndexedDB
    state.lastReplyOptions = { options: options, msgId: msgId };
    saveState().catch(() => {});
    rpLog('INFO', 'REPLY-OPTS', `选项已持久化`);
};

App.sendReplyOption = async function(text, btnElement) {
    // 禁用所有按钮，防止重复点击
    const container = document.getElementById('reply-options');
    if (container) {
        container.querySelectorAll('.reply-option-btn').forEach(b => {
            b.disabled = true;
            b.style.opacity = '0.5';
        });
    }

    // 清空选项区域
    if (container) container.innerHTML = '';

    // 填充输入框并发送
    const input = document.getElementById('chat-input');
    if (input) input.value = text;

    await App.sendMessage();
};
