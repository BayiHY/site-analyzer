// === Section: 两阶段流程编排 ===
// 初始化故事（世界观→角色→头像+场景图并行→开场）

App.initializeStory = async function(userInspiration, playerGender) {
    rpLog('info', 'INIT', `开始两阶段故事生成流程，玩家性别: ${playerGender || state.player?.gender}`);

    addSystemMessage('正在构思故事世界...');
    try {
        await App.generateWorldview(userInspiration);
        addSystemMessage('✅ 世界观已生成！现在可以生成角色了。');
        rpLog('info', 'INIT', '第一阶段完成');
    } catch (err) {
        const errMsg = (err.message || String(err));
        rpLog('error', 'INIT', '世界观生成失败: ' + errMsg);
        // 如果是因为超时（abort），降级到 agnes-1.5-flash + 温度 0.6 重试
        if (errMsg.includes('abort') || errMsg.includes('Abort') || errMsg.includes('Failed to fetch')) {
            rpLog('warn', 'INIT', '检测到超时/中断，降级到 agnes-1.5-flash + 温度 0.6 重试...');
            addSystemMessage('⏱️ 生成超时，正在使用备用模型重试...');
            try {
                await App.generateWorldview(userInspiration, { model: 'agnes-1.5-flash', temperature: 0.6 });
                addSystemMessage('✅ 世界观已通过备用模型生成！');
                rpLog('info', 'INIT', '第一阶段降级重试成功');
            } catch (err2) {
                rpLog('error', 'INIT', '降级重试也失败: ' + (err2.message || String(err2)));
                throw err2;
            }
        } else {
            throw err;
        }
    }

    addSystemMessage('正在生成角色...');
    try {
        // 从用户灵感中解析角色数量要求（如"四名女角色"）
        let charCount = 3;
        let charGenderHint = '';
        if (userInspiration) {
            rpLog('info', 'INIT', `用户灵感: ${userInspiration}`);
            // 支持中文数字和阿拉伯数字：四/4 名/位/个 女/男 ... 角色/女生
            const chineseNum = '[一二三四五六七八九十百千万两]+';
            const arabicNum = '\\d+';
            const numPattern = new RegExp(`(${chineseNum}|${arabicNum})\\s*[名位个]?[男女][^|]*?[角色女生]`);
            const numMatch = userInspiration.match(numPattern);
            if (numMatch) {
                let parsed = parseInt(numMatch[1]);
                if (isNaN(parsed)) {
                    // 中文数字转阿拉伯数字
                    const cnMap = {一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,百:100,千:1000,万:10000};
                    parsed = 0;
                    for (const ch of numMatch[1]) {
                        parsed += cnMap[ch] || 0;
                    }
                }
                charCount = parsed;
                rpLog('info', 'INIT', `从用户灵感解析角色数量: ${charCount}`);
            }
            // 提取性别倾向
            if (/女[^|]*?后宫|多名女|女生|后宫/.test(userInspiration)) {
                charGenderHint = '优先女性角色';
            } else if (/男[^|]*?后宫|多名男|男生/.test(userInspiration)) {
                charGenderHint = '优先男性角色';
            }
        }
        const chars = await App.generateCharacters(charCount, playerGender, userInspiration, charGenderHint);
        addSystemMessage(`✅ 角色生成完成！共 ${chars.length} 个角色。`);
        rpLog('info', 'INIT', '第二阶段完成');
    } catch (err) {
        rpLog('error', 'INIT', '角色生成失败: ' + (err.message || String(err)));
        throw err;
    }

    // 角色生成完成后，并行生成头像
    if (state.apiKeys.image) {
        rpLog('info', 'IMG', `━━━ 开始生图阶段: ${state.characters.length} 个角色 + 主角 ━━━`);
        rpLog('info', 'IMG', `  生图 API Key 已配置`);
        rpLog('info', 'IMG', `  角色列表: ${state.characters.map(c => `${c.name}(faceImgUrl=${!!c.faceImageUrl}, portraitImgUrl=${!!c.portraitImageUrl})`).join(', ')}`);
        addSystemMessage('🎨 正在生成角色头像...');

        try {
            // 角色头像生成任务
            const imgTasks = state.characters.map(async (char, i) => {
                if (!char || !char.name) { rpLog('warn', 'IMG', '角色 #' + i + ' 无效，跳过'); return null; }
                rpLog('info', 'IMG', '生成 ' + char.name + ' 的头像 (modules: ' + Object.keys(char.__modules__ || {}).length + ')');
                const result = await App.generateCharacterFaceSilent(char);
                return result;
            });

            // 主角头像生成任务
            const playerAvatarTask = App.generatePlayerAvatar().then(url => {
                rpLog('info', 'IMG', '主角头像生成完成');
                return url;
            }).catch(err => {
                rpLog('warn', 'IMG', '主角头像生成失败: ' + err.message);
                return null;
            });

            // 等待所有角色头像完成
            await Promise.all(imgTasks);
            const playerOk = await playerAvatarTask;
            addSystemMessage(`✅ 角色头像生成完成 (${state.characters.length}/${state.characters.length} 角色 + ${playerOk ? '1' : '0'} 主角)`);
            rpLog('info', 'IMG', `角色头像生成完成: ${state.characters.length}/${state.characters.length} 角色, 主角:${playerOk}`);

            // 角色头像全部完成后，再生成初始场景图
            if (state.story.openingScene) {
                rpLog('info', 'SCENE', '角色头像全部完成，开始生成初始场景图');
                addSystemMessage('🖼️ 正在生成场景图...');
                await App.generateInitialSceneImage(state.story.openingScene, state.story.openingScene);
                rpLog('info', 'SCENE', '初始场景图生成完成');
            }
        } catch (imgErr) {
            rpLog('error', 'IMG', '头像/场景图生成失败: ' + imgErr.message);
            addSystemMessage(`⚠️ 头像/场景图生成失败: ${imgErr.message}`);
        }
    }

    // ===== 角色名一致性修复：将 openingScene 中的旧角色名替换为实际生成的角色名 =====
    // 根因：世界观生成时 LLM 自由决定角色名（如"夜鸢""烬"），角色生成时 LLM 又自由决定（如"凛""绯"）
    // 解决：用实际角色名替换 openingScene 中出现的所有旧名
    const oldNamesInOpening = extractNamesFromText(state.story.openingScene || '');
    const actualNames = state.characters.map(c => c.name);
    
    if (oldNamesInOpening.length > 0 && actualNames.length > 0) {
        rpLog('INFO', 'WORLDVIEW-SYNC', `开场场景旧角色名: [${oldNamesInOpening.join(', ')}], 实际角色名: [${actualNames.join(', ')}]`);
        
        // 检查一致性
        const inconsistent = oldNamesInOpening.filter(n => !actualNames.includes(n));
        if (inconsistent.length > 0) {
            rpLog('warn', 'WORLDVIEW-SYNC', `⚠️ 角色名不一致: 开场场景使用了 [${inconsistent.join(', ')}] 但实际角色是 [${actualNames.join(', ')}]`);
            
            // 尝试智能映射：如果名字数量相同，按顺序替换
            if (oldNamesInOpening.length === actualNames.length && oldNamesInOpening.length <= 5) {
                let syncedScene = state.story.openingScene;
                for (let i = 0; i < oldNamesInOpening.length; i++) {
                    const oldName = oldNamesInOpening[i];
                    const newName = actualNames[i % actualNames.length];
                    // 用正则全局替换，避免部分匹配（用单词边界）
                    const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    syncedScene = syncedScene.replace(new RegExp(escapedOld, 'g'), newName);
                }
                state.story.openingScene = syncedScene;
                rpLog('info', 'WORLDVIEW-SYNC', `✅ 开场场景角色名已同步: ${oldNamesInOpening.join(', ')} → ${actualNames.join(', ')}`);
            } else {
                rpLog('warn', 'WORLDVIEW-SYNC', `⚠️ 名字数量不匹配 (${oldNamesInOpening.length} vs ${actualNames.length})，无法自动映射，将在 content-parser.js 中用模糊匹配兜底`);
            }
        } else {
            rpLog('info', 'WORLDVIEW-SYNC', `✅ 角色名一致，无需同步`);
        }
    }
    
    // 解析序章：从 openingScene 中提取 <建议回复> 并渲染为多角色消息格式
    const openingRaw = state.story.openingScene || '';
    rpLog('INFO', 'INIT-REPLY', `开场场景原始文本 (长度=${openingRaw.length}): "${openingRaw.substring(0, 150)}..."`);
    let openingText = openingRaw;
    let openingReplies = [];
    const replyMatch = openingRaw.match(/<(.*?)>$/);
    if (replyMatch) {
        rpLog('INFO', 'INIT-REPLY', `开场 <> 标签内容: "${replyMatch[1]}"`);
        openingText = openingRaw.slice(0, openingRaw.length - replyMatch[0].length).trim();
        openingReplies = replyMatch[1].split('┇').map(s => {
            let t = s.trim();
            t = t.replace(/^["「」]/, '').replace(/["」]$/, '');
            return t;
        }).filter(Boolean);
        // 兜底：如果 ┇ 分隔结果不足，尝试 | 分隔符
        if (openingReplies.length < 2) {
            const fb1 = replyMatch[1].split('|').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
            if (fb1.length >= 2) { openingReplies = fb1; rpLog('INFO', 'INIT-REPLY', `┇ 分隔失败，使用 | 兜底`); }
            else {
                const fb2 = replyMatch[1].split('、').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
                if (fb2.length >= 2) { openingReplies = fb2; rpLog('INFO', 'INIT-REPLY', `| 分隔失败，使用顿号兜底`); }
            }
        }
        rpLog('INFO', 'INIT-REPLY', `解析出 ${openingReplies.length} 条开场建议回复: ${JSON.stringify(openingReplies)}`);
    } else {
        rpLog('WARN', 'INIT-REPLY', '开场场景中未发现 <> 标签，无建议回复');
    }
    
    state.messages.push({
        id: 'msg_' + Date.now(),
        role: 'system',
        type: 'text',
        content: openingText,
        timestamp: new Date().toISOString(),
        suggestedReplies: openingReplies
    });
    renderMessage(state.messages[state.messages.length - 1]);
    saveMessages().catch(() => {});

    rpLog('info', 'INIT', '初始化完成，进入聊天阶段');
    updateGenerationControls();
}

