// === Section: 图片 API 封装 ===
// === 生图失败类型分类 ===
// 根据 API 响应判断失败原因，用于前端消息展示
App.classifyImageError = function(statusCode, errorMessage) {
    const msg = (errorMessage || '').toLowerCase();
    
    // 超时 (AbortSignal.timeout)
    if (msg.includes('abort') || msg.includes('timed out') || msg.includes('network_error') || msg.includes('failed to fetch')) {
        return {
            type: 'timeout',
            emoji: '⏱️',
            title: '生图超时',
            detail: '请求超过 120 秒未响应，可能是服务器繁忙或网络问题。请重试。'
        };
    }
    
    // 400 内容审核拦截
    if (statusCode === 400 && (msg.includes('content policy') || msg.includes('unable to generate') || msg.includes('safety') || msg.includes('filtered'))) {
        return {
            type: 'policy',
            emoji: '🚫',
            title: '触发内容审核',
            detail: '提示词中包含被审核系统拦截的内容，请尝试修改场景描述后重试。'
        };
    }
    
    // 400 其他客户端错误
    if (statusCode === 400) {
        return {
            type: 'client_error',
            emoji: '❌',
            title: '生图参数错误',
            detail: '提示词格式不符合要求，请检查后重试。'
        };
    }
    
    // 429 限流
    if (statusCode === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
        return {
            type: 'rate_limit',
            emoji: '🐌',
            title: '请求过于频繁',
            detail: 'API 限流中，请稍后再试。'
        };
    }
    
    // 503 + queue full / service busy — 排队中
    if ((msg.includes('queue is full') || msg.includes('retry later') || msg.includes('service busy')) && statusCode === 503) {
        return {
            type: 'queue_full',
            emoji: '📋',
            title: '生图队列已满',
            detail: '当前排队人数较多，请稍后再试。建议等待 1-2 分钟后重试。'
        };
    }
    
    // 5xx 服务端错误
    if (statusCode >= 500) {
        return {
            type: 'server_error',
            emoji: '⚠️',
            title: '服务器错误',
            detail: '生图服务暂时不可用，请稍后重试。'
        };
    }
    
    // 默认未知错误
    return {
        type: 'unknown',
        emoji: '❓',
        title: '生图失败',
        detail: `错误信息: ${errorMessage || '未知原因'}`
    };
};

// 生图 API 调用 + prompt 清洗 + 风格后缀 + 模块化三级降级

