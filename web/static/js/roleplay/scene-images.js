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
// 注意：角色面部已由 img2img 参考图锁定，prompt 只描述场景和氛围，不要描述角色外貌
App.sceneToImagePrompt = function(sceneDesc, character, worldview) {
    let base = `Cinematic scene illustration: ${sceneDesc}. ${worldview ? 'World setting: ' + worldview : ''}. High quality, detailed lighting, atmospheric.`;
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
    const prompt = App.sceneToImagePrompt(openingScene, activeChar, worldview);

    console.log('开始生成初始场景图:', openingScene.slice(0, 80));

    try {
        const requestBody = {
            model: 'agnes-image-2.1-flash',
            prompt: prompt,
            size: '1024x768',
            n: 1,
            extra_body: { response_format: 'url' }
        };

        // 使用活跃角色头像作为 img2img 参考，保持场景图中角色一致性
        const faceUrl = App.getActiveCharacterFaceUrl();
        if (faceUrl) {
            requestBody.image = [faceUrl];
            console.log('使用活跃角色头像作为参考图 (img2img):', faceUrl.slice(0, 80));
        } else {
            console.log('活跃角色头像未就绪，使用文生图模式');
        }

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
            console.error('初始场景图生成失败:', errData.error?.message || errData.message || resp.status);
            return;
        }

        const data = await resp.json();
        const imgUrl = data.data?.[0]?.url;
        if (!imgUrl) {
            console.error('初始场景图返回数据异常:', JSON.stringify(data).slice(0, 300));
            return;
        }

        console.log('初始场景图生成成功:', imgUrl.slice(0, 80));

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

    console.log('开始生成场景图:', charName, sceneDesc.slice(0, 80));

    try {
        const worldview = state.story?.worldview || '';
        const prompt = App.sceneToImagePrompt(sceneDesc, charObj, worldview);

        const requestBody = {
            model: 'agnes-image-2.1-flash',
            prompt: prompt,
            size: '1024x768',
            n: 1,
            extra_body: { response_format: 'url' }
        };

        // 使用活跃角色头像作为 img2img 参考
        const faceUrl = App.getActiveCharacterFaceUrl();
        if (faceUrl) {
            requestBody.image = [faceUrl];
            console.log('使用活跃角色头像作为参考图 (img2img):', faceUrl.slice(0, 80));
        } else {
            console.log('活跃角色头像未就绪，使用文生图模式');
        }

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
            console.error('场景图生成失败:', errData.error?.message || errData.message || resp.status);
            return;
        }

        const data = await resp.json();
        const imgUrl = data.data?.[0]?.url;
        if (!imgUrl) {
            console.error('场景图返回数据异常:', JSON.stringify(data).slice(0, 300));
            return;
        }

        console.log('场景图生成成功:', imgUrl.slice(0, 80));

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
