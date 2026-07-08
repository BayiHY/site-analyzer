// === Section: 场景图生成系统 ===
// 从角色回复中解析场景 → 判断是否变化 → 生成场景图 → 设置为聊天窗口背景
// 初始化完成后根据序章生成初始场景图并设为背景

// === 解析场景描述 ===
App.parseSceneFromReply = function(reply) {
    const match = reply.match(/\{([^}]+)\}/);
    return match ? match[1].trim() : null;
}

// === 场景变化检测 ===
App.isSceneChanged = function(charName, sceneDesc) {
    if (!sceneDesc) return false;
    const history = state.sceneHistory || [];
    const lastEntry = history[history.length - 1];
    if (!lastEntry || lastEntry.charName !== charName) return true;
    return lastEntry.sceneDesc !== sceneDesc;
}

// === 场景 → 生图 prompt ===
// 只包含：环境 + 角色形象 + 角色动作，去除对话、世界观等冗余内容
App.sceneToImagePrompt = function(sceneDesc, character, worldview, allCharacters, replyText) {
    // 1. 环境描述：从 sceneDesc 中提取纯环境部分，去掉引号内的对话
    let envDesc = sceneDesc
        .replace(/[""”“]/g, '')           // 去掉引号
        .trim();
    let base = `Cinematic scene illustration: ${envDesc}.`;

    // 2. 当前角色：名字 + 外貌 + 动作
    if (character) {
        let charDesc = `${character.name} is present in the scene`;
        if (character.appearance) {
            charDesc += `, ${character.appearance}`;
        }
        // 从 replyText 解析动作
        let charAction = '';
        if (replyText) {
            const cleaned = replyText.replace(/\{[^}]+\}/, '').replace(/<[^>]+>$/, '').trim();
            const actionPattern = new RegExp(`${character.name}[^\\s|:：]{0,10}[:：]\\(([^)]+)\\)`);
            const am = cleaned.match(actionPattern);
            if (am) charAction = am[1];
        }
        if (charAction) {
            charDesc += `, doing: ${charAction}`;
        }
        base += '.' + charDesc;
    }

    // 3. 其他在场角色：名字 + 外貌（不加动作，避免复杂化）
    if (allCharacters && allCharacters.length > 1) {
        const others = allCharacters.filter(c => c.name !== character?.name);
        if (others.length > 0) {
            const otherDescs = others.map(c => {
                let desc = `${c.name}`;
                if (c.appearance) desc += `, ${c.appearance}`;
                return desc;
            }).join(', ');
            base += ` Other characters present: ${otherDescs}.`;
        }
    }

    // 4. 背景约束
    base += ' Background: empty or blurred, NO other people clearly visible.';
    base += '. High quality, detailed lighting, atmospheric.';
    const finalPrompt = App.appendArtStyle(base);
    
    rpLog('info', 'SCENE', `📝 场景图 Prompt (${finalPrompt.length}字): ${finalPrompt}`);
    return finalPrompt;
}

// === 获取场景中出现的所有角色（参考图） ===
// 优先使用结构化元数据中的 presentCharacters，fallback 到正则解析
App.getSceneCharacterFaceUrls = function(replyText, allCharacters, metadata) {
    // 如果有结构化元数据且包含 presentCharacters，直接使用
    if (metadata && metadata.presentCharacters && metadata.presentCharacters.length > 0) {
        const urls = [];
        for (const char of (allCharacters || [])) {
            if (char.faceImageUrl && metadata.presentCharacters.includes(char.name)) {
                urls.push(char.faceImageUrl);
            }
        }
        if (urls.length > 0) {
            rpLog('info', 'SCENE', `✅ 使用结构化元数据: presentCharacters=${JSON.stringify(metadata.presentCharacters)}`);
            return urls;
        }
        rpLog('info', 'SCENE', `⚠️ 结构化元数据 presentCharacters=${JSON.stringify(metadata.presentCharacters)} 但找不到匹配的角色头像，fallback 正则`);
    } else {
        rpLog('info', 'SCENE', `⚠️ 无结构化元数据 (metadata=${!!metadata}), fallback 正则解析`);
    }
    
    // Fallback: 正则解析
    return App._getSceneCharacterFaceUrlsRegex(replyText, allCharacters);
}