// 艺术风格后缀映射（27 个细分关键词，4 大板块，无歧义无重叠）
// 绘图 prompt 使用完整细分词；后端标注标签仍可用 18 个固定词
App.artStyleSuffixes = {
    // 默认/兜底风格
    'cel shaded anime style': ', cel shaded anime style, clean line art, vibrant colors, professional character design',
    // === 一、动画风格 ===
    '00s josei cel anime': ', 2000s Josei cel anime, soft gradients, macaron pastel color palette, romantic shojo aesthetic',
    'modern moe cel anime': ', modern moe cel anime, glossy skin highlights, oversized bright eyes, soft outlines, contemporary shounen aesthetic',
    'y2k anime': ', Y2K anime aesthetic, high saturation fluorescent colors, retro digital filter, early 2000s anime style',
    'seinen cel anime': ', seinen cel anime, low contrast realistic facial features, muted沉稳 tones, mature aesthetic',
    'three-tone cel shading': ', three-tone cel shading, minimal three-color flat colors, no gradients, clean unified aesthetic',
    // === 二、漫画风格 ===
    'shoujo manga': ', shoujo manga style, black and white gradient screentones, highlighted eye makeup,纤细 fine lines',
    'horror manga': ', horror manga style, broken fragmented lines, large areas of solid black, distorted facial features, Japanese horror aesthetic',
    // === 三、3D 卡通 ===
    'blender lowpoly cartoon render': ', Blender low-poly cartoon 3D render, geometric faceted surfaces, flat color shading, voxel aesthetic',
    'anime toon 3d render': ', anime toon 3D render, cel-shaded 3D, simulating hand-drawn cel animation texture',
    'clay figure render': ', clay figure 3D render, matte plush clay texture, stop-motion figurine aesthetic',
    'miniature diorama render': ', miniature diorama render, shallow depth of field, physical miniature model texture, tilt-shift aesthetic',
    'chibi super deformed 3d': ', chibi super-deformed 3D, two-head proportion, oversized head tiny body, simplified structure, cute 3D aesthetic',
    // === 四、通用美术&潮流 ===
    'transparent watercolor wash': ', transparent watercolor wash, luminous bleeding edges, negative space留白, no heavy pigment buildup',
    'heavy oil painting texture': ', heavy oil painting texture, thick impasto brushstrokes, canvas grain, classical painting aesthetic',
    'digital thick paint illustration': ', digital thick paint illustration, layered blending, soft dark-light transitions, digital painting aesthetic',
    'graphite pencil sketch': ', graphite pencil sketch, paper grain texture, soft hatching grayscale, monochrome drawing',
    'chinese ink wash painting': ', Chinese ink wash painting, sumi-e brushwork, ink density gradation, negative space, traditional scroll aesthetic',
    'hard line ink line art': ', hard line ink line art, pure ink outlines, no coloring, single-color crisp contours',
    'neon cyberpunk illustration': ', neon cyberpunk illustration, cold blue and magenta neon, rainy metal cityscape, futuristic dystopian aesthetic',
    'vaporwave retro 80s art': ', vaporwave retro 80s art, pink-cyan gradients, retro electronic glitch textures, nostalgic aesthetic',
    'dark gothic fantasy illustration': ', dark gothic fantasy illustration, deep dark low saturation, vintage ornate carvings, gothic horror aesthetic',
    'flat vector minimal illustration': ', flat vector minimal illustration, no gradients, solid color geometric shapes, minimalist design',
    'pixel art 16bit retro game': ', 16-bit pixel art retro game, blocky pixel grid, retro NES/SNES aesthetic',
    'unreal engine photoreal PBR': ', Unreal Engine photorealistic PBR, physically accurate materials and lighting, cinematic photo-realism',
    'pop art screen print': ', pop art screen print, solid color flat areas, thick black outlines, high contrast Warhol aesthetic',
};

// 获取当前艺术风格后缀
// 注意：灵感检测到的风格即使不在预设选项中，也直接作为后缀使用（不做转译/映射）
App.getArtStyleSuffix = function() {
    const style = state.story?.imageStyle || state.story?.artStyle || 'cel shaded anime style';
    if (App.artStyleSuffixes[style]) {
        return App.artStyleSuffixes[style];
    }
    // 未知风格：直接作为后缀追加（不转译为预设风格）
    return `, ${style} style`;
};

// 拼接风格后缀到 prompt
App.appendArtStyle = function(prompt) {
    return prompt + App.getArtStyleSuffix();
};

// 构建模块化生图 prompt（按降级级别组合）
// 注意：imageStyle 字段由 LLM 填充但经常出错，统一使用 state.story.imageStyle 作为全局风格
// level 0: 全身 (face+hair+body+clothes+environment) → 从头到脚全身
// level 1: 半身 (face+hair+body+clothes) → 腰部以上半身
// level 2: 特写 (face+hair) → 面部特写到锁骨
// actionText: 可选，序章中的角色动作描写，注入到 pose/framing 提示词
App.buildModularPrompt = function(character, level, actionText) {
    const parts = [];
    const mods = character.__modules__ || {};

    // 一级/二级：只用 imageFace + imageHair（面部特写）
    // 零级/一级（全身/半身）：face + hair + body + clothes + environment
    const include = {
        imageFace: true,
        imageHair: true,
        imageBody: level <= 1 && mods.imageBody,
        imageClothes: level <= 1 && mods.imageClothes,
        imageEnvironment: level <= 1 && mods.imageEnvironment
    };

    // 不再使用 LLM 填的 mods.imageStyle（经常填错），直接用全局风格
    if (include.imageFace && mods.imageFace) parts.push(mods.imageFace);
    if (include.imageHair && mods.imageHair) parts.push(mods.imageHair);
    if (include.imageBody && mods.imageBody) parts.push(mods.imageBody);
    if (include.imageClothes && mods.imageClothes) parts.push(mods.imageClothes);
    if (include.imageEnvironment && mods.imageEnvironment) parts.push(mods.imageEnvironment);

    let base = parts.join(', ');
    if (!base) base = 'character portrait';

    // 追加角色信息 + 分级 framing 提示词
    let genderStr = 'male';
    if (character.gender === '男') genderStr = 'male';
    else if (character.gender === '女') genderStr = 'female';
    base += `, ${character.name || 'character'}, ${character.age || 20} years old, ${genderStr}`;

    if (level === 2) {
        // 一阶段面部特写：仅用脸型五官发型妆扮，精确约束
        base += ', front view, head and neck framing, shoulder contour visible, calm natural expression, soft even diffused lighting, character reference sheet style, high detail, high quality, moderate framing, tasteful composition, implicit and non-explicit content';
    } else {
        // 二阶段全身/半身：强调与一阶段面部特写参考图保持一致性
        // 去掉可能与一致性产生冲突的提示词（如表情、光影、构图等），由参考图承担面部特征
        base += ', consistent facial features with character reference, matching face shape and hairstyle and makeup, ';
        if (level === 0) {
            base += 'full body shot from head to toe, ';
        } else {
            base += 'medium shot from waist up, ';
        }
        // 注入序章动作描写到 pose 提示词
        if (actionText) {
            base += `${actionText}, `;
        }
        if (level === 0) {
            base += 'complete figure';
        } else {
            base += 'upper body portrait';
        }
    }

    return App.appendArtStyle(base.trim());
};

