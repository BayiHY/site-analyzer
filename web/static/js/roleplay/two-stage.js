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
        rpLog('error', 'INIT', '世界观生成失败: ' + (err.message || String(err)));
        throw err;
    }

    addSystemMessage('正在生成角色...');
    try {
        // 从用户灵感中解析角色数量要求（如"四名女角色"）
        let charCount = 3;
        let charGenderHint = '';
        if (userInspiration) {
            rpLog('info', 'INIT', `用户灵感: ${userInspiration}`);
            // 支持中文数字和阿拉伯数字：四/4 名/位/个 女/男 ... 角色/女生
            const chineseNum = '[一二三四五六七八九十百千万]+';
            const arabicNum = '\\d+';
            const numPattern = new RegExp(`(${chineseNum}|${arabicNum})\\s*[名位个]?[男女][^|]*?[角色女生]`);
            const numMatch = userInspiration.match(numPattern);
            if (numMatch) {
                let parsed = parseInt(numMatch[1]);
                if (isNaN(parsed)) {
                    // 中文数字转阿拉伯数字
                    const cnMap = {一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,百:100,千:1000,万:10000};
                    parsed = 0;
                    for (const ch of numMatch[1]) {
                        parsed += cnMap[ch] || 0;
                    }
                }
                charCount = Math.max(parsed, 3);
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

    // 角色生成完成后，并行生成头像 + 初始场景图
    if (state.apiKeys.image) {
        rpLog('info', 'IMG', `开始并行生成 ${state.characters.length} 个角色头像 + 主角头像 + 初始场景图`);
        addSystemMessage('🎨 正在生成角色头像和场景...');

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

            // 初始场景图生成任务
            const sceneTask = state.story.openingScene
                ? App.generateInitialSceneImage(state.story.openingScene).then(url => {
                    rpLog('info', 'SCENE', '初始场景图生成完成');
                    return url;
                })
                : Promise.resolve(null);

            // 全部并行执行
            const results = await Promise.all([...imgTasks, playerAvatarTask, sceneTask]);
            const charSuccessCount = results.filter((r, i) => r !== null && i < state.characters.length).length;
            const playerAvatarOk = results[state.characters.length] !== null;
            addSystemMessage(`✅ 头像生成完成 (${charSuccessCount}/${state.characters.length} 角色 + ${playerAvatarOk ? '1' : '0'} 主角)，初始场景已设置`);
            rpLog('info', 'IMG', `头像+场景图生成完成: ${charSuccessCount}/${state.characters.length} 角色, 主角:${playerAvatarOk}`);
        } catch (imgErr) {
            rpLog('error', 'IMG', '头像/场景图生成失败: ' + imgErr.message);
            addSystemMessage(`⚠️ 头像/场景图生成失败: ${imgErr.message}`);
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
        openingReplies = replyMatch[1].split('|').map(s => {
            let t = s.trim();
            t = t.replace(/^["「」]/, '').replace(/[\"」]$/, '');
            return t;
        }).filter(Boolean);
        // 兜底：如果 | 分隔结果不足，尝试其他分隔符
        if (openingReplies.length < 2) {
            const fb1 = replyMatch[1].split('>。<').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
            if (fb1.length >= 2) { openingReplies = fb1; rpLog('INFO', 'INIT-REPLY', `| 分隔失败，使用 >。< 兜底`); }
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
        role: 'char',
        type: 'text',
        content: openingText,
        timestamp: new Date().toISOString(),
        charIndex: 0,
        suggestedReplies: openingReplies
    });
    renderMessage(state.messages[state.messages.length - 1]);
    saveMessages().catch(() => {});

    rpLog('info', 'INIT', '初始化完成，进入聊天阶段');
    updateGenerationControls();
}
