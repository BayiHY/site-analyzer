// === Section: 消息发送主流程 ===
// 构建对话历史 → 调用 LLM → 渲染回复 → 触发后处理
// 新格式: {场景}角色1:(动作)语言[内心想法]|角色2:(动作)语言[内心想法]<主角回应1|主角回应2|主角回应3>

App.sendMessage = async function() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    const activeChar = state.characters[state.activeCharIndex];

    // 用户消息
    state.messages.push({
        id: 'msg_' + Date.now(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: new Date().toISOString()
    });
    renderMessage(state.messages[state.messages.length - 1]);
    await saveMessages();

    // 显示加载
    document.getElementById('send-btn').disabled = true;
    showTyping();

    try {
        // ===== 构建对话历史（保留有意义的对话，过滤 UI 噪声）=====
        // 过滤规则：
        // - 保留 user 消息和 char 消息（对话内容）
        // - 过滤纯 UI 消息（如"正在生成..."、"✅ 角色生成完成！"）
        // - 过滤 scene 类型消息（场景图）和 img 类型消息（头像图）
        const HISTORY_LIMIT = 20;
        const uiNoisePatterns = [
            /^正在/, /^✅/, /^⚠️/, /^❌/, /^🎨/, /^🔄/, /^📝/, /^🔍/, /^👥/, /^📊/, /^🏗️/
        ];
        const isUINoise = (text) => {
            if (!text || typeof text !== 'string') return false;
            return uiNoisePatterns.some(p => p.test(text.trim()));
        };

        const history = state.messages
            .filter(m => {
                // 保留 user 和 char 类型的消息
                if (m.role === 'user' || m.role === 'char') return true;
                // 过滤 UI 噪声
                if (m.type === 'system' && isUINoise(m.content)) return false;
                // 保留非噪声的 system 消息（如开场白）
                if (m.type === 'system') return true;
                return false;
            })
            .slice(-HISTORY_LIMIT)
            .map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content || ''
            }));

        // ===== 构建全局上下文 =====
        // 1) 世界观概要（精简版，≤200字）
        const worldviewBrief = (state.story?.worldview || '').slice(0, 200);
        
        // 2) 主线弧光当前阶段
        const mainArcBrief = state.story?.mainArc?.length > 0
            ? state.story.mainArc.slice(0, 3).map(a => `・${a.phase}：${a.description}`).join('\n')
            : '';
        
        // 3) 氛围基调
        const toneKeywords = (state.story?.toneKeywords || []).join('、');
        
        // 4) 所有角色列表
        const allChars = state.characters || [];
        
        // 5) 角色间关系提示（从 background 中提取与其他角色的关系名）
        const relationshipHints = allChars.flatMap((c, i) => {
            if (!c.background) return [];
            const otherNames = allChars
                .filter((_, j) => j !== i)
                .map(o => o.name);
            const mentions = otherNames.filter(n => c.background.includes(n));
            return mentions.map(m => `  ${c.name} ↔ ${m}（背景中提及）`);
        });
        const relationshipSection = relationshipHints.length > 0
            ? '\n【角色关系网】\n' + relationshipHints.join('\n')
            : '';
        
        // 6) 动态属性
        const perception = activeChar.perception ? `玩家印象：${activeChar.perception}` : '';
        const secret = activeChar.secret ? `秘密线索：${activeChar.secret}` : '';
        const currentMood = activeChar.currentMood ? `当前心情：${activeChar.currentMood}` : '';
        const dynamicAttrs = [perception, secret, currentMood].filter(Boolean).join('；') || '暂无';
        
        // 7) 披露状态
        const revealed = state.revealed[activeChar.name] || {};
        const revealedStatus = Object.entries(revealed)
            .filter(([k, v]) => typeof v === 'boolean' && k !== '_lastNew')
            .map(([k, v]) => `${k}: ${v ? '已发现' : '未发现'}`)
            .join('、');
        
        const systemPrompt = `你是${activeChar.name}，${activeChar.gender ? activeChar.gender + '性' : ''}${activeChar.age ? '，' + activeChar.age + '岁' : ''}。
请使用中文回复。

=== 世界设定 ===
【世界观概要】${worldviewBrief || '未设定'}
${mainArcBrief ? '【主线弧光】\n' + mainArcBrief : ''}
【氛围基调】${toneKeywords || '未设定'}
【画面风格】${state.story?.imageStyle || 'anime'}。场景描写、环境氛围、角色动作都要符合这一视觉风格。

=== 当前角色档案 ===
姓名：${activeChar.name}
性别：${activeChar.gender || '未指定'}
年龄：${activeChar.age || '未知'}
外貌：${activeChar.appearance || '未指定'}
性格：${activeChar.personality || '温柔'}
背景：${activeChar.background || ''}
与用户关系：${activeChar.relationship || '普通认识'}
核心动机：${activeChar.motivation || ''}
隐藏秘密：${activeChar.secret || '暂未发现'}
说话风格：${activeChar.speechStyle || ''}
${dynamicAttrs !== '暂无' ? '【动态属性】' + dynamicAttrs : ''}
${revealedStatus ? '【信息披露】' + revealedStatus : ''}

=== 场景中其他角色 ===${allChars.filter((_, i) => i !== state.activeCharIndex).map(c => `
- ${c.name}（${c.gender}，${c.age}岁）— ${c.appearance ? '外貌：' + c.appearance.slice(0, 30) : ''}${c.relationship ? '，与主角：' + c.relationship : ''}`).join('')}${relationshipSection ? '【角色关系网】\n' + relationshipSection : ''}

=== 情感指标（隐性，不向玩家展示） ===
${Object.entries(state.emotions[activeChar.name] || {}).map(([k, v]) => {
    const val = v.current ?? 50;
    return `${k}：${val}/100（${val >= 60 ? '非常积极' : val >= 30 ? '中性偏积极' : '冷淡/警惕'}）`;
}).join('，') || '无数据'}
- 好感度高时表现热情主动，低时表现疏离或试探

=== 回复格式要求 ===
请严格按以下格式回复（每个符号都不能省略）：

{场景描述}角色1:(动作)对话内容[内心想法]|角色2:(动作)对话内容[内心想法]<建议回复1|建议回复2|建议回复3>

格式说明：
1. {场景} — 花括号内的当前环境/场景描写（1-2句话），单独解析为一条消息
2. 角色对话 — 多个角色用 | 分隔，每个角色格式为：角色名:(动作)对话内容[内心想法]
   - 如果只有一个角色参与对话，可以省略角色名前缀，直接写 (动作)对话内容[内心想法]
   - 多个角色同时交流互动时，各自分别解析为独立的消息
3. (动作) — 圆括号内的角色动作描写
4. 对话内容 — 角色的说话内容（直接写，不用引号）
5. [内心想法] — 方括号内的内心独白，渲染为"内心想法"文字按钮，点击后才显示内容
6. <建议回复1|建议回复2|建议回复3> — 尖括号内**必须**用英文竖线 | 分隔3条建议回复。**严禁**使用顿号（、）、逗号（，）、>。< 或其他任何符号作为分隔符。每条都是主角（玩家）可以对当前情境做出的**语言回应或动作表现**（如「你是谁？」、「后退一步，保持警惕」、「默默观察他的表情」），而不是决策选项（如「选择逃跑」或「决定调查」）。每条不超过20字。

【建议回复分隔符强制规则】尖括号 <> 内的建议回复分隔符只能是英文竖线 |。正确示例：<「你是谁？」|「后退一步」|「默默观察」>。错误示例：<「你是谁？」、 「后退一步」> 或 <「你是谁？」>。<「后退一步」>。如果你不确定，就用 | 分隔。

示例：
{昏暗的地下室里}林悦:(微笑着递过一杯茶)你终于来了，我等你很久了[其实我早就知道你会来]|张浩:(靠在墙边抱臂沉默)(眼神复杂地打量着你)<「你是谁？」|「后退一步，保持警惕」|「默默观察他的表情」>

注意：
- 如果场景发生变化，{场景} 要体现新场景
- 对话内容要符合角色性格、背景和当前情境
- 多个角色同时互动时，用 | 分隔各角色对话段
- 角色之间的互动要考虑他们的关系网（如亲友、敌对、师徒等）
- 建议回复是主角的语言或动作表现，推动剧情发展，每条不超过15字`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history
        ];

        const response = await App.agnesChat(messages);

        hideTyping();

        // 解析新格式，可能产生多条消息（多角色对话时）
        const parsedMessages = App.parseMultiCharReply(response, state.activeCharIndex);

        for (const msg of parsedMessages) {
            state.messages.push(msg);
            renderMessage(msg);
        }
        await saveMessages();

        // 角色消息渲染完成，立即解锁发送按钮
        document.getElementById('send-btn').disabled = false;

        // ===== 后处理：4 项并行执行，后台运行不阻塞用户操作 =====
        Promise.allSettled([
            // 后处理 1: 场景图生成 → 见 scene-images.js
            (async () => {
                try {
                    const sceneDesc = App.parseSceneFromReply(response);
                    if (sceneDesc && App.isSceneChanged(activeChar.name, sceneDesc)) {
                        await App.generateSceneImage(activeChar.name, sceneDesc, activeChar);
                    }
                } catch (e) {
                    console.warn('场景图生成失败:', e);
                }
            })(),
            // 后处理 2: 情感指标更新 → 见 emotion-update.js
            (async () => {
                try {
                    await App.updateEmotions(activeChar.name, text, response);
                } catch (e) {
                    console.warn('情感更新失败:', e);
                }
            })(),
            // 后处理 3: 信息披露评估 → 见 progressive-disclosure.js
            (async () => {
                try {
                    await App.updateRevealedInfo(activeChar.name, text, response);
                    if (state.currentPanel === 'characters') {
                        document.getElementById('panel-body').innerHTML = renderCharactersPanel();
                    }
                } catch (e) {
                    console.warn('信息披露评估失败:', e);
                }
            })(),
            // 后处理 4: 动态属性更新 → 见 dynamic-attrs.js
            (async () => {
                try {
                    await App.updateDynamicAttributes(activeChar.name, text, response);
                } catch (e) {
                    console.warn('动态属性更新失败:', e);
                }
            })()
        ]);

    } catch (err) {
        hideTyping();
        addSystemMessage(`回复失败: ${err.message || '未知错误'}`);
        document.getElementById('send-btn').disabled = false;
    }
}