// 从角色对象中提取模块化字段
// 注意：imageStyle 已从角色数据移除，统一使用 state.story.imageStyle
App.extractModules = function(character) {
    if (character.__modules__) return character.__modules__;
    const mods = {};
    if (character.imageFace) mods.imageFace = character.imageFace;
    if (character.imageHair) mods.imageHair = character.imageHair;
    if (character.imageBody) mods.imageBody = character.imageBody;
    if (character.imageClothes) mods.imageClothes = character.imageClothes;
    if (character.imageEnvironment) mods.imageEnvironment = character.imageEnvironment;
    character.__modules__ = mods;
    return mods;
};

// 旧版：清洗 prompt → 追加角色信息 → 追加风格
App.sanitizeImagePrompt = function(prompt, character) {
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

    if (character && character.appearance) {
        let genderStr = '';
        if (character.gender === '男') genderStr = 'male ';
        else if (character.gender === '女') genderStr = 'female ';
        cleaned += `, ${character.name}, ${character.age} years old, ${genderStr}wearing ${character.appearance}`;
    }

    return App.appendArtStyle(cleaned.trim());
};

// 备用 prompt（最后兜底）
App.buildBackupPrompt = function(character) {
    let gender = 'young person';
    if (character.gender === '男') gender = 'young man';
    else if (character.gender === '女') gender = 'young woman';
    else if (character.appearance) {
        if (/男|男人|男子|先生|他/.test(character.appearance)) gender = 'young man';
        else if (/女|女人|女子|女士|她/.test(character.appearance)) gender = 'young woman';
    }
    return `Character portrait, ${gender}, ${character.age || 20} years old, friendly expression, soft lighting, detailed character design, professional concept art` + App.getArtStyleSuffix();
};

// === 仅面部特写生成（不等序章，角色生成完立即调用） ===
// 只用 imageFace + imageHair，不依赖序章动作描写
App.generateCharacterFaceOnly = async function(character) {
    if (!character || !character.name) {
        return null;
    }

    const mods = App.extractModules(character);
    const hasModules = mods.imageFace || mods.imageHair;
    if (!hasModules) {
        rpLog('warn', 'IMG', `角色 ${character.name} 无面部模块数据，跳过面部特写`);
        return null;
    }

    rpLog('info', 'IMG', `📷 面部特写: ${character.name}`);
    const facePrompt = App.buildModularPrompt(character, 2); // level 2 = 特写
    rpLog('debug', 'IMG', `面部特写 Prompt: ${facePrompt.slice(0, 150)}...`);

    const faceModels = ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'];
    let faceImageUrl;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const model = faceModels[attempt % faceModels.length];
            rpLog('info', 'IMG', `面部特写尝试 ${attempt + 1}/3 (model=${model}): ${character.name}`);
            faceImageUrl = await App.agnesImageGen(facePrompt, '256x341', model);
            rpLog('info', 'IMG', `✅ 面部特写生成成功: ${character.name}`);
            character.faceImageUrl = faceImageUrl;
            await saveState();
            return faceImageUrl;
        } catch (e) {
            rpLog('warn', 'IMG', `面部特写失败 (尝试 ${attempt + 1}/3): ${e.message}`);
            if (attempt === 2) {
                rpLog('error', 'IMG', `面部特写全部重试失败: ${character.name}`);
            }
        }
    }
    return null;
};