// 正则解析版本（旧逻辑，作为 fallback）
App._getSceneCharacterFaceUrlsRegex = function(replyText, allCharacters) {
    if (!replyText) {
        // 无回复文本时只返回当前活跃角色的参考图
        const activeChar = allCharacters && allCharacters.length > 0 ? allCharacters[0] : null;
        if (activeChar && activeChar.faceImageUrl) {
            return [activeChar.faceImageUrl];
        }
        return [];
    }
    // 提取出场角色名
    const sceneMatch = replyText.match(/\{([^}]+)\}/);
    let cleaned = replyText;
    if (sceneMatch) {
        cleaned = replyText.slice(sceneMatch[0].length);
    }
    cleaned = cleaned.replace(/<[^>]+>$/, '').trim();
    
    const presentNames = new Set();
    // 匹配 角色名:(动作) 或 角色名:对话
    const namePattern = /([^\s|:：]{1,10})[:：](?!\s*\()/g;
    let nm;
    while ((nm = namePattern.exec(cleaned)) !== null) {
        const name = nm[1].trim();
        if (name && /[^\s]/.test(name)) {
            presentNames.add(name);
        }
    }
    // 也匹配无角色名的 (动作) 开头
    const loneAction = cleaned.match(/^\(([^)]+)\)/);
    if (!loneAction || presentNames.size === 0) {
        // 如果没有解析到命名角色，至少包含当前角色
        if (allCharacters && allCharacters.length > 0) {
            presentNames.add(allCharacters[0].name);
        }
    }
    
    // 关键验证：只保留在角色列表中实际存在的名字
    // 过滤掉误匹配的文本片段（如"空气凝固。你面临选择"）
    const charNameSet = new Set((allCharacters || []).map(c => c.name));
    const validNames = new Set();
    for (const name of presentNames) {
        if (charNameSet.has(name)) {
            validNames.add(name);
        }
    }
    if (validNames.size !== presentNames.size) {
        rpLog('info', 'SCENE', `⚠️ 过滤非角色名: ${[...presentNames].join(', ')} → ${[...validNames].join(', ')}`);
    }
    
    // 不再 fallback 到全部角色 —— 现场有几个角色就用几个角色的参考
    // 同时检测主角是否在场景中互动，如果是则加入主角参考图
    const urls = [];
    for (const char of (allCharacters || [])) {
        if (char.faceImageUrl && validNames.has(char.name)) {
            urls.push(char.faceImageUrl);
        }
    }
    
    // 检测主角是否在场：检查 replyText 中是否有 "你" 或主角名
    if (replyText && state.player && state.player.faceImageUrl) {
        const playerName = state.player.name;
        const playerInScene = replyText.includes('你') || 
                              replyText.includes(playerName) ||
                              replyText.includes(playerName + '（') ||
                              replyText.includes(playerName + '：');
        if (playerInScene) {
            urls.push(state.player.faceImageUrl);
            rpLog('info', 'SCENE', `👤 主角在场，加入主角参考图`);
        }
    }
    
    rpLog('info', 'SCENE', `✅ 场景参考图: ${urls.length} 张 (${[...validNames].join(', ')}${urls.some(u => u === state.player?.faceImageUrl) ? ', 主角' : ''})`);
    return urls;
}

// === 获取主角头像 URL（用于场景图 img2img 参考） ===
App.getPlayerFaceUrl = function() {
    if (state.player && state.player.faceImageUrl) {
        return state.player.faceImageUrl;
    }
    return null;
}

// === 获取活跃角色头像 URL（用于场景图 img2img 参考） ===
App.getActiveCharacterFaceUrl = function() {
    const activeChar = state.characters[state.activeCharIndex];
    if (activeChar && activeChar.faceImageUrl) {
        return activeChar.faceImageUrl;
    }
    return null;
}

// === 获取所有有头像的角色 URL 列表（多图参考） ===
App.getAllCharacterFaceUrls = function() {
    const urls = [];
    for (const char of state.characters) {
        if (char.faceImageUrl) {
            urls.push(char.faceImageUrl);
        }
    }
    return urls;
}

