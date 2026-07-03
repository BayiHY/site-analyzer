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
        .replace(/[""」"""]/g, '')           // 去掉引号
        .replace(/[^.。！!?]*[""」"""][^.。！!?]*/g, '')  // 去掉引号及之间的内容
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

    // 3. 其他在场角色：只从 replyText 中提取实际在场的角色，不把所有角色都加进去
    if (allCharacters && allCharacters.length > 1) {
        // 提前构建角色名集合
        const charNameSet = new Set(allCharacters.map(c => c.name));

        // 从 replyText 中解析实际出现的角色名
        const replyCleaned = replyText ? replyText.replace(/\{[^}]+\}/, '').replace(/<[^>]+>$/, '').trim() : '';
        const presentNames = new Set();
        const namePattern = /([^\s|:：]{1,10})[:：](?!\s*\()/g;
        let nm;
        while ((nm = namePattern.exec(replyCleaned)) !== null) {
            const n = nm[1].trim();
            if (n && /[^\s]/.test(n) && charNameSet.has(n)) {
                presentNames.add(n);
            }
        }
        // 过滤掉当前角色，只保留其他在场角色
        const others = allCharacters.filter(c => c.name !== character?.name && presentNames.has(c.name));
        if (others.length > 0) {
            const otherDescs = others.map(c => {
                let desc = `${c.name}`;
                if (c.appearance) desc += `, ${c.appearance}`;
                return desc;
            }).join(', ');
            base += ` Other characters present: ${otherDescs}.`;
        }
        // 记录在场角色判定过程
        rpLog('info', 'SCENE-BUILD', `场景描述原文包含角色: ${[...presentNames].join(', ') || '无'}, 活跃角色白名单: ${[...charNameSet].join(', ')}, 过滤后其他在场: ${others.map(c=>c.name).join(', ') || '无'}`);
    }

    // 4. 背景约束
    base += ' Background: empty or blurred, NO other people clearly visible.';
    base += '. High quality, detailed lighting, atmospheric.';
    const finalPrompt = App.appendArtStyle(base);

    rpLog('info', 'SCENE', `📝 场景图 Prompt (${finalPrompt.length}字): ${finalPrompt}`);
    return finalPrompt;
}

// === 获取场景中出现的角色头像 URL（正则解析） ===
App.getSceneCharacterFaceUrls = function(replyText, allCharacters) {
    if (!replyText) {
        // 没有回复文本（如初始场景图），返回所有有面部图的角色的参考图
        const urls = [];
        for (const char of (allCharacters || [])) {
            if (char.faceImageUrl) {
                urls.push(char.faceImageUrl);
            }
        }
        rpLog('info', 'SCENE', `✅ 初始场景参考图: ${urls.length} 张（所有角色）`);
        return urls;
    }
    const sceneMatch = replyText.match(/\{([^}]+)\}/);
    let cleaned = replyText;
    if (sceneMatch) {
        cleaned = replyText.slice(sceneMatch[0].length);
    }
    cleaned = cleaned.replace(/<[^>]+>$/, '').trim();
    
    // 提前构建角色名集合，用于过滤非角色名
    const charNameSet = new Set((allCharacters || []).map(c => c.name));
    
    const presentNames = new Set();
    const namePattern = /([^\s|:：]{1,10})[:：](?!\s*\()/g;
    let nm;
    while ((nm = namePattern.exec(cleaned)) !== null) {
        const name = nm[1].trim();
        // 只保留已知的角色名，过滤掉描述性短语如"女性主角"、"高阶监察员"等
        if (name && /[^\s]/.test(name) && charNameSet.has(name)) {
            presentNames.add(name);
        }
    }
    const loneAction = cleaned.match(/^\(([^)]+)\)/);
    if (!loneAction || presentNames.size === 0) {
        if (allCharacters && allCharacters.length > 0) {
            presentNames.add(allCharacters[0].name);
        }
    }
    
    const validNames = new Set();
    for (const name of presentNames) {
        if (charNameSet.has(name)) {
            validNames.add(name);
        }
    }
    if (validNames.size !== presentNames.size) {
        rpLog('info', 'SCENE', `⚠️ 过滤非角色名: ${[...presentNames].join(', ')} → ${[...validNames].join(', ')}`);
    }
    
    const urls = [];
    for (const char of (allCharacters || [])) {
        if (char.faceImageUrl && validNames.has(char.name)) {
            urls.push(char.faceImageUrl);
        }
    }
    
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

// === 获取主角头像 URL ===
App.getPlayerFaceUrl = function() {
    if (state.player && state.player.faceImageUrl) {
        return state.player.faceImageUrl;
    }
    return null;
}

// === 获取活跃角色头像 URL ===
App.getActiveCharacterFaceUrl = function() {
    const activeChar = state.characters[state.activeCharIndex];
    if (activeChar && activeChar.faceImageUrl) {
        return activeChar.faceImageUrl;
    }
    return null;
}

// === 获取所有有头像的角色 URL 列表 ===
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