// 两阶段生图：一阶段面部特写（无降级）→ 二阶段全身/半身（三级降级）
// 新流程：先生成面部特写（level 2），再用 img2img 从特写生成全身/半身
// actionText: 可选，序章中的角色动作描写，注入到全身/半身 prompt 的 pose 中
// skipFace: 如果为 true，跳过面部特写生成（假设已存在），直接做全身/半身
App.generateCharacterImage = async function(character, actionText, skipFace) {
    if (!character || !character.name) {
        throw new Error('无效的角色对象，无法生成图片');
    }

    // 提取模块化字段
    const mods = App.extractModules(character);

    // 检查是否有模块化数据
    const hasModules = mods.imageFace || mods.imageHair || mods.imageBody || mods.imageClothes || mods.imageEnvironment;

    let imageUrl;
    let faceImageUrl = null;

    if (hasModules) {
        // === 第一步：面部特写（除非 skipFace=true 且已有 faceImageUrl） ===
        if (skipFace && character.faceImageUrl) {
            rpLog('info', 'IMG', `⏭️ 面部特写已存在，跳过: ${character.name}`);
            faceImageUrl = character.faceImageUrl;
        } else {
            rpLog('info', 'IMG', `📷 第一步：生成面部特写: ${character.name}`);
            const facePrompt = App.buildModularPrompt(character, 2); // level 2 = 特写
            rpLog('debug', 'IMG', `面部特写 Prompt: ${facePrompt.slice(0, 150)}...`);
            
            const faceModels = ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'];
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const model = faceModels[attempt % faceModels.length];
                    rpLog('info', 'IMG', `面部特写尝试 ${attempt + 1}/3 (model=${model}): ${character.name}`);
                    faceImageUrl = await App.agnesImageGen(facePrompt, '256x341', model);
                    rpLog('info', 'IMG', `✅ 面部特写生成成功: ${character.name}`);
                    character.faceImageUrl = faceImageUrl;
                    await saveState();
                    break;
                } catch (e) {
                    rpLog('warn', 'IMG', `面部特写失败 (尝试 ${attempt + 1}/3): ${e.message}`);
                    if (attempt === 2) {
                        rpLog('error', 'IMG', `面部特写全部重试失败: ${character.name}`);
                    }
                }
            }
        }

        // === 第二步：从面部特写出发，三级降级生成全身/半身 ===
        const levels = [
            { name: '全身', level: 0 },
            { name: '半身', level: 1 }
        ];

        for (const tier of levels) {
            try {
                rpLog('info', 'IMG', `第二步: 尝试 ${tier.name} 生图（基于面部特写）: ${character.name}`);
                const prompt = App.buildModularPrompt(character, tier.level, actionText);
                
                // 如果有面部特写，用 img2img 确保面部一致性
                if (faceImageUrl) {
                    imageUrl = await App.agnesImageGenWithRefImg(prompt, faceImageUrl);
                } else {
                    imageUrl = await App.agnesImageGen(prompt);
                }
                
                if (imageUrl) {
                    rpLog('info', 'IMG', `${tier.name} 生成成功: ${character.name}`);
                    character.portraitImageUrl = imageUrl;
                    await saveState();
                    return imageUrl;
                }
            } catch (e) {
                rpLog('warn', 'IMG', `${tier.name} 失败 (${e.message})`);
            }
        }

        // 模块化全部失败，走备用
        rpLog('warn', 'IMG', `模块化全部失败，使用备用 prompt: ${character.name}`);
    }

    // 兜底：旧版 sanitize 流程
    try {
        const oldPrompt = character.imagePrompt || '';
        if (oldPrompt) {
            const sanitized = App.sanitizeImagePrompt(oldPrompt, character);
            imageUrl = await App.agnesImageGen(sanitized);
            if (imageUrl) return imageUrl;
        }
    } catch (e) {
        rpLog('warn', 'IMG', `旧版 prompt 失败: ${e.message}`);
    }

    // 最终兜底：buildBackupPrompt
    rpLog('info', 'IMG', '使用最终备用 prompt: ' + character.name);
    const backup = App.buildBackupPrompt(character);
    rpLog('debug', 'IMG', `Backup prompt: ${backup.slice(0, 120)}...`);
    imageUrl = await App.agnesImageGen(backup);
    if (!imageUrl) throw new Error('所有生图方式均失败');
    return imageUrl;
};

