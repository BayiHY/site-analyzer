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

    // 角色生成完成后，并行生成头像 + 序章
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

            // 序章生成任务（基于角色数据生成，与头像并行）
            const openingTask = App.generateOpeningScene().then(scene => {
                if (scene) {
                    state.story.openingScene = scene;
                    rpLog('info', 'OPENING', '序章生成完成，已存入 state.story.openingScene');
                }
                return scene;
            }).catch(err => {
                rpLog('warn', 'OPENING', '序章生成失败: ' + err.message);
                return '';
            });

            // 等待所有角色头像完成
            await Promise.all(imgTasks);
            const playerOk = await playerAvatarTask;
            addSystemMessage(`✅ 角色头像生成完成 (${state.characters.length}/${state.characters.length} 角色 + ${playerOk ? '1' : '0'} 主角)`);
            rpLog('info', 'IMG', `角色头像生成完成: ${state.characters.length}/${state.characters.length} 角色, 主角:${playerOk}`);

            // 等待序章完成
            const openingScene = await openingTask;
            if (openingScene) {
                rpLog('info', 'OPENING', '序章生成完成，开始渲染序章消息');
            } else {
                rpLog('warn', 'OPENING', '序章生成返回空，使用空序章');
            }

            // 角色头像全部完成 + 序章生成完成 → 生成初始场景图
            if (state.story.openingScene) {
                rpLog('info', 'SCENE', '角色头像全部完成 + 序章完成，开始生成初始场景图');
                addSystemMessage('🖼️ 正在生成场景图...');
                rpLog('info', 'TIMING', `场景图生成前 openingScene 长度: ${state.story.openingScene.length}`);
                
                // 从序章中提取结构化回复文本（用于角色名解析）
                const replyText = state.story.openingScene;
                await App.generateInitialSceneImage(state.story.openingScene, replyText);
                rpLog('info', 'SCENE', '初始场景图生成完成');
                rpLog('info', 'TIMING', '✅ 场景图生成完成，耗时已记录');
            }
        } catch (imgErr) {
            rpLog('error', 'IMG', '头像/场景图生成失败: ' + imgErr.message);
            addSystemMessage(`⚠️ 头像/场景图生成失败: ${imgErr.message}`);
        }
    } else {
        // 没有生图 API Key，也生成序章
        try {
            const openingScene = await App.generateOpeningScene();
            if (openingScene) {
                state.story.openingScene = openingScene;
                rpLog('info', 'OPENING', '序章生成完成（无生图），已存入 state.story.openingScene');
            }
        } catch (err) {
            rpLog('warn', 'OPENING', '序章生成失败: ' + err.message);
        }
    }

    // 解析序章：复用 parseMultiCharReply 的完整解析管线（场景提取→建议回复→角色分割→内容解析）
    rpLog('info', 'TIMING', '=== 开始解析序章 ===');
    const openingRaw = state.story.openingScene || '';
    rpLog('INFO', 'INIT-REPLY', `开场场景原始文本 (长度=${openingRaw.length}): "${openingRaw.substring(0, 150)}..."`);
    
    // 直接调用 parseMultiCharReply，复用角色回复的完整解析和渲染逻辑
    const parsedMessages = await App.parseMultiCharReply(openingRaw, 0);
    rpLog('INFO', 'INIT-REPLY', `序章解析出 ${parsedMessages.length} 条消息`);
    
    // 将所有解析出的消息加入 state.messages 并逐个渲染
    for (const msg of parsedMessages) {
        state.messages.push(msg);
        renderMessage(msg);
    }
    rpLog('info', 'TIMING', '✅ 序章消息渲染完成');
    saveMessages().catch(() => {});

    rpLog('info', 'INIT', '初始化完成，进入聊天阶段');
    updateGenerationControls();
}

