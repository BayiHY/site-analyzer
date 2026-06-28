// === Section: 场景图生成系统 ===
// === Section: 头像生图安全处理 ===
// === Section: 风格统一工具 ===
// === Section: Agnes 图片生成 ===
    // ===== Agnes 图片生成 =====
    App.agnesImageGen = async function(prompt, size = '768x1024') {
        const apiKey = state.apiKeys.image;
        if (!apiKey) {
            throw new Error('未配置生图 API Key');
        }

        const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'agnes-image-2.1-flash',
                prompt: prompt,
                size: size,
                n: 1,
                extra_body: { response_format: 'url' }
            }),
            signal: AbortSignal.timeout(120000)
        });

        if (!resp.ok) {
            let errMsg = `生图错误 (${resp.status})`;
            try {
                const errData = await resp.json();
                errMsg = errData.error?.message || errData.message || errMsg;
            } catch(e) {
                errMsg = `生图错误 (${resp.status}): ${await resp.text()}`;
            }
            console.error('生图API响应:', errMsg);
            throw new Error(errMsg);
        }

        const data = await resp.json();
        console.log('生图API返回:', JSON.stringify(data).slice(0, 200));
        const imgUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json || '';
        if (!imgUrl) {
            console.error('生图返回数据异常:', JSON.stringify(data).slice(0, 500));
            throw new Error('未获取到图片 URL，API 返回格式异常');
        }
        return imgUrl;
    }

    // ===== 风格统一工具 =====
    // 为任何生图 prompt 追加统一的艺术风格后缀
    App.appendArtStyle = function(prompt) {
        const style = state.story?.artStyle || 'anime';
        const styleSuffixes = {
            'anime': ', high quality anime style, cel shading, vibrant colors',
            'watercolor': ', watercolor painting style, soft washes, transparent layers, artistic',
            'oil painting': ', oil painting style, rich textures, impasto brushstrokes, classical',
            'digital realism': ', digital painting, photorealistic, highly detailed, cinematic lighting',
            'pencil sketch': ', pencil sketch style, graphite drawing, crosshatching, monochrome',
            'comic book': ', comic book style, bold outlines, halftone dots, graphic novel art'
        };
        return prompt + (styleSuffixes[style] || styleSuffixes['anime']);
    }

    // ===== 头像生图安全处理 =====
    // 清洗 prompt 中的敏感词，避免触发 Agnes AI 内容过滤
    App.sanitizeImagePrompt = function(prompt, character) {
        // 移除常见触发过滤的词汇
        let cleaned = prompt
            .replace(/\bbusty\b/gi, 'well-proportioned')
            .replace(/\bsensual\b/gi, 'attractive')
            .replace(/\berotic\b/gi, 'beautiful')
            .replace(/\bnude\b/gi, 'casually dressed')
            .replace(/\bsemi-nude\b/gi, 'lightly dressed')
            .replace(/\bsexy\b/gi, 'attractive')
            .replace(/\bseductive\b/gi, 'charming')
            .replace(/\bfetish\b/gi, '')
            .replace(/\badult content\b/gi, '')
            .replace(/\bexplicit\b/gi, '')
            .replace(/\bpin-up\b/gi, '')
            .replace(/\bNSFW\b/gi, '')
            .replace(/\bflesh-toned\b/gi, 'light-colored')
            .replace(/\bunderwear\b/gi, 'clothing')
            .replace(/\blingerie\b/gi, 'casual wear');

        // 追加角色正面描述（不含风格词，风格由 appendArtStyle 统一追加）
        if (character && character.appearance) {
            cleaned += `, portrait of ${character.name}, ${character.age} years old, wearing ${character.appearance}, clean background, professional character design`;
        }

        // 统一追加艺术风格
        return App.appendArtStyle(cleaned.trim());
    }

    // 备用 prompt：当主 prompt 被拒绝时，使用更安全的通用描述
    App.buildBackupPrompt = function(character) {
        let gender = 'young person';
        if (character.gender === '男') gender = 'young man';
        else if (character.gender === '女') gender = 'young woman';
        else if (character.appearance) {
            if (/男|男人|男子|先生|他/.test(character.appearance)) gender = 'young man';
            else if (/女|女人|女子|女士|她/.test(character.appearance)) gender = 'young woman';
        }
        return `Character portrait, ${gender}, ${character.age || 20} years old, friendly expression, clean simple background, soft lighting, detailed character design, professional concept art`;
    }

    App.generateCharacterFace = async function(character, imagePrompt) {
        if (!character || !character.name) {
            throw new Error('无效的角色对象，无法生成头像');
        }
        console.log('开始生成头像:', character.name, imagePrompt.slice(0, 100));

        // 对 prompt 做安全清洗，避免触发内容过滤
        const safePrompt = App.sanitizeImagePrompt(imagePrompt, character);
        console.log('清洗后的生图 prompt:', safePrompt.slice(0, 150));

        let imageUrl;
        try {
            imageUrl = await App.agnesImageGen(safePrompt);
        } catch (e) {
            console.warn('生图失败，尝试使用备用 prompt:', e.message);
            // 失败后用基于角色信息的备用 prompt 重试
            const backupPrompt = App.buildBackupPrompt(character);
            console.log('备用 prompt:', backupPrompt.slice(0, 150));
            imageUrl = await App.agnesImageGen(backupPrompt);
        }

        console.log('头像生成成功:', character.name, imageUrl.slice(0, 80));
        if (!imageUrl) {
            throw new Error('未获取到图片 URL');
        }

        character.faceImageUrl = imageUrl;
        await saveState();

        // 发送头像消息
        state.messages.push({
            id: 'msg_face_' + Date.now(),
            role: 'char',
            type: 'image',
            content: imageUrl,
            caption: `${character.name} 的角色形象`,
            charIndex: state.characters.indexOf(character),
            timestamp: new Date().toISOString()
        });
        renderMessage(state.messages[state.messages.length - 1]);
        await saveMessages();

        addSystemMessage('角色头像生成完成');
    }

    // ===== 场景图生成系统 =====
    // 从角色回复中解析 {场景} 描述
    App.parseSceneFromReply = function(reply) {
        // 匹配 {场景描述} 格式
        const match = reply.match(/\{([^}]+)\}/);
        return match ? match[1].trim() : null;
    }

    // 判断当前场景是否发生变化（决定是否生图）
    App.isSceneChanged = function(charName, sceneDesc) {
        if (!sceneDesc) return false;
        const history = state.sceneHistory || [];
        const lastEntry = history[history.length - 1];
        if (!lastEntry || lastEntry.charName !== charName) return true;
        // 场景描述不同即为新场景
        return lastEntry.sceneDesc !== sceneDesc;
    }

    // 将场景描述转为生图 prompt（英文，适合 Agnes AI）
    App.sceneToImagePrompt = function(sceneDesc, character, worldview) {
        // 只描述场景，不重写角色五官（参考图会锁定面部）
        let base = `Cinematic scene illustration: ${sceneDesc}. ${worldview ? 'World setting: ' + worldview : ''}. High quality, detailed lighting, atmospheric.`;
        return App.appendArtStyle(base);
    }

    // 获取当前活跃角色的头像 URL（用于 img2img 参考图）
    App.getActiveCharacterFaceUrl = function() {
        const activeChar = state.characters[state.activeCharIndex];
        if (activeChar && activeChar.faceImageUrl) {
            return activeChar.faceImageUrl;
        }
        return null;
    }

    // 生成并插入场景图消息（支持 img2img 参考图）
    App.generateSceneImage = async function(charName, sceneDesc, charObj) {
        if (!sceneDesc) return;
        const apiKey = state.apiKeys.image;
        if (!apiKey) {
            console.warn('生图 API Key 未配置，跳过场景图生成');
            return;
        }

        console.log('开始生成场景图:', charName, sceneDesc.slice(0, 80));
        addSystemMessage('🎬 正在绘制场景...');

        try {
            const worldview = state.story?.worldview || '';
            const prompt = App.sceneToImagePrompt(sceneDesc, charObj, worldview);

            // 构建请求体
            const requestBody = {
                model: 'agnes-image-2.1-flash',
                prompt: prompt,
                size: '1024x768',
                n: 1,
                extra_body: { response_format: 'url' }
            };

            // 如果有角色头像，作为 img2img 参考图传入
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

            // 插入场景图消息
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

            // 更新场景历史
            if (!state.sceneHistory) state.sceneHistory = [];
            state.sceneHistory.push({
                charName: charName,
                sceneDesc: sceneDesc,
                imageUrl: imgUrl,
                timestamp: new Date().toISOString()
            });
            await saveState();

            // 移除系统提示
            const sysMsg = document.getElementById('typing-indicator') || 
                           [...document.querySelectorAll('.msg.system')].pop();
            // 清理"正在绘制场景"系统消息
            const typingEl = document.getElementById('scene-gen-status');
            if (typingEl) typingEl.remove();

        } catch (err) {
            console.warn('场景图生成异常:', err.message);
        }
    }

    // 在角色回复后添加场景图生成状态标记
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
