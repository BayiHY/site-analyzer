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

    rpLog('info', 'IMG-MODULAR', `━━━ buildModularPrompt(${character.name}, level=${level}) ━━━`);
    rpLog('info', 'IMG-MODULAR', `  所有模块字段: ${JSON.stringify(mods)}`);
    rpLog('info', 'IMG-MODULAR', `  imageStyle="${mods.imageStyle || '(空)'}" | imageFace="${(mods.imageFace||'').slice(0,80)}" | imageHair="${(mods.imageHair||'').slice(0,80)}" | imageBody="${(mods.imageBody||'').slice(0,80)}" | imageClothes="${(mods.imageClothes||'').slice(0,80)}" | imageEnvironment="${(mods.imageEnvironment||'').slice(0,80)}"`);
    rpLog('info', 'IMG-MODULAR', `  角色基本信息: name=${character.name} age=${character.age} gender=${character.gender} appearance="${(character.appearance||'').slice(0,80)}"`);

    // level 2（面部特写）：用 face + hair 精确约束
    if (level === 2) {
        if (mods.imageFace) parts.push(mods.imageFace);
        if (mods.imageHair) parts.push(mods.imageHair);

        let base = parts.join(', ');
        if (!base) base = 'character portrait';

        rpLog('info', 'IMG-MODULAR', `  level2 parts 拼接: "${base}"`);

        let genderStr = 'male';
        if (character.gender === '男') genderStr = 'male';
        else if (character.gender === '女') genderStr = 'female';
        base += `, ${character.name || 'character'}, ${character.age || 20} years old, ${genderStr}`;
        
        // 面部特写基础描述：如果 imageFace 已包含表情/面具/口罩等约束，不再追加固定表情
        const faceText = (mods.imageFace || '').toLowerCase();
        const hasFacialConstraint = /mask|bandage|scar|smile|frown|grimace|gas mask|mouth|lip|expression|calm|angry|sad|hurt|blood|bruise|tattoo|piercing|makeup|contour/.test(faceText);
        const expressionPart = hasFacialConstraint ? '' : 'calm natural expression';
        base += `, front view, head and neck framing, shoulder contour visible, ${expressionPart}, soft even diffused lighting, character reference sheet style, high detail, high quality, moderate framing, tasteful composition, implicit and non-explicit content`;

        const final = App.appendArtStyle(base.trim());
        const artStyle = state.story?.imageStyle || 'anime';
        const suffix = App.getArtStyleSuffix();
        rpLog('info', 'IMG-MODULAR', `  level2 最终prompt (${final.length}字): ${final}`);
        rpLog('info', 'IMG-MODULAR', `  使用的风格: "${artStyle}", 后缀: "${suffix.slice(0,80)}"`);
        return final;
    }

    // level 0/1（全身/半身）：拼接 body + clothes + environment
    // 不再只依赖 img2img 参考图，也要在 prompt 中描述服装和体型
    let genderStr = 'male';
    if (character.gender === '男') genderStr = 'male';
    else if (character.gender === '女') genderStr = 'female';

    if (level === 0) {
        // 全身：性别 + 体型 + 服装 + 环境
        let base = `${genderStr}, full body shot from head to toe, standing pose`;
        if (mods.imageBody) base += `, ${mods.imageBody}`;
        if (mods.imageClothes) base += `, wearing ${mods.imageClothes}`;
        if (mods.imageEnvironment) base += `, ${mods.imageEnvironment}`;
        const final = App.appendArtStyle(base.trim());
        rpLog('info', 'IMG-MODULAR', `  level${level} 完整prompt: ${final}`);
        return final;
    } else {
        // 半身：性别 + 体型 + 服装
        let base = `${genderStr}, medium shot from waist up, upper body portrait`;
        if (mods.imageBody) base += `, ${mods.imageBody}`;
        if (mods.imageClothes) base += `, wearing ${mods.imageClothes}`;
        const final = App.appendArtStyle(base.trim());
        rpLog('info', 'IMG-MODULAR', `  level${level} 完整prompt: ${final}`);
        return final;
    }
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
    
    rpLog('info', 'IMG-MODULES', `━━━ extractModules(${character.name}) ━━━`);
    rpLog('info', 'IMG-MODULES', `  原始字段 keys: ${Object.keys(character).join(', ')}`);
    rpLog('info', 'IMG-MODULES', `  提取结果: ${JSON.stringify(mods)}`);
    
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

    const result = App.appendArtStyle(cleaned.trim());
    rpLog('info', 'IMG-SANITIZE', `sanitizeImagePrompt: 原始="${prompt.slice(0,200)}" → 清洗后="${result.slice(0,300)}"`);
    return result;
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
    // 使用全局风格，不用角色的 imageStyle（可能被污染）
    const globalStyle = state.story?.imageStyle || 'anime';
    const result = `Character portrait, ${gender}, ${character.age || 20} years old, friendly expression, soft lighting, detailed character design, professional concept art, ${globalStyle} style`;
    rpLog('info', 'IMG-BACKUP', `buildBackupPrompt: gender="${gender}", artStyle="${globalStyle}", result="${result.slice(0,300)}"`);
    return result;
};

