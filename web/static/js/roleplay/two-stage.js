// === Section: 两阶段流程编排 ===
// 初始化故事（世界观→角色→序章→按出场顺序逐个生成头像+场景图→开场）

App.initializeStory = async function(userInspiration, playerGender, playerName) {
    if (playerName && state.player) {
        state.player.name = playerName;
    }
    const displayName = state.player?.name || '无名旅者';
    rpLog('info', 'INIT', `开始两阶段故事生成流程，玩家: ${displayName} (${playerGender || state.player?.gender})`);
    let openingRaw = '';
    let openingStructured = null;

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
    let chars = [];
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
        chars = await App.generateCharacters(charCount, playerGender, userInspiration, charGenderHint);
        addSystemMessage(`✅ 角色生成完成！共 ${chars.length} 个角色。`);
        rpLog('info', 'INIT', '第二阶段完成');
    } catch (err) {
        rpLog('error', 'INIT', '角色生成失败: ' + (err.message || String(err)));
        throw err;
    }

    // ===== 角色生成完成后：面部特写后台异步启动，不阻塞序章 =====
    if (state.apiKeys.chat && chars.length > 0) {
        const faceTasks = chars.map(c => (async () => {
            try {
                rpLog('info', 'IMG', `📷 面部特写: ${c.name}`);
                const url = await App.generateCharacterFaceOnly(c);
                if (url) {
                    rpLog('info', 'IMG', `✅ ${c.name} 面部特写完成`);
                    addSystemMessage(`✅ ${c.name} 头像已生成`);
                }
            } catch (e) {
                rpLog('warn', 'IMG', `${c.name} 面部特写失败: ${e.message}`);
            }
        })());
        rpLog('info', 'IMG', `━━━ 面部特写已后台启动 (${chars.length} 个)，不阻塞序章生成 ━━━`);
    }

    // ===== 生成序章 → 渲染序章 → 按出场顺序生成全身/半身（含动作描写）=====
    if (state.apiKeys.chat) {
        try {
            // 第一步：生成序章
            rpLog('info', 'OPENING', '开始生成序章');
            addSystemMessage('✍️ 正在生成序章...');
            
            const openingResult = await App.generateOpeningScene();
            openingRaw = openingResult?.rawText || '';
            openingStructured = openingResult?.structured || null;

            if (openingRaw) {
                rpLog('info', 'OPENING', '序章生成完成，立即渲染序章场景消息');

                // 只渲染场景消息，不渲染角色消息
                let parsedMessages = [];
                if (openingStructured) {
                    parsedMessages = App.structuredToMessages(openingStructured, 'msg_opening_', { skipCharacters: true });
                }
                for (const msg of parsedMessages) {
                    state.messages.push(msg);
                    renderMessage(msg);
                }
                saveMessages().catch(() => {});
                rpLog('info', 'TIMING', '✅ 序章场景消息渲染完成');
            } else {
                rpLog('warn', 'OPENING', '序章生成返回空');
            }

            // 第二步：渲染角色消息 + 异步并行生成全身/半身（含序章动作描写）
            if (openingStructured && openingStructured.characters?.length > 0) {
                const appearingChars = openingStructured.characters;
                rpLog('info', 'OPENING', `序章出场 ${appearingChars.length} 个角色`);

                // 2a. 立即渲染所有角色消息
                for (const charData of appearingChars) {
                    let fullContent = '';
                    if (charData.action) fullContent += `(${charData.action})`;
                    if (charData.dialogue) fullContent += charData.dialogue;
                    if (charData.thought) fullContent += `[${charData.thought}]`;
                    if (!fullContent) fullContent = charData.dialogue || '(无内容)';

                    const charMsgObj = {
                        id: 'msg_opening-' + charData.name,
                        role: 'char',
                        type: 'multi_char',
                        charName: charData.name,
                        charIndex: state.characters.findIndex(c => c.name === charData.name),
                        content: fullContent,
                        action: charData.action || '',
                        dialogue: charData.dialogue || '',
                        thought: charData.thought || ''
                    };
                    state.messages.push(charMsgObj);
                    renderMessage(charMsgObj);
                    rpLog('info', 'OPENING', `${charData.name} 角色消息已渲染`);
                }
                saveMessages().catch(() => {});
                rpLog('info', 'TIMING', '✅ 所有角色消息已渲染');

                // 2b. 异步并行生成主角头像 + 出场角色的全身/半身（含动作描写）
                const avatarTasks = [];

                // 主角头像
                rpLog('info', 'IMG', '后台生成主角头像');
                const playerAvatarTask = (async () => {
                    try {
                        const playerUrl = await App.generatePlayerAvatar();
                        rpLog('info', 'IMG', `主角头像生成完成: ${playerUrl ? 'yes' : 'no'}`);
                        App.updateAvatarInExistingMessages(state.player?.name || '玩家', playerUrl);
                    } catch (e) {
                        rpLog('warn', 'IMG', `主角头像生成失败: ${e.message}`);
                    }
                })();
                avatarTasks.push(playerAvatarTask);

                // 每个出场角色的全身/半身 — 用序章动作描写注入 prompt
                for (const charInfo of appearingChars) {
                    const charName = charInfo.name;
                    const charObj = state.characters.find(c => c.name === charName);
                    if (!charObj) continue;

                    // 提取动作描写（用于全身/半身 prompt 的 pose）
                    const actionText = charInfo.action ? charInfo.action.replace(/[（(].*?[）)]/g, '').trim() : '';
                    rpLog('info', 'IMG', `后台生成 ${charName} 全身/半身（动作: ${actionText || '默认站立'}）`);
                    avatarTasks.push((async () => {
                        try {
                            addSystemMessage(`🎨 正在生成 ${charName} 的角色形象...`);
                            // skipFace=true: 面部特写已生成，直接做全身/半身
                            const result = await App.generateCharacterImage(charObj, actionText, true);
                            if (result) {
                                rpLog('info', 'IMG', `${charName} 全身/半身生成成功`);
                                addSystemMessage(`✅ ${charName} 角色形象生成完成`);
                                App.updateAvatarInExistingMessages(charName, result);
                            } else {
                                rpLog('warn', 'IMG', `${charName} 全身/半身生成失败`);
                            }
                        } catch (e) {
                            rpLog('error', 'IMG', `${charName} 全身/半身生成异常: ${e.message}`);
                        }
                    })());
                }

                // 所有头像完成后，一次性生成包含所有在场角色的统一场景图
                const allCharNames = appearingChars.map(c => c.name);
                const allCharObjs = allCharNames.map(name => state.characters.find(c => c.name === name)).filter(Boolean);
                const metadata = { presentCharacters: allCharNames };

                // 等所有头像任务完成后再生成场景图
                const sceneTask = Promise.allSettled(avatarTasks).then(() => {
                    const sceneRefUrls = allCharObjs.map(c => c.faceImageUrl || c.portraitImageUrl).filter(Boolean);
                    if (sceneRefUrls.length > 0) {
                        rpLog('info', 'SCENE', `所有头像就绪 (${allCharNames.join(', ')})，开始生成统一场景图`);
                        return App.generateSceneImage('opening', openingStructured.scene || openingRaw, allCharObjs[0], openingRaw, metadata);
                    } else {
                        rpLog('warn', 'SCENE', '头像全部生成失败，跳过场景图');
                    }
                }).catch(e => {
                    rpLog('error', 'SCENE', `场景图生成异常: ${e.message}`);
                });
                avatarTasks.push(sceneTask);
            }
        } catch (imgErr) {
            rpLog('error', 'IMG', '生图阶段失败: ' + imgErr.message);
            addSystemMessage(`⚠️ 生图阶段失败: ${imgErr.message}`);
        }
    } else {
        // 没有生图 API Key，也生成序章
        try {
            const openingResult = await App.generateOpeningScene();
            if (openingResult) {
                openingRaw = openingResult.rawText || '';
                openingStructured = openingResult.structured || null;
                rpLog('info', 'OPENING', '序章生成完成（无生图）');
            }
        } catch (err) {
            rpLog('warn', 'OPENING', '序章生成失败: ' + err.message);
        }
    }

    // 兜底：如果 openingRaw 为空但 structured 有值，在这里渲染
    rpLog('info', 'TIMING', '=== 序章渲染检查 ===');
    if (!openingRaw && openingStructured && openingStructured.characters?.length > 0) {
        rpLog('info', 'INIT-REPLY', 'openingRaw 为空但 structured 有值，兜底渲染');
        let parsedMessages = App.structuredToMessages(openingStructured, 'msg_opening_');
        for (const msg of parsedMessages) {
            state.messages.push(msg);
            renderMessage(msg);
        }
        saveMessages().catch(() => {});
        rpLog('info', 'TIMING', '✅ 序章消息渲染完成（兜底）');
    } else if (!openingStructured || openingStructured.characters?.length === 0) {
        rpLog('error', 'INIT-REPLY', '❌ 序章结构化结果为空，无法渲染');
        addSystemMessage('⚠️ 序章生成失败，请重试');
    }
    // 如果 openingRaw 非空，上面已经渲染过了，不再重复

    // 渲染序章建议选项
    App.renderOpeningReplyOptions(openingStructured, openingRaw);

    rpLog('info', 'INIT', '初始化完成，进入聊天阶段');
    updateGenerationControls();
}

