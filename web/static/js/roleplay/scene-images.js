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
// 角色面部由 img2img 参考图锁定，prompt 描述场景 + 所有在场角色的名字和特点
App.sceneToImagePrompt = function(sceneDesc, character, worldview, allCharacters) {
    let base = `Cinematic scene illustration: ${sceneDesc}.`;
    if (character) {
        base += ` ${character.name} is present in the scene, ${character.appearance || 'standing naturally'}.`;
    }
    // 加入其他角色的简要描述（不重复外貌细节，只标注存在）
    if (allCharacters && allCharacters.length > 1) {
        const others = allCharacters.filter(c => c.name !== character?.name);
        if (others.length > 0) {
            const otherDescs = others.map(c => `${c.name} (${c.appearance || 'present'})`).join(', ');
            base += ` Other characters present: ${otherDescs}.`;
        }
    }
    if (worldview) {
        base += ` World setting: ${worldview}`;
    }
    // 强调背景人物处理：除明确说明的角色外，背景中不要出现其他人物清晰形象
    base += ' Background: empty or blurred, NO other people clearly visible unless explicitly stated.';
    base += '. High quality, detailed lighting, atmospheric.';
    return App.appendArtStyle(base);
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
App.generateInitialSceneImage = async function(openingScene) {
    if (!openingScene) return;
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        console.warn('生图 API Key 未配置，跳过初始场景图生成');
        return;
    }

    const activeChar = state.characters[state.activeCharIndex];
    const worldview = state.story?.worldview || '';
    const prompt = App.sceneToImagePrompt(openingScene, activeChar, worldview, state.characters);

    try {
        rpLog('info', 'SCENE', '=== 初始场景图生成开始 ===');
        rpLog('info', 'SCENE', `场景描述: ${openingScene.slice(0, 100)}`);
        rpLog('info', 'SCENE', `世界观: ${(worldview || '').slice(0, 80)}`);
        rpLog('info', 'SCENE', `活跃角色: ${activeChar?.name || '无'}`);
        rpLog('info', 'SCENE', `角色外貌: ${(activeChar?.appearance || '无').slice(0, 60)}`);

        // 收集所有有头像的角色作为多图参考
        const allRefs = App.getAllCharacterFaceUrls();
        const requestBody = {
            model: 'agnes-image-2.1-flash',
            prompt: prompt,
            size: '768x1024',
            n: 1,
            extra_body: { response_format: 'url' }
        };

        if (allRefs.length > 0) {
            requestBody.image = allRefs;
            rpLog('info', 'SCENE', `✅ 多图参考: ${allRefs.length} 张角色头像`);
            allRefs.forEach((url, i) => {
                rpLog('debug', 'SCENE', `  参考图#${i+1}: ${url.slice(0, 100)}...`);
            });
        } else {
            rpLog('warn', 'SCENE', '❌ 暂无角色头像，将使用文生图模式');
        }

        rpLog('debug', 'SCENE', `生图尺寸: ${requestBody.size}, 参考图数量: ${allRefs.length}`);

        const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(120000)
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            rpLog('error', 'SCENE', `❌ 初始场景图生成失败: ${errData.error?.message || errData.message || resp.status}`);
            return;
        }

        const data = await resp.json();
        const imgUrl = data.data?.[0]?.url;
        if (!imgUrl) {
            rpLog('error', 'SCENE', `❌ 初始场景图返回数据异常: ${JSON.stringify(data).slice(0, 300)}`);
            return;
        }

        rpLog('info', 'SCENE', `✅ 初始场景图生成成功`);
        rpLog('debug', 'SCENE', `图片 URL: ${imgUrl.slice(0, 100)}...`);

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

    } catch (err) {
        console.warn('初始场景图生成异常:', err.message);
    }
}

// === 聊天中场景变化时生成新场景图（静默更新背景，不插入消息）===
App.generateSceneImage = async function(charName, sceneDesc, charObj) {
    if (!sceneDesc) return;
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        console.warn('生图 API Key 未配置，跳过场景图生成');
        return;
    }

    try {
        const prompt = App.sceneToImagePrompt(sceneDesc, charObj, state.story?.worldview || '', state.characters);

        rpLog('info', 'SCENE', '=== 场景图生成开始 ===');
        rpLog('info', 'SCENE', `角色: ${charName}`);
        rpLog('info', 'SCENE', `场景描述: ${sceneDesc.slice(0, 100)}`);
        rpLog('info', 'SCENE', `角色外貌: ${(charObj?.appearance || '无').slice(0, 60)}`);

        const requestBody = {
            model: 'agnes-image-2.1-flash',
            prompt: prompt,
            size: '768x1024',
            n: 1,
            extra_body: { response_format: 'url' }
        };

        // 收集所有有头像的角色作为多图参考
        const allRefs = App.getAllCharacterFaceUrls();
        if (allRefs.length > 0) {
            requestBody.image = allRefs;
            rpLog('info', 'SCENE', `✅ 多图参考: ${allRefs.length} 张角色头像`);
            allRefs.forEach((url, i) => {
                rpLog('debug', 'SCENE', `  参考图#${i+1}: ${url.slice(0, 100)}...`);
            });
        } else {
            rpLog('warn', 'SCENE', '❌ 暂无角色头像，将使用文生图模式');
        }

        rpLog('debug', 'SCENE', `生图尺寸: ${requestBody.size}, 参考图数量: ${allRefs.length}`);

        const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(120000)
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            rpLog('error', 'SCENE', `❌ 场景图生成失败: ${errData.error?.message || errData.message || resp.status}`);
            return;
        }

        const data = await resp.json();
        const imgUrl = data.data?.[0]?.url;
        if (!imgUrl) {
            rpLog('error', 'SCENE', `❌ 场景图返回数据异常: ${JSON.stringify(data).slice(0, 300)}`);
            return;
        }

        rpLog('info', 'SCENE', `✅ 场景图生成成功`);
        rpLog('debug', 'SCENE', `图片 URL: ${imgUrl.slice(0, 100)}...`);

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

    } catch (err) {
        console.warn('场景图生成异常:', err.message);
    }
}