// 旧接口：generateCharacterFace（向后兼容，内部调用 generateCharacterImage）
App.generateCharacterFace = async function(character, imagePrompt) {
    if (!character || !character.name) {
        throw new Error('无效的角色对象，无法生成头像');
    }
    console.log('开始生成头像:', character.name, imagePrompt?.slice(0, 100) || 'modular');

    const imageUrl = await App.generateCharacterImage(character);

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
};

// 静默版（并行时使用）
App.generateCharacterFaceSilent = async function(character, imagePrompt) {
    if (!character || !character.name) {
        return null;
    }
    console.log('[并行] 开始生成头像:', character.name);

    try {
        const imageUrl = await App.generateCharacterImage(character);
        if (!imageUrl) {
            console.error('[并行] 头像生成失败:', character.name);
            return null;
        }
        character.faceImageUrl = imageUrl;
        character.portraitImageUrl = imageUrl;
        await saveState();

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

        console.log('[并行] 头像生成成功:', character.name);
        return imageUrl;
    } catch (e) {
        console.warn('[并行] 头像生成失败:', character.name, e.message);
        return null;
    }
};

// 生成主角头像
App.generatePlayerAvatar = async function() {
    const gender = state.player?.gender || '男';
    const pw = gender === '男' ? 'young man' : 'young woman';
    const appearance = gender === '男' ? 'handsome, sharp features' : 'beautiful, delicate features';
    const artStyle = state.story?.imageStyle || 'cel shaded anime style';
    const styleSuffix = App.artStyleSuffixes[artStyle] || App.artStyleSuffixes['cel shaded anime style'];
    const prompt = `Portrait of ${pw}, ${appearance}, modern casual clothing, professional character concept art, detailed facial features${styleSuffix}`;

    console.log(`[主角] 开始生成头像 (性别: ${gender})`);

    try {
        const imageUrl = await App.agnesImageGen(prompt);
        if (!imageUrl) {
            console.error('[主角] 头像生成失败');
            return null;
        }
        state.player.faceImageUrl = imageUrl;
        await saveState();
        console.log('[主角] 头像生成成功:', imageUrl.slice(0, 80));
        return imageUrl;
    } catch (e) {
        console.warn('[主角] 头像生成失败:', e.message);
        return null;
    }
};