// 两阶段生图：一阶段面部特写（无降级）→ 二阶段全身/半身（三级降级）
// 新流程：先生成面部特写（level 2），再用 img2img 从特写生成全身/半身
App.generateCharacterImage = async function(character) {
    if (!character || !character.name) {
        throw new Error('无效的角色对象，无法生成图片');
    }

    rpLog('info', 'IMG', `━━━━━━━━━ 开始 ${character.name} 的生图流程 ━━━━━━━━━`);
    rpLog('info', 'IMG', `  角色完整数据: ${JSON.stringify({
        name: character.name, age: character.age, gender: character.gender,
        appearance: character.appearance,
        imagePrompt: (character.imagePrompt || '').slice(0, 200)
    })}`);

    // 提取模块化字段
    const mods = App.extractModules(character);

    // 检查是否有模块化数据
    const hasModules = mods.imageStyle || mods.imageFace || mods.imageHair || mods.imageBody || mods.imageClothes || mods.imageEnvironment;

    rpLog('info', 'IMG', `  模块化数据: hasModules=${hasModules}`);
    if (hasModules) {
        rpLog('info', 'IMG', `  imageStyle="${mods.imageStyle}" | imageFace="${(mods.imageFace||'').slice(0,80)}" | imageHair="${(mods.imageHair||'').slice(0,80)}" | imageBody="${(mods.imageBody||'').slice(0,80)}" | imageClothes="${(mods.imageClothes||'').slice(0,80)}" | imageEnvironment="${(mods.imageEnvironment||'').slice(0,80)}"`);
    } else {
        rpLog('warn', 'IMG', `  ⚠️ 角色没有任何模块化字段！将走旧版 sanitize 流程`);
        rpLog('info', 'IMG', `  旧版 imagePrompt: "${(character.imagePrompt||'').slice(0,200)}"`);
    }

    let imageUrl;

    if (hasModules) {
        // === 第一步：生成面部特写（一阶段，失败自动用 2.0-flash 重试，最多两次） ===
        rpLog('info', 'IMG', `━━━ 阶段1: 面部特写生成 ━━━`);
        const facePrompt = App.buildModularPrompt(character, 2); // level 2 = 特写
        rpLog('info', 'IMG', `  面部特写 Prompt 长度: ${facePrompt.length} 字`);
        
        let faceImageUrl;
        const faceModels = ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'];
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const model = faceModels[attempt % faceModels.length];
                rpLog('info', 'IMG', `面部特写尝试 ${attempt + 1}/3 (model=${model}, size=341x341): ${character.name}`);
                const t0 = Date.now();
                faceImageUrl = await App.agnesImageGen(facePrompt, '341x341', model);
                const elapsed = Date.now() - t0;
                rpLog('info', 'IMG', `✅ 面部特写生成成功: ${character.name} (耗时 ${elapsed}ms)`);
                rpLog('info', 'IMG', `  面部图 URL: ${faceImageUrl.slice(0, 150)}...`);
                character.faceImageUrl = faceImageUrl;
                await saveState();
                break;
            } catch (e) {
                rpLog('warn', 'IMG', `面部特写失败 (尝试 ${attempt + 1}/3): ${e.message}`);
                if (attempt === 2) {
                    rpLog('error', 'IMG', `❌ 面部特写全部重试失败: ${character.name}`);
                }
            }
        }

        if (!faceImageUrl) {
            rpLog('error', 'IMG', `⚠️ 面部特写全部失败，将跳过 img2img 降级链，直接走旧版流程`);
        }

        // === 第二步：从面部特写出发，三级降级生成全身/半身 ===
        const levels = [
            { name: '全身', level: 0 },
            { name: '半身', level: 1 }
        ];

        for (const tier of levels) {
            try {
                rpLog('info', 'IMG', `━━━ 阶段2: 尝试 ${tier.name} (level=${tier.level}) ━━━`);
                const prompt = App.buildModularPrompt(character, tier.level);
                
                // 如果有面部特写，用 img2img 确保面部一致性
                if (faceImageUrl) {
                    rpLog('info', 'IMG', `  使用 img2img 模式 (strength=0.35, ref=面部特写)`);
                    rpLog('info', 'IMG', `  参考图 URL: ${faceImageUrl.slice(0, 150)}...`);
                    const t0 = Date.now();
                    imageUrl = await App.agnesImageGenWithRefImg(prompt, faceImageUrl);
                    rpLog('info', 'IMG', `${tier.name} img2img 成功: ${character.name} (耗时 ${Date.now()-t0}ms)`);
                } else {
                    rpLog('warn', 'IMG', `  ⚠️ 无面部参考图，降级为文生图模式`);
                    const t0 = Date.now();
                    imageUrl = await App.agnesImageGen(prompt);
                    rpLog('info', 'IMG', `${tier.name} 文生图成功: ${character.name} (耗时 ${Date.now()-t0}ms)`);
                }
                
                if (imageUrl) {
                    rpLog('info', 'IMG', `✅ ${tier.name} 生成成功: ${character.name}`);
                    rpLog('info', 'IMG', `  全身/半身图 URL: ${imageUrl.slice(0, 150)}...`);
                    character.portraitImageUrl = imageUrl;
                    await saveState();
                    rpLog('info', 'IMG', `━━━━━━━━━ ${character.name} 生图完成 ━━━━━━━━━`);
                    return imageUrl;
                }
            } catch (e) {
                rpLog('warn', 'IMG', `${tier.name} 失败 (${e.message})`);
            }
        }

        // 模块化全部失败，走备用
        rpLog('warn', 'IMG', `⚠️ 模块化全部失败，使用备用 prompt: ${character.name}`);
    }

    // 兜底：旧版 sanitize 流程
    rpLog('info', 'IMG', `━━━ 兜底: 旧版 sanitize 流程 ━━━`);
    try {
        const oldPrompt = character.imagePrompt || '';
        if (oldPrompt) {
            rpLog('info', 'IMG', `  旧版 imagePrompt: "${oldPrompt.slice(0, 200)}"`);
            const sanitized = App.sanitizeImagePrompt(oldPrompt, character);
            rpLog('info', 'IMG', `  清洗后 prompt: "${sanitized.slice(0, 200)}"`);
            imageUrl = await App.agnesImageGen(sanitized);
            if (imageUrl) {
                rpLog('info', 'IMG', `✅ 旧版流程成功: ${imageUrl.slice(0, 150)}...`);
                return imageUrl;
            }
        }
    } catch (e) {
        rpLog('warn', 'IMG', `旧版 prompt 失败: ${e.message}`);
    }

    // 最终兜底：buildBackupPrompt
    rpLog('info', 'IMG', `━━━ 最终兜底: buildBackupPrompt ━━━`);
    const backup = App.buildBackupPrompt(character);
    rpLog('info', 'IMG', `  Backup prompt: ${backup.slice(0, 200)}...`);
    imageUrl = await App.agnesImageGen(backup);
    if (!imageUrl) throw new Error('所有生图方式均失败');
    rpLog('info', 'IMG', `━━━━━━━━━ ${character.name} 生图完成（兜底模式） ━━━━━━━━━`);
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
    // 根据世界观风格动态调整服装描述，避免"现代休闲装"与古风/奇幻世界观冲突
    const isFantasy = artStyle === 'ink wash' || artStyle === 'watercolor' || artStyle === 'cel shading';
    const clothing = isFantasy ? 'traditional fantasy attire' : 'modern casual clothing';
    const prompt = `Portrait of ${pw}, ${appearance}, ${clothing}, professional character concept art, detailed facial features${styleSuffix}`;

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
App.agnesImageGen = async function(prompt, size = '256x341', model) {
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        throw new Error('未配置生图 API Key');
    }
    if (!model) {
        model = 'agnes-image-2.1-flash';
    }

    rpLog('info', 'IMG-API', `━━━ 文生图请求 ━━━`);
    rpLog('info', 'IMG-API', `  model: ${model}, size: ${size}`);
    rpLog('info', 'IMG-API', `  prompt (${prompt.length}字): ${prompt.slice(0, 500)}`);

    const startTime = Date.now();
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

    rpLog('info', 'IMG-API', `  请求状态: ${resp.status}, 耗时: ${Date.now()-startTime}ms`);

    if (!resp.ok) {
        let errMsg = `生图错误 (${resp.status})`;
        try {
            const errData = await resp.json();
            errMsg = errData.error?.message || errData.message || errMsg;
        } catch(e) {
            errMsg = `生图错误 (${resp.status}): ${await resp.text()}`;
        }
        rpLog('error', 'IMG-API', `❌ 生图失败: ${errMsg}`);
        throw new Error(errMsg);
    }

    const data = await resp.json();
    rpLog('info', 'IMG-API', `  API 返回: ${JSON.stringify(data).slice(0, 500)}`);
    const imgUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json || '';
    if (!imgUrl) {
        rpLog('error', 'IMG-API', `❌ 返回数据异常，无 URL: ${JSON.stringify(data).slice(0, 500)}`);
        throw new Error('未获取到图片 URL，API 返回格式异常');
    }
    rpLog('info', 'IMG-API', `✅ 生图成功: ${imgUrl.slice(0, 200)}...`);
    return imgUrl;
};