// === 应用场景背景到聊天窗口 ===
App.applySceneBackground = function(imageUrl) {
    const chatScreen = document.getElementById('chat-screen');
    if (!chatScreen) return;
    if (imageUrl) {
        // 用 fixed 定位的背景层，不随内容滚动
        let bgLayer = document.getElementById('scene-bg-layer');
        if (!bgLayer) {
            bgLayer = document.createElement('div');
            bgLayer.id = 'scene-bg-layer';
            bgLayer.style.cssText = 'position:fixed;inset:0;z-index:0;background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;';
            document.body.insertBefore(bgLayer, document.body.firstChild);
        }
        bgLayer.style.backgroundImage = `url('${imageUrl}')`;
    } else {
        const bgLayer = document.getElementById('scene-bg-layer');
        if (bgLayer) bgLayer.style.backgroundImage = '';
    }
}
App.generateInitialSceneImage = async function(openingScene, replyText, metadata) {
    const t0 = Date.now();
    rpLog('info', 'SCENE', `▶️ 场景图生成开始 (t=${Date.now() - t0}ms)`);
    if (!openingScene) {
        rpLog('warn', 'SCENE', '❌ 场景描述为空，跳过');
        return;
    }
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        rpLog('warn', 'SCENE', '❌ 生图 API Key 未配置，跳过');
        return;
    }

    const activeChar = state.characters[state.activeCharIndex];
    const worldview = state.story?.worldview || '';
    rpLog('info', 'SCENE', `活跃角色: ${activeChar?.name || '无'}, 角色数: ${state.characters?.length || 0}`);

    const prompt = App.sceneToImagePrompt(openingScene, activeChar, worldview, state.characters, replyText);
    rpLog('info', 'SCENE', `场景提示词长度: ${prompt?.length || 0}`);

    try {
        rpLog('info', 'SCENE', '=== 初始场景图生成开始 ===');
        rpLog('info', 'SCENE', `场景描述: ${openingScene.slice(0, 100)}`);
        rpLog('info', 'SCENE', `世界观: ${(worldview || '').slice(0, 80)}`);
        rpLog('info', 'SCENE', `角色外貌: ${(activeChar?.appearance || '无').slice(0, 60)}`);

        // 只传入场景中实际出现的角色参考图
        const sceneRefs = App.getSceneCharacterFaceUrls(replyText || openingScene, state.characters, metadata);
        if (sceneRefs.length > 0) {
            rpLog('info', 'SCENE', `✅ 场景参考图: ${sceneRefs.length} 张（仅在场角色）`);
            sceneRefs.forEach((url, i) => {
                rpLog('info', 'SCENE', `  参考图#${i+1}: ${url.slice(0, 120)}`);
            });
        } else {
            rpLog('warn', 'SCENE', '❌ 暂无角色头像，将使用文生图模式');
        }

        // 统一生图入口（自动模型降级）
        rpLog('info', 'SCENE', '📡 开始调用生图 API...');
        const imgUrl = await App.agnesImageGenerate({
            prompt,
            refImages: sceneRefs,
            size: '256x341',
            model: 'agnes-image-2.1-flash',
            label: 'initial_scene'
        });
        rpLog('info', 'SCENE', `✅ 场景图生成成功: ${imgUrl.slice(0, 80)}`);

        // 保存状态并设为背景
        state.currentSceneBg = imgUrl;
        if (!state.sceneHistory) state.sceneHistory = [];
        state.sceneHistory.push({
            charName: activeChar?.name || '',
            sceneDesc: openingScene,
            imageUrl: imgUrl,
            timestamp: new Date().toISOString()
        });
        await saveState();

        // 应用为背景图
        App.applySceneBackground(imgUrl);
        rpLog('info', 'SCENE', `✅ 场景图生成完成，总耗时: ${Date.now() - t0}ms`);

    } catch (err) {
        rpLog('error', 'SCENE', `❌ 场景图生成失败: ${err.message || String(err)} (耗时 ${Date.now() - t0}ms)`);
        console.warn('初始场景图生成异常:', err.message);
    }
}

// === 聊天中场景变化时生成新场景图（静默更新背景，不插入消息）===
App.generateSceneImage = async function(charName, sceneDesc, charObj, replyText, metadata) {
    const t0 = Date.now();
    rpLog('info', 'SCENE', `▶️ 场景图生成开始 (t=${Date.now() - t0}ms)`);
    if (!sceneDesc) {
        rpLog('warn', 'SCENE', '❌ 场景描述为空，跳过');
        return;
    }
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        rpLog('warn', 'SCENE', '❌ 生图 API Key 未配置，跳过');
        return;
    }

    try {
        const prompt = App.sceneToImagePrompt(sceneDesc, charObj, state.story?.worldview || '', state.characters, replyText);
        rpLog('info', 'SCENE', `场景提示词长度: ${prompt?.length || 0}`);

        rpLog('info', 'SCENE', '=== 场景图生成开始 ===');
        rpLog('info', 'SCENE', `角色: ${charName}`);
        rpLog('info', 'SCENE', `场景描述: ${sceneDesc.slice(0, 100)}`);
        rpLog('info', 'SCENE', `角色外貌: ${(charObj?.appearance || '无').slice(0, 60)}`);

        // 只传入场景中实际出现的角色参考图
        const sceneRefs = App.getSceneCharacterFaceUrls(replyText, state.characters, metadata);
        if (sceneRefs.length > 0) {
            rpLog('info', 'SCENE', `✅ 场景参考图: ${sceneRefs.length} 张（仅在场角色）`);
            sceneRefs.forEach((url, i) => {
                rpLog('info', 'SCENE', `  参考图#${i+1}: ${url.slice(0, 120)}`);
            });
        } else {
            rpLog('warn', 'SCENE', '❌ 暂无角色头像，将使用文生图模式');
        }

        // 统一生图入口（自动模型降级）
        rpLog('info', 'SCENE', '📡 开始调用生图 API...');
        const imgUrl = await App.agnesImageGenerate({
            prompt,
            refImages: sceneRefs,
            size: '256x341',
            model: 'agnes-image-2.1-flash',
            label: `chat_scene_${charName}`
        });
        rpLog('info', 'SCENE', `✅ 场景图生成成功: ${imgUrl.slice(0, 80)}`);

        // 更新状态
        state.currentSceneBg = imgUrl;
        if (!state.sceneHistory) state.sceneHistory = [];
        state.sceneHistory.push({
            charName: charName,
            sceneDesc: sceneDesc,
            imageUrl: imgUrl,
            timestamp: new Date().toISOString()
        });
        await saveState();

        // 更新聊天窗口背景
        App.applySceneBackground(imgUrl);
        rpLog('info', 'SCENE', `✅ 场景图生成完成，总耗时: ${Date.now() - t0}ms`);

    } catch (err) {
        rpLog('error', 'SCENE', `❌ 场景图生成失败: ${err.message || String(err)} (耗时 ${Date.now() - t0}ms)`);
        console.warn('场景图生成异常:', err.message);
    }
}
