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

// === 场景 → 生图 prompt (LLM 智能体模式) ===
// 输入中文场景描述+角色信息，输出符合 Agnes AI 要求的英文 prompt
App.buildSceneImagePrompt = async function(sceneDesc, character, worldview, allCharacters, replyText) {
    // 1. 准备结构化输入数据
    const inputParts = [];
    
    // 环境描述
    if (sceneDesc) {
        let envClean = sceneDesc
            .replace(/["""""]'/g, '')
            .replace(/\([^)]*\)/g, '')
            .trim();
        if (envClean) {
            inputParts.push(`场景环境: ${envClean}`);
        }
    }
    
    // 当前角色信息
    if (character) {
        let charInfo = `当前角色: ${character.name}`;
        if (character.appearance) charInfo += `, 外貌: ${character.appearance}`;
        if (character.gender) charInfo += `, 性别: ${character.gender}`;
        inputParts.push(charInfo);
    }
    
    // 从 replyText 解析动作
    if (replyText && character) {
        const cleaned = replyText.replace(/\{[^}]+\}/, '').replace(/<[^>]+>$/, '').trim();
        const actionPattern = new RegExp(`${character.name}[^\\s|:：]{0,10}[:：]\\(([^)]+)\\)`);
        const am = cleaned.match(actionPattern);
        if (am && am[1]) {
            inputParts.push(`当前角色动作: ${am[1]}`);
        }
    }
    
    // 其他在场角色
    if (allCharacters && allCharacters.length > 1) {
        const others = allCharacters.filter(c => c.name !== character?.name);
        if (others.length > 0) {
            const otherInfos = others.map((c, i) => {
                let info = `${i + 1}. ${c.name}`;
                if (c.appearance) info += `, 外貌: ${c.appearance}`;
                return info;
            });
            inputParts.push(`其他在场角色: ${otherInfos.join('；')}`);
        }
    }
    
    // 世界观氛围
    if (worldview) {
        inputParts.push(`世界观氛围: ${worldview}`);
    }
    
    const sceneInput = inputParts.join('\n');
    
    // 2. 构建提示词生成系统提示词
    const systemPrompt = `你是一个专业的 AI 绘图 prompt 工程师。你的任务是将中文场景描述转换为适合 Agnes AI 图像生成模型的英文 prompt。

## 核心规则
1. **必须输出纯英文**，不要包含任何中文
2. **必须包含**：场景环境、角色外貌特征、角色动作/姿态
3. **必须包含**：画面风格（根据世界观推断）、光影氛围、构图
4. **必须添加**质量约束词：high quality, detailed lighting, cinematic composition, atmospheric
5. **必须添加**背景约束：Background should be clean or blurred, focus on main characters
6. **必须添加**审核安全词：modest clothing, tasteful composition, non-explicit content
7. **禁止**：完全裸露描述、过度暴露的衣物、性暗示词汇
8. **必须**包含服装描述（至少 casual clothing 或 appropriate attire）
9. 长度控制在 150-300 个英文单词之间
10. 使用逗号分隔的短语格式，不是完整句子

## 输出格式
只输出一个完整的英文 prompt 字符串，不要加引号、不要解释、不要 markdown 格式。

## 示例输出
A cyberpunk underground city with neon signs reflecting off wet pavement, sulfur smell in the air, massive holographic billboards flickering above. A young man with silver messy hair stands at an abandoned subway entrance, his left eye glowing red from a cybernetic implant, neural interface scars visible on his face, thin but tall build, wearing a worn leather jacket over dark clothes, looking up at the holographic displays with a thoughtful expression. Cinematic low-angle shot, moody blue and orange lighting, rain-soaked atmosphere, shallow depth of field focusing on the character. High quality, detailed lighting, cinematic composition, atmospheric. Background blurred, focus on main character. Modest clothing, tasteful composition.

现在请转换以下场景：`;

    // 3. 调用 LLM
    try {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: sceneInput }
        ];
        
        rpLog('info', 'SCENE', `🤖 调用提示词生成智能体...`);
        rpLog('debug', 'SCENE', `输入数据: ${sceneInput.slice(0, 200)}...`);
        
        const rawPrompt = await App.agnesChat(messages, { route: 'default', temperature: 0.3 });
        
        // 清洗：去掉可能的 markdown 和多余空白
        let cleanedPrompt = rawPrompt
            .replace(/^```[\s\S]*?\n/, '')
            .replace(/```$/, '')
            .replace(/^["']|["']$/g, '')
            .trim();
        
        // 追加风格后缀
        const finalPrompt = App.appendArtStyle(cleanedPrompt);
        
        rpLog('info', 'SCENE', `✅ 提示词生成成功 (${finalPrompt.length}字)`);
        rpLog('debug', 'SCENE', `生成 prompt: ${finalPrompt.slice(0, 200)}...`);
        
        return finalPrompt;
        
    } catch (err) {
        rpLog('warn', 'SCENE', `⚠️ 提示词生成智能体失败: ${err.message}，使用降级方案`);
        // 降级：直接拼接英文模板
        return App._fallbackScenePrompt(sceneDesc, character, allCharacters, replyText);
    }
};

// 降级方案：纯字符串拼接（当 LLM 不可用时）
App._fallbackScenePrompt = function(sceneDesc, character, allCharacters, replyText) {
    // 简单的 ASCII 过滤（保留基础标点）
    function keepAscii(text) {
        if (!text) return '';
        return text.split('').filter(c => c.charCodeAt(0) < 128).join('');
    }
    
    let base = 'Cinematic scene illustration.';
    
    if (sceneDesc) {
        let env = keepAscii(sceneDesc.replace(/["""""]'/g, '').replace(/\([^)]*\)/g, ''));
        if (env.length > 10) {
            base += ` ${env}.`;
        }
    }
    
    if (character) {
        let name = keepAscii(character.name || 'character');
        let charDesc = `${name} is present in the scene`;
        let appearance = keepAscii(character.appearance || '');
        if (appearance) charDesc += `, ${appearance}`;
        else charDesc += ', wearing casual clothing';
        
        if (replyText) {
            const cleaned = replyText.replace(/\{[^}]+\}/, '').replace(/<[^>]+>$/, '').trim();
            const actionPattern = new RegExp(`${keepAscii(character.name)}[^\\s|:：]{0,10}[:：]\\(([^)]+)\\)`);
            const am = cleaned.match(actionPattern);
            if (am && am[1]) {
                charDesc += `, doing: ${keepAscii(am[1])}`;
            }
        }
        base += '.' + charDesc;
    }
    
    if (allCharacters && allCharacters.length > 1) {
        const others = allCharacters.filter(c => c.name !== character?.name);
        if (others.length > 0) {
            const otherDescs = others.map((c, i) => {
                let desc = `${i + 1}. ${keepAscii(c.name || 'character')}`;
                let app = keepAscii(c.appearance || '');
                if (app) desc += `, ${app}`;
                else desc += ', wearing casual clothing';
                return desc;
            }).filter(d => d.length > 5);
            if (otherDescs.length > 0) {
                base += ` Characters in scene: ${otherDescs.join(', ')}.`;
            }
        }
    }
    
    base += ' Background: empty or blurred, NO other people clearly visible. High quality, detailed lighting, atmospheric. Modest clothing, tasteful composition, non-explicit content.';
    
    return App.appendArtStyle(base);
};

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
    const charNameSet = new Set((allCharacters || []).map(c => c.name));

    // 第一步：先提取所有「」内的台词内容，标记为已处理区域
    // 这些区域内的任何 "词:" 都不是角色名，是台词的一部分
    const dialogueRegions = [];
    const quotePattern = /「([^」]*)」/g;
    let qm;
    while ((qm = quotePattern.exec(cleaned)) !== null) {
        dialogueRegions.push({ start: qm.index, end: qm.index + qm[0].length });
    }

    // 辅助函数：检查一个位置是否在某个台词区域内
    function isInDialogueRegion(pos) {
        for (const region of dialogueRegions) {
            if (pos >= region.start && pos < region.end) return true;
        }
        return false;
    }

    // 第二步：匹配 角色名:(动作) 或 角色名:对话
    // 但跳过位于「」台词区域内的匹配
    const namePattern = /([^\s|:：]{1,10})[:：](?!\s*\()/g;
    let nm;
    while ((nm = namePattern.exec(cleaned)) !== null) {
        // 如果匹配位置在台词区域内，跳过
        if (isInDialogueRegion(nm.index)) continue;
        const name = nm[1].trim();
        if (name && /[^\s]/.test(name)) {
            presentNames.add(name);
        }
    }

    // 第三步：也尝试匹配"角色名心想"、"角色名说"等中文引导词模式
    // 格式：角色名 + （心想/思忖/暗想/嘟囔/开口/说道/回答）
    const thoughtPattern = /([^\s「」]{1,10})(?:（心想|（思忖|（暗想|（嘟囔|（开口|（说道|（回答|（轻声|（笑道|（皱眉|（叹气)/g;
    let tm;
    while ((tm = thoughtPattern.exec(cleaned)) !== null) {
        const name = tm[1].trim();
        if (name && /[^\s]/.test(name)) {
            presentNames.add(name);
        }
    }

    // 第四步：也匹配无角色名的 (动作) 开头
    const loneAction = cleaned.match(/^\(([^)]+)\)/);
    if (!loneAction || presentNames.size === 0) {
        // 如果没有解析到命名角色，至少包含当前角色
        if (allCharacters && allCharacters.length > 0) {
            presentNames.add(allCharacters[0].name);
        }
    }

    // 关键验证：只保留在角色列表中实际存在的名字
    // 过滤掉误匹配的文本片段（如"空气凝固。你面临选择"）
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
    const apiKey = state.apiKeys.chat;
    if (!apiKey) {
        rpLog('warn', 'SCENE', '❌ API Key 未配置，跳过');
        return;
    }

    const activeChar = state.characters[state.activeCharIndex];
    const worldview = state.story?.worldview || '';
    rpLog('info', 'SCENE', `活跃角色: ${activeChar?.name || '无'}, 角色数: ${state.characters?.length || 0}`);

    // 调用 LLM 智能体生成英文 prompt（异步）
    const prompt = await App.buildSceneImagePrompt(openingScene, activeChar, worldview, state.characters, replyText);
    rpLog('info', 'SCENE', `✅ 提示词生成完成 (${prompt?.length || 0}字)`);

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
            size: '1K',
            ratio: '9:16',
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
    const apiKey = state.apiKeys.chat;
    if (!apiKey) {
        rpLog('warn', 'SCENE', '❌ API Key 未配置，跳过');
        return;
    }

    try {
        // 调用 LLM 智能体生成英文 prompt（异步）
        const prompt = await App.buildSceneImagePrompt(sceneDesc, charObj, state.story?.worldview || '', state.characters, replyText);
        rpLog('info', 'SCENE', `✅ 提示词生成完成 (${prompt?.length || 0}字)`);

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
            size: '1K',
            ratio: '9:16',
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