// === 初始场景图生成（角色头像完成后调用） ===
App.generateInitialSceneImage = async function(openingScene, replyText) {
    if (!openingScene) return;
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        console.warn('生图 API Key 未配置，跳过初始场景图生成');
        return;
    }

    const activeChar = state.characters[state.activeCharIndex];
    const worldview = state.story?.worldview || '';

    // 修复：使用 replyText（实际回复文本）而非 openingScene 来判定在场角色
    const effectiveReplyText = replyText || openingScene;
    const prompt = App.sceneToImagePrompt(openingScene, activeChar, worldview, state.characters, effectiveReplyText);

    try {
        rpLog('info', 'SCENE', '=== 初始场景图生成开始 ===');
        rpLog('info', 'SCENE', `场景描述: ${openingScene.slice(0, 100)}`);
        rpLog('info', 'SCENE', `活跃角色: ${activeChar?.name || '无'}`);

        // 修复：初始场景图使用 openingScene 本身作为 replyText 来判定在场角色
        const sceneRefs = App.getSceneCharacterFaceUrls(openingScene, state.characters);
        const requestBody = {
            model: 'agnes-image-2.1-flash',
            prompt: prompt,
            size: '256x341',
            n: 1,
            extra_body: { response_format: 'url' }
        };

        if (sceneRefs.length > 0) {
            requestBody.extra_body.image = sceneRefs;
            rpLog('info', 'SCENE', `✅ 场景参考图: ${sceneRefs.length} 张（仅在场角色）`);
        } else {
            rpLog('warn', 'SCENE', '❌ 暂无角色头像，将使用文生图模式');
        }

        rpLog('info', 'TIMEOUT', `生图请求开始: initial_scene`);
        rpLog('info', 'SCENE', '[TRACE:initial_scene] 生图请求已开始');
        const imgStart = Date.now();
        const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(120000)
        });

        const imgElapsed = Date.now() - imgStart;
        rpLog('info', 'TIMEOUT', `生图请求完成: initial_scene, 耗时 ${imgElapsed}ms, status=${resp.status}`);

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '(无法读取)');
            rpLog('error', 'SCENE', `❌ 初始场景图生成失败: status=${resp.status}`);
            return;
        }

        const data = await resp.json();
        const imgUrl = data.data?.[0]?.url;
        if (!imgUrl) {
            rpLog('error', 'SCENE', `❌ 初始场景图返回数据异常: ${JSON.stringify(data).slice(0, 300)}`);
            return;
        }

        rpLog('info', 'SCENE', `✅ 初始场景图生成成功`);
        state.currentSceneBg = imgUrl;
        if (!state.sceneHistory) state.sceneHistory = [];
        state.sceneHistory.push({
            charName: activeChar?.name || '',
            sceneDesc: openingScene,
            imageUrl: imgUrl,
            timestamp: new Date().toISOString()
        });
        await saveState();
        App.applySceneBackground(imgUrl);

    } catch (err) {
        console.warn('初始场景图生成异常:', err.message);
    }
}

// === 聊天中场景变化时生成新场景图 ===
App.generateSceneImage = async function(charName, sceneDesc, charObj, replyText) {
    if (!sceneDesc) return;
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        console.warn('生图 API Key 未配置，跳过场景图生成');
        return;
    }

    try {
        const prompt = App.sceneToImagePrompt(sceneDesc, charObj, state.story?.worldview || '', state.characters, replyText);

        rpLog('info', 'SCENE', '=== 场景图生成开始 ===');
        rpLog('info', 'SCENE', `角色: ${charName}`);
        rpLog('info', 'SCENE', `场景描述: ${sceneDesc.slice(0, 100)}`);

        const requestBody = {
            model: 'agnes-image-2.1-flash',
            prompt: prompt,
            size: '256x341',
            n: 1,
            extra_body: { response_format: 'url' }
        };

        const sceneRefs = App.getSceneCharacterFaceUrls(replyText, state.characters);
        if (sceneRefs.length > 0) {
            requestBody.extra_body.image = sceneRefs;
            rpLog('info', 'SCENE', `✅ 场景参考图: ${sceneRefs.length} 张（仅在场角色）`);
        } else {
            rpLog('warn', 'SCENE', '❌ 暂无角色头像，将使用文生图模式');
        }

        rpLog('info', 'TIMEOUT', `生图请求开始: chat_scene (${charName})`);
        const imgStart = Date.now();
        const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(120000)
        });

        const imgElapsed = Date.now() - imgStart;
        rpLog('info', 'TIMEOUT', `生图请求完成: chat_scene (${charName}), 耗时 ${imgElapsed}ms, status=${resp.status}`);

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '(无法读取)');
            rpLog('error', 'SCENE', `❌ 场景图生成失败: status=${resp.status}`);
            return;
        }

        const data = await resp.json();
        const imgUrl = data.data?.[0]?.url;
        if (!imgUrl) {
            rpLog('error', 'SCENE', `❌ 场景图返回数据异常: ${JSON.stringify(data).slice(0, 300)}`);
            return;
        }

        rpLog('info', 'SCENE', `✅ 场景图生成成功`);
        state.currentSceneBg = imgUrl;
        if (!state.sceneHistory) state.sceneHistory = [];
        state.sceneHistory.push({
            charName: charName,
            sceneDesc: sceneDesc,
            imageUrl: imgUrl,
            timestamp: new Date().toISOString()
        });
        await saveState();
        App.applySceneBackground(imgUrl);

    } catch (err) {
        console.warn('场景图生成异常:', err.message);
    }
}