// === img2img 变体：传入面部参考图，确保面部一致性 ===
// 注意：面部参考图 URL 可能过期，需要重新下载后用 base64 传入
App.agnesImageGenWithRefImg = async function(prompt, faceImageUrl, size = '256x341') {
    const apiKey = state.apiKeys.image;
    if (!apiKey) {
        throw new Error('未配置生图 API Key');
    }
    if (!faceImageUrl) {
        throw new Error('缺少面部参考图 URL');
    }

    rpLog('info', 'IMG-IMG2IMG', `━━━ img2img 请求开始 ━━━`);
    rpLog('info', 'IMG-IMG2IMG', `  参考图 URL: ${faceImageUrl.slice(0, 200)}...`);
    rpLog('info', 'IMG-IMG2IMG', `  prompt: ${prompt.slice(0, 300)}`);
    rpLog('info', 'IMG-IMG2IMG', `  strength: 0.35, size: ${size}`);

    // 尝试先直接用 URL
    let resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
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
            strength: 0.35,
            extra_body: { response_format: 'url' }
        }),
        signal: AbortSignal.timeout(120000)
    });

    rpLog('info', 'IMG-IMG2IMG', `  首次请求状态: ${resp.status}`);

    // 如果 URL 过期（400/404），下载图片后用 base64 重试
    if (!resp.ok) {
        rpLog('warn', 'IMG-IMG2IMG', `URL 可能已过期 (${resp.status})，尝试用 base64 重试`);
        try {
            const imgResp = await fetch(faceImageUrl);
            if (imgResp.ok) {
                const blob = await imgResp.blob();
                rpLog('info', 'IMG-IMG2IMG', `  参考图下载成功: ${blob.type}, ${blob.size} bytes`);
                const reader = new FileReader();
                const base64Promise = new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                const base64Data = await base64Promise;
                
                rpLog('info', 'IMG-IMG2IMG', `  base64 参考图上传成功 (长度=${base64Data.length})，重新发送 img2img 请求`);
                resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'agnes-image-2.1-flash',
                        prompt: prompt,
                        image: [`data:image/png;base64,${base64Data}`],
                        size: size,
                        n: 1,
                        strength: 0.35,
                        extra_body: { response_format: 'url' }
                    }),
                    signal: AbortSignal.timeout(120000)
                });
            }
        } catch (e) {
            rpLog('error', 'IMG-IMG2IMG', `base64 重试也失败: ${e.message}`);
        }
    }

    if (!resp.ok) {
        let errMsg = `img2img 生图错误 (${resp.status})`;
        try {
            const errData = await resp.json();
            errMsg = errData.error?.message || errData.message || errMsg;
        } catch(e) {
            errMsg = `生图错误 (${resp.status}): ${await resp.text()}`;
        }
        rpLog('error', 'IMG-IMG2IMG', `❌ 最终请求失败: ${errMsg}`);
        throw new Error(errMsg);
    }

    const data = await resp.json();
    rpLog('info', 'IMG-IMG2IMG', `  API 返回数据: ${JSON.stringify(data).slice(0, 300)}`);
    const imgUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json || '';
    if (!imgUrl) {
        rpLog('error', 'IMG-IMG2IMG', `❌ 返回数据异常，无 URL: ${JSON.stringify(data).slice(0, 500)}`);
        throw new Error('未获取到图片 URL');
    }
    rpLog('info', 'IMG-IMG2IMG', `✅ img2img 成功: ${imgUrl.slice(0, 200)}...`);
    return imgUrl;
};
