// === Section: 两阶段流程编排 ===
// 初始化故事（世界观→角色→序章→按出场顺序逐个生成头像+场景图→开场）

App.initializeStory = async function(userInspiration, playerGender) {
    rpLog('info', 'INIT', `开始两阶段故事生成流程，玩家性别: ${playerGender || state.player?.gender}`);
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

    // 角色生成完成后：先生成序章 → 渲染序章 → 按出场顺序逐个生成头像+场景图
    if (state.apiKeys.image) {
        rpLog('info', 'IMG', `━━━ 开始生图阶段（按出场顺序）: ${state.characters.length} 个角色 + 主角 ━━━`);
        rpLog('info', 'IMG', `  生图 API Key 已配置`);
        rpLog('info', 'IMG', `  角色列表: ${state.characters.map(c => `${c.name}(faceImgUrl=${!!c.faceImageUrl}, portraitImgUrl=${!!c.portraitImageUrl})`).join(', ')}`);

        try {
            // 第一步：生成序章（不生成头像，头像等出场后再生成）
            rpLog('info', 'OPENING', '开始生成序章（头像延迟到出场时生成）');
            addSystemMessage('✍️ 正在生成序章...');
            
            const openingResult = await App.generateOpeningScene();
            openingRaw = openingResult?.rawText || '';
            openingStructured = openingResult?.structured || null;

            if (openingRaw) {
                rpLog('info', 'OPENING', '序章生成完成，立即渲染序章场景消息（不渲染角色消息）');
                
                // 只渲染场景消息，不渲染角色消息（角色头像生成后再渲染）
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

            // 第二步：按出场顺序逐个生成头像 + 场景图 + 角色消息
            if (openingStructured && openingStructured.characters?.length > 0) {
                const appearingChars = openingStructured.characters;
                rpLog('info', 'IMG', `序章出场 ${appearingChars.length} 个角色，按顺序逐个生成头像和角色消息`);
                
                // 先生成主角头像
                rpLog('info', 'IMG', '生成主角头像');
                try {
                    const playerUrl = await App.generatePlayerAvatar();
                    rpLog('info', 'IMG', `主角头像生成完成: ${playerUrl ? 'yes' : 'no'}`);
                } catch (e) {
                    rpLog('warn', 'IMG', `主角头像生成失败: ${e.message}`);
                }

                // 按出场顺序逐个生成角色头像 + 场景图 + 角色消息
                for (let i = 0; i < appearingChars.length; i++) {
                    const charInfo = appearingChars[i];
                    const charName = charInfo.name;
                    
                    // 在 state.characters 中找到对应的角色对象
                    const charObj = state.characters.find(c => c.name === charName);
                    if (!charObj) {
                        rpLog('warn', 'IMG', `角色 ${charName} 未在 state.characters 中找到，跳过`);
                        continue;
                    }
                    
                    rpLog('info', 'IMG', `━━━ 生成 ${charName} 的头像（出场顺序 ${i+1}/${appearingChars.length}）━━━`);
                    addSystemMessage(`🎨 正在生成 ${charName} 的头像...`);
                    
                    try {
                        const result = await App.generateCharacterFaceSilent(charObj);
                        if (result) {
                            rpLog('info', 'IMG', `${charName} 头像生成成功`);
                            addSystemMessage(`✅ ${charName} 头像生成完成`);
                            
                            // 头像生成完成后，渲染该角色的序章消息
                            rpLog('info', 'OPENING', `${charName} 头像完成，渲染角色消息`);
                            const charStructured = appearingChars.find(c => c.name === charName);
                            if (charStructured) {
                                let fullContent = '';
                                if (charStructured.action) fullContent += `(${charStructured.action})`;
                                if (charStructured.dialogue) fullContent += charStructured.dialogue;
                                if (charStructured.thought) fullContent += `[${charStructured.thought}]`;
                                if (!fullContent) fullContent = charStructured.dialogue || '(无内容)';
                                
                                const charMsgObj = {
                                    id: 'msg_opening-' + charName,
                                    role: 'char',
                                    type: 'multi_char',
                                    charName: charName,
                                    charIndex: state.characters.findIndex(c => c.name === charName),
                                    content: fullContent,
                                    action: charStructured.action || '',
                                    dialogue: charStructured.dialogue || '',
                                    thought: charStructured.thought || ''
                                };
                                state.messages.push(charMsgObj);
                                renderMessage(charMsgObj);
                                saveMessages().catch(() => {});
                                rpLog('info', 'OPENING', `${charName} 角色消息渲染完成`);
                            }
                            
                            // 头像生成完成后，触发场景图
                            rpLog('info', 'SCENE', `${charName} 头像完成，生成场景图`);
                            const sceneForImage = openingStructured.scene || openingRaw;
                            const metadata = openingStructured ? {
                                presentCharacters: [charName]
                            } : null;
                            await App.generateSceneImage(charName, sceneForImage, charObj, openingRaw, metadata);
                            rpLog('info', 'SCENE', `${charName} 场景图生成完成`);
                        } else {
                            rpLog('warn', 'IMG', `${charName} 头像生成失败`);
                        }
                    } catch (e) {
                        rpLog('error', 'IMG', `${charName} 头像生成异常: ${e.message}`);
                    }
                }
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

    rpLog('info', 'INIT', '初始化完成，进入聊天阶段');
    updateGenerationControls();
}