// ===== 辅助函数：从文本中提取可能的角色名 =====
// 策略：匹配 "名字 + 动词/标点" 的模式
function extractNamesFromText(text) {
    if (!text) return [];
    const names = new Set();
    // 匹配 "名字蹲在/名字冷冷/名字看着" 等模式
    const patterns = [
        /([^\s你]{2,4})(?:蹲在|冷冷|看着|说道|问道|回答|站|走|坐|靠|望|说|道|问|笑|皱眉|叹息|轻哼|低语|喃喃|嘟囔|开口|出声|转头|转身|迈步|停下|靠近|后退|伸手|握紧|松开|举起|放下|抱起|推开|拉开|关上|打开|点亮|熄灭|收起|拿出|掏出|翻找|查看|检查|打量|凝视|注视|盯着|瞥了一眼|扫过|环顾|低头|仰头|侧身|正身|弯腰|直起身)/g,
        // 匹配 "名字 + 冒号" 模式（对话前缀）
        /([^\s你]{2,4})(?:[:：]\s*[「"])/g,
    ];
    for (const pattern of patterns) {
        let m;
        while ((m = pattern.exec(text)) !== null) {
            const name = m[1].trim();
            if (name && name.length >= 2 && name.length <= 4 && /[\u4e00-\u9fa5a-zA-Z]/.test(name)) {
                names.add(name);
            }
            pattern.lastIndex = 0;
        }
    }
    return [...names];
}
