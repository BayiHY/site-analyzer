// === Section: 图片 API 封装 ===
// 生图 API 调用 + prompt 清洗 + 风格后缀 + 模块化三级降级

// 艺术风格后缀映射
App.artStyleSuffixes = {
    'anime': ', high quality anime style, cel shading, vibrant colors',
    'watercolor': ', watercolor painting style, soft washes, transparent layers, artistic',
    'oil painting': ', oil painting style, rich textures, impasto brushstrokes, classical',
    'digital realism': ', digital painting, photorealistic, highly detailed, cinematic lighting',
    'pencil sketch': ', pencil sketch style, graphite drawing, crosshatching, monochrome',
    'comic book': ', comic book style, bold outlines, halftone dots, graphic novel art',
    'photorealistic': ', photorealistic photography, DSLR, natural lighting, 35mm lens, ultra detailed',
    '3D render': ', 3D render, Octane render, ray tracing, subsurface scattering, volumetric lighting',
    'studio ghibli': ', Studio Ghibli style, Hayao Miyazaki inspired, lush backgrounds, whimsical',
    'cyberpunk': ', cyberpunk style, neon lights, futuristic cityscape, dark atmosphere, glowing accents',
    'fantasy art': ', fantasy art, ethereal atmosphere, magical elements, epic composition, painterly',
    'chibi': ', chibi style, cute proportion, big head small body, kawaii, adorable',
    'pixel art': ', pixel art, 16-bit retro game style, dithering, nostalgic',
    'ink wash': ', Chinese ink wash painting, sumi-e, traditional brushwork, flowing lines, monochrome',
    'vaporwave': ', vaporwave aesthetic, pastel colors, retro 80s, glitch art, dreamy atmosphere',
    'dark fantasy': ', dark fantasy, gothic atmosphere, dramatic shadows, moody, mysterious',
    'line art': ', clean line art style, crisp outlines, minimal shading, monochrome line drawing',
    'cel shading': ', cel shading style, flat colors, clean outlines, anime style',
    'concept art': ', concept art style, detailed character design, professional illustration',
    'unreal engine': ', unreal engine style, photorealistic, cinematic lighting, highly detailed',
    'blender cartoon': ', blender 3D cartoon style, smooth rendering, vibrant colors',
    'thick paint': ', thick paint style, impasto technique, rich texture, expressive brushwork',
    'flat design': ', flat design style, minimalist, geometric shapes, solid colors',
};

// 获取当前艺术风格后缀
// 注意：灵感检测到的风格即使不在预设选项中，也直接作为后缀使用（不做转译/映射）
App.getArtStyleSuffix = function() {
    const style = state.story?.imageStyle || state.story?.artStyle || 'anime';
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
App.buildModularPrompt = function(character, level) {
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
            base += 'full body shot from head to toe, standing pose, complete figure';
        } else {
            base += 'medium shot from waist up, upper body portrait';
        }
    }

    return App.appendArtStyle(base.trim());
};

// 从角色对象中提取模块化字段
App.extractModules = function(character) {
    if (character.__modules__) return character.__modules__;
    const mods = {};
    // 新格式：直接字段
    if (character.imageStyle) mods.imageStyle = character.imageStyle;
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

// 两阶段生图：一阶段面部特写（无降级）→ 二阶段全身/半身（三级降级）
// 新流程：先生成面部特写（level 2），再用 img2img 从特写生成全身/半身
App.generateCharacterImage = async function(character) {
    if (!character || !character.name) {
        throw new Error('无效的角色对象，无法生成图片');
    }

    // 提取模块化字段
    const mods = App.extractModules(character);

    // 检查是否有模块化数据
    const hasModules = mods.imageStyle || mods.imageFace || mods.imageHair || mods.imageBody || mods.imageClothes || mods.imageEnvironment;

    let imageUrl;

    if (hasModules) {
        // === 第一步：生成面部特写（一阶段，失败自动用 2.0-flash 重试，最多两次） ===
        rpLog('info', 'IMG', `📷 第一步：生成面部特写: ${character.name}`);
        const facePrompt = App.buildModularPrompt(character, 2); // level 2 = 特写
        rpLog('debug', 'IMG', `面部特写 Prompt: ${facePrompt.slice(0, 150)}...`);
        
        let faceImageUrl;
        const faceModels = ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'];
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const model = faceModels[attempt % faceModels.length];
                rpLog('info', 'IMG', `面部特写尝试 ${attempt + 1}/3 (model=${model}): ${character.name}`);
                faceImageUrl = await App.agnesImageGen(facePrompt, '512x512', model);
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

        // === 第二步：从面部特写出发，三级降级生成全身/半身 ===
        const levels = [
            { name: '全身', level: 0 },
            { name: '半身', level: 1 }
        ];

        for (const tier of levels) {
            try {
                rpLog('info', 'IMG', `第二步: 尝试 ${tier.name} 生图（基于面部特写）: ${character.name}`);
                const prompt = App.buildModularPrompt(character, tier.level);
                
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
    const artStyle = state.story?.imageStyle || 'anime';
    const styleSuffix = App.artStyleSuffixes[artStyle] || App.artStyleSuffixes['anime'];
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

// 生图 API 调用
App.agnesImageGen = async function(prompt, size = '768x1024', model) {
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        throw new Error('未配置生图 API Key');
    }
    if (!model) {
        model = 'agnes-image-2.1-flash';
    }

    const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
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
};

// === img2img 变体：传入面部参考图，确保面部一致性 ===
App.agnesImageGenWithRefImg = async function(prompt, faceImageUrl, size = '768x1024') {
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        throw new Error('未配置生图 API Key');
    }
    if (!faceImageUrl) {
        throw new Error('缺少面部参考图 URL');
    }

    rpLog('info', 'IMG', `img2img: 使用面部参考图生图`);

    const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'agnes-image-2.1-flash',
            prompt: prompt,
            image: [faceImageUrl],
            size: size,
            n: 1,
            extra_body: { response_format: 'url' }
        }),
        signal: AbortSignal.timeout(120000)
    });

    if (!resp.ok) {
        let errMsg = `img2img 生图错误 (${resp.status})`;
        try {
            const errData = await resp.json();
            errMsg = errData.error?.message || errData.message || errMsg;
        } catch(e) {
            errMsg = `生图错误 (${resp.status}): ${await resp.text()}`;
        }
        console.error('img2img API 响应:', errMsg);
        throw new Error(errMsg);
    }

    const data = await resp.json();
    const imgUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json || '';
    if (!imgUrl) {
        console.error('img2img 返回数据异常:', JSON.stringify(data).slice(0, 500));
        throw new Error('未获取到图片 URL');
    }
    return imgUrl;
};