// === 解析新格式的多角色回复 ===
// 格式: {场景}角色1:(动作)语言[内心想法]|角色2:(动作)语言[内心想法]<建议回复1|建议回复2|建议回复3>
App.parseMultiCharReply = function(rawText, defaultCharIndex) {
    const messages = [];
    let text = rawText.trim();

    // 提取场景（如果有）
    let sceneText = null;
    const sceneMatch = text.match(/^\{([^}]+)\}/);
    if (sceneMatch) {
        sceneText = sceneMatch[1].trim();
        text = text.slice(sceneMatch[0].length);
    }

    // 提取建议回复（最右边的 <...>）
    // 使用非贪婪匹配，避免 LLM 回复中包含 < 符号时匹配到错误位置
    let suggestedReplies = [];
    const replyMatch = text.match(/<(.*?)>$/);
    if (replyMatch) {
        rpLog('INFO', 'PARSE-REPLY', `原始文本含 <> 标签: "${replyMatch[0]}"`);
        rpLog('INFO', 'PARSE-REPLY', `尖括号内内容: "${replyMatch[1]}"`);
        // 优先用 | 分隔；如果数量不足 3 条，尝试兜底分隔符
        suggestedReplies = replyMatch[1].split('|').map(s => {
            let t = s.trim();
            // 清理首尾多余的引号/引号+尖括号残留
            t = t.replace(/^["「」]/, '').replace(/["」]$/, '');
            return t;
        }).filter(Boolean);
        if (suggestedReplies.length < 2) {
            // 兜底：尝试 >。< 分隔符（LLM 常误用）
            const fallback1 = replyMatch[1].split('>。<').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
            if (fallback1.length >= 2) {
                suggestedReplies = fallback1;
                rpLog('INFO', 'PARSE-REPLY', `| 分隔失败，使用 >。< 兜底解析出 ${suggestedReplies.length} 条`);
            } else {
                // 兜底：尝试顿号分隔
                const fallback2 = replyMatch[1].split('、').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
                if (fallback2.length >= 2) {
                    suggestedReplies = fallback2;
                    rpLog('INFO', 'PARSE-REPLY', `| 分隔失败，使用顿号兜底解析出 ${suggestedReplies.length} 条`);
                } else {
                    rpLog('WARN', 'PARSE-REPLY', `仅解析出 ${suggestedReplies.length} 条，无法兜底分割`);
                }
            }
        }
        rpLog('INFO', 'PARSE-REPLY', `解析出 ${suggestedReplies.length} 条建议回复: ${JSON.stringify(suggestedReplies)}`);
        text = text.slice(0, text.length - replyMatch[0].length).trim();
    } else {
        rpLog('INFO', 'PARSE-REPLY', '原始文本中未发现 <> 标签，无建议回复');
    }

    // 提取场景消息
    if (sceneText) {
        messages.push({
            id: 'msg_scene_' + Date.now(),
            role: 'char',
            type: 'text',
            content: sceneText,
            charIndex: defaultCharIndex,
            isScene: true,
            timestamp: new Date().toISOString()
        });
    }

    // 按 | 分割多角色对话
    // 但要注意：建议回复已经被提取了，剩余的 | 是角色分隔符
    let charParts = text.split('|').filter(s => s.trim());

    // 如果 | 分割后只有 1 段，尝试用 "名字:" 模式拆分多角色（LLM 有时不用 | 分隔角色）
    if (charParts.length === 1) {
        const singleText = charParts[0].trim();
        // 匹配模式：汉字/字母 + 可选空格/换行 + 冒号(:或：)，后面跟着角色内容
        // 同时支持换行和空格分隔的角色名
        const nameColonPattern = /(?:^|\n|\s+)([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_•·]{0,10})([:：])\s*/g;
        let nameMatches = [];
        let m;
        while ((m = nameColonPattern.exec(singleText)) !== null) {
            // 确保冒号前面不是 (动作 开头的标记
            const beforeColon = singleText.substring(Math.max(0, m.index - 5), m.index);
            if (!beforeColon.includes('(')) {
                // 记录冒号结束位置（用于截取第一个角色前的内容）
                const colonEnd = m.index + m[0].length;
                // 记录实际角色名开始位置（去掉前导空白）
                const nameStart = m.index + (m[0].length - m[1].length - m[2].length);
                nameMatches.push({ index: nameStart, name: m[1].trim(), colonEnd: colonEnd });
            }
        }

        // 如果找到至少 1 个 "名字:" 匹配（加上开头那段 = 至少 2 个角色），用这种模式拆分
        if (nameMatches.length >= 1) {
            const splitParts = [];
            let prevEnd = 0;
            // 检查开头是否有 "名字:" 前缀（第一个角色可能在开头）
            const firstPrefix = singleText.match(/^([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_•·]{0,10})([:：])\s*/);
            let startOffset = 0;
            if (firstPrefix && nameMatches.length >= 2) {
                // 开头有名字:，第一个角色从冒号后开始
                startOffset = firstPrefix[0].length;
                // 把第一个角色名加入匹配列表头部
                nameMatches.unshift({ index: 0, name: firstPrefix[1].trim(), colonEnd: startOffset });
            }
            for (let i = 0; i < nameMatches.length; i++) {
                const nm = nameMatches[i];
                if (nm.index >= startOffset) {
                    splitParts.push(singleText.substring(prevEnd, nm.index).trim());
                    prevEnd = nm.colonEnd;
                }
            }
            splitParts.push(singleText.substring(prevEnd).trim());
            charParts = splitParts.filter(s => s);
            rpLog('INFO', 'PARSE-CHAR', `| 分割只有1段，使用 "名字:" 模式拆分为 ${charParts.length} 段`);
        }
    }

    for (const part of charParts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // 解析单个角色消息格式: 角色名:(动作)语言[内心想法]
        // 或者: (动作)语言[内心想法]（无角色名，沿用当前角色）
        let charName = null;
        let content = trimmed;

        // 检查是否有 "角色名:" 前缀
        const prefixMatch = trimmed.match(/^([^:：]+)[:：]\s*(.+)/);
        if (prefixMatch) {
            charName = prefixMatch[1].trim();
            content = prefixMatch[2].trim();
        }

        // 解析 (动作)语言[内心想法] — 支持交错出现的多个 (动作) 和 [想法]
        // 使用迭代扫描，与 formatInteraction 保持一致
        let action = '';
        let thought = '';
        let remaining = content;

        // 第一步：如果文本以 (动作) 开头，提取第一个动作
        const firstActionMatch = remaining.match(/^\(([^)]+)\)(.*)/s);
        if (firstActionMatch) {
            action = '(' + firstActionMatch[1].trim() + ')';
            remaining = firstActionMatch[2].trimStart();
        }

        // 第二步：在剩余文本中迭代扫描 (动作) 和 [想法]
        // 收集所有动作和内心想法，其余作为对话
        let dialogueParts = [];
        let scanPos = 0;
        let scanRemaining = remaining;

        while (scanPos < scanRemaining.length) {
            let bestMatch = null;
            let bestPos = scanRemaining.length;

            // 查找下一个 (动作)
            const openParen = scanRemaining.indexOf('(', scanPos);
            if (openParen !== -1 && openParen < bestPos) {
                const closeParen = scanRemaining.indexOf(')', openParen + 1);
                if (closeParen !== -1) {
                    bestMatch = { pos: openParen, end: closeParen + 1, type: 'action' };
                    bestPos = openParen;
                }
            }

            // 查找下一个 [想法]
            const openBracket = scanRemaining.indexOf('[', scanPos);
            if (openBracket !== -1 && openBracket < bestPos) {
                const closeBracket = scanRemaining.indexOf(']', openBracket + 1);
                if (closeBracket !== -1) {
                    bestMatch = { pos: openBracket, end: closeBracket + 1, type: 'thought' };
                    bestPos = openBracket;
                }
            }

            if (!bestMatch) {
                // 没有更多标记，剩余全部是对话
                dialogueParts.push(scanRemaining.slice(scanPos));
                break;
            }

            // 收集标记前的纯文本作为对话
            if (bestMatch.pos > scanPos) {
                const segment = scanRemaining.slice(scanPos, bestMatch.pos).trim();
                if (segment) dialogueParts.push(segment);
            }

            // 根据标记类型分类
            if (bestMatch.type === 'action') {
                const actionContent = scanRemaining.slice(bestMatch.pos + 1, bestMatch.end - 1).trim();
                if (actionContent) {
                    // 追加到已有动作（用空格分隔）
                    action += ' ' + '(' + actionContent + ')';
                }
            } else if (bestMatch.type === 'thought') {
                const thoughtContent = scanRemaining.slice(bestMatch.pos + 1, bestMatch.end - 1).trim();
                if (thoughtContent) {
                    // 追加到已有想法（用空格分隔）
                    thought += (thought ? ' ' : '') + thoughtContent;
                }
            }

            scanPos = bestMatch.end;
        }

        // 合并对话部分
        const dialogue = dialogueParts.join(' ').trim();

        // 构建格式化内容字符串
        let formattedContent = '';
        if (action) formattedContent += action;
        if (dialogue) formattedContent += dialogue;
        if (thought) formattedContent += '[' + thought + ']';
        if (!formattedContent) formattedContent = content;

        // 查找对应的角色索引
        let charIdx = defaultCharIndex;
        if (charName) {
            const found = state.characters.findIndex(c => c.name === charName);
            if (found >= 0) charIdx = found;
        }

        messages.push({
            id: 'msg_char_' + Date.now() + '_' + charIdx,
            role: 'char',
            type: 'multi_char',
            content: formattedContent,
            charIndex: charIdx,
            charName: charName || state.characters[charIdx]?.name || '',
            action: action,
            dialogue: dialogue,
            thought: thought,
            suggestedReplies: suggestedReplies,
            timestamp: new Date().toISOString()
        });
        rpLog('INFO', 'PARSE-CHAR', `角色消息 #${messages.length} (charIdx=${charIdx}): 建议回复=${JSON.stringify(suggestedReplies)}, 动作="${action}", 对话="${dialogue}", 想法="${thought}"`);
    }

    // 如果没有解析出任何角色消息，fallback 为单条普通消息
    if (messages.length === 0) {
        messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: text,
            charIndex: defaultCharIndex,
            timestamp: new Date().toISOString()
        });
    }

    return messages;
};