// === 统一生图入口 ===
// 所有生图调用都应通过此方法，自动处理模型降级
// 降级策略：agnes-image-2.1-flash → 超时/失败 → agnes-image-2.0-flash
// 支持文生图（t2i）和图生图（img2img）两种模式
App.agnesImageGenerate = async function(options) {
    const {
        prompt,           // 文本提示词（必填）
        refImages = [],   // 参考图 URL 数组（可选，非空则走 img2img 模式）
        size = '1K', // 图片尺寸（2.1 档位：1K/2K/3K/4K，或兼容旧的精确像素）
        ratio,            // 宽高比（2.1 档位：1:1, 3:4, 4:3, 16:9, 9:16, 2:3, 3:2, 21:9）
        model = 'agnes-image-2.1-flash', // 首选模型
        timeoutMs = 120000, // 超时时间（毫秒）
        label = 'image'     // 日志标签
    } = options;

    // ⭐ 所有生图都需要等 styleAnchor 就绪
    let effectivePrompt = prompt;
    if (label !== 'style_anchor' && typeof App.awaitStyleReady === 'function') {
        await App.awaitStyleReady();
        // 将 prompt 中的占位符替换为真正的 styleAnchor
        if (typeof App.resolveStyleInPrompt === 'function') {
            effectivePrompt = App.resolveStyleInPrompt(prompt);
        }
    }

    const apiKey = state.apiKeys.chat;
    if (!apiKey) {
        throw new Error('未配置 API Key');
    }

    // 模型降级列表
    const modelFallbacks = [model, 'agnes-image-2.0-flash'];
    let lastError = null;

    for (let attempt = 0; attempt < modelFallbacks.length; attempt++) {
        const currentModel = modelFallbacks[attempt];
        if (attempt > 0) {
            rpLog('warn', 'IMG', `⬇️ ${label} 降级到 ${currentModel} (尝试 ${attempt + 1}/${modelFallbacks.length})`);
        }

        try {
            const requestBody = {
                model: currentModel,
                prompt: effectivePrompt,
                size: size,
                n: 1,
                extra_body: { response_format: 'url' }
            };

            // 2.1 档位式宽高比
            if (ratio) {
                requestBody.ratio = ratio;
            }

            // img2img 模式：加入参考图
            if (refImages && refImages.length > 0) {
                requestBody.extra_body.image = refImages;
            }

            rpLog('info', 'TIMEOUT', `生图请求开始: ${label}${attempt > 0 ? ' (降级)' : ''}`);
            const imgStart = Date.now();

            const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(timeoutMs)
            });

            const imgElapsed = Date.now() - imgStart;
            rpLog('info', 'TIMEOUT', `生图请求完成: ${label}, 耗时 ${imgElapsed}ms, status=${resp.status}`);

            if (!resp.ok) {
                let errMsg = `生图错误 (${resp.status})`;
                let errorDetail = null;
                try {
                    const errData = await resp.json();
                    errMsg = errData.error?.message || errData.message || errMsg;
                    errorDetail = { statusCode: resp.status, message: errMsg };
                } catch(e) {
                    errMsg = `生图错误 (${resp.status}): ${await resp.text()}`;
                    errorDetail = { statusCode: resp.status, message: errMsg };
                }
                rpLog('warn', 'IMG', `${label} 失败 (${currentModel}): ${errMsg}`);
                const classified = App.classifyImageError(resp.status, errMsg);
                rpLog('info', 'IMG', `  失败类型: ${classified.type} - ${classified.title}`);
                lastError = Object.assign(new Error(`${classified.emoji} ${classified.title}: ${classified.detail}`), {
                    _errorClassified: true,
                    _errorType: classified.type,
                    _errorDetail: errorDetail
                });
                continue; // 尝试降级模型
            }

            const data = await resp.json();
            const imgUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json || '';
            if (!imgUrl) {
                rpLog('warn', 'IMG', `${label} 返回数据异常 (${currentModel})`);
                lastError = new Error('未获取到图片 URL，API 返回格式异常');
                continue;
            }

            rpLog('info', 'IMG', `✅ ${label} 成功 (${currentModel}): ${imgUrl.slice(0, 80)}`);
            return imgUrl;

        } catch (err) {
            // 超时或其他网络错误
            rpLog('warn', 'IMG', `${label} 异常 (${currentModel}): ${err.message}`);
            const classified = App.classifyImageError(0, err.message);
            rpLog('info', 'IMG', `  失败类型: ${classified.type} - ${classified.title}`);
            lastError = Object.assign(new Error(`${classified.emoji} ${classified.title}: ${classified.detail}`), {
                _errorClassified: true,
                _errorType: classified.type
            });
            continue; // 尝试降级模型
        }
    }

    // 所有模型都失败了
    rpLog('error', 'IMG', `❌ ${label} 全部失败: ${lastError?.message}`);
    if (lastError && lastError._errorType) {
        rpLog('error', 'IMG', `  最终失败类型: ${lastError._errorType}`);
    }
    throw lastError;
};

// 生图 API 调用（旧接口，内部调用统一入口）
App.agnesImageGen = async function(prompt, size = '256x341', model) {
    return App.agnesImageGenerate({
        prompt, size, model, label: 't2i'
    });
};

// img2img 变体（旧接口，内部调用统一入口）
App.agnesImageGenWithRefImg = async function(prompt, faceImageUrl, size = '256x341') {
    return App.agnesImageGenerate({
        prompt, size, refImages: [faceImageUrl], label: 'img2img'
    });
};
