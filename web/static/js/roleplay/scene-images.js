// === Section: 场景图生成系统 ===
// 从角色回复中解析场景 → 判断是否变化 → 生成场景图 → 插入消息

App.parseSceneFromReply = function(reply) {
    const match = reply.match(/\{([^}]+)\}/);
    return match ? match[1].trim() : null;
}

App.isSceneChanged = function(charName, sceneDesc) {
    if (!sceneDesc) return false;
    const history = state.sceneHistory || [];
    const lastEntry = history[history.length - 1];
    if (!lastEntry || lastEntry.charName !== charName) return true;
    return lastEntry.sceneDesc !== sceneDesc;
}

App.sceneToImagePrompt = function(sceneDesc, character, worldview) {
    let base = `Cinematic scene illustration: ${sceneDesc}. ${worldview ? 'World setting: ' + worldview : ''}. High quality, detailed lighting, atmospheric.`;
    return App.appendArtStyle(base);
}

App.getActiveCharacterFaceUrl = function() {
    const activeChar = state.characters[state.activeCharIndex];
    if (activeChar && activeChar.faceImageUrl) {
        return activeChar.faceImageUrl;
    }
    return null;
}

App.addSceneGenStatus = function() {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg system';
    div.id = 'scene-gen-status';
    div.style.cssText = 'text-align:center;font-size:0.75rem;color:var(--text-dim);padding:4px 0;';
    div.textContent = '🎬 正在绘制场景...';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

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

        const faceUrl = App.getActiveCharacterFaceUrl();
        if (faceUrl) {
            requestBody.image = [faceUrl];
            console.log('使用角色头像作为参考图 (img2img):', faceUrl.slice(0, 80));
        } else {
            console.log('角色头像未就绪，使用文生图模式');
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

        const sceneMsg = {
            id: 'msg_scene_' + Date.now(),
            role: 'char',
            type: 'image',
            content: imgUrl,
            caption: `📍 ${sceneDesc}`,
            charIndex: state.activeCharIndex,
            timestamp: new Date().toISOString()
        };
        state.messages.push(sceneMsg);
        renderMessage(sceneMsg);
        await saveMessages();

        if (!state.sceneHistory) state.sceneHistory = [];
        state.sceneHistory.push({
            charName: charName,
            sceneDesc: sceneDesc,
            imageUrl: imgUrl,
            timestamp: new Date().toISOString()
        });
        await saveState();

        // 清理"正在绘制场景"状态标记
        const typingEl = document.getElementById('scene-gen-status');
        if (typingEl) typingEl.remove();

    } catch (err) {
        console.warn('场景图生成异常:', err.message);
    }
}
