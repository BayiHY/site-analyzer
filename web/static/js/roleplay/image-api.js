// === Section: 图片 API 封装 ===
// 生图 API 调用 + prompt 清洗 + 风格后缀 + 模块化三级降级

// 艺术风格后缀映射
App.artStyleSuffixes = {
    'anime': ', high quality anime style, cel shading, vibrant colors',
    'watercolor': ', watercolor painting style, soft washes, transparent layers, artistic',
    'oil painting': ', oil painting style, rich textures, impasto brushstrokes, classical',
    'digital realism': ', digital painting, photorealistic, highly detailed, cinematic lighting',
    'pencil sketch': ', pencil sketch style, graphite drawing, crosshatching, monochrome',
    'comic book': ', comic book style, bold outlines, halftone dots, graphic novel art'
};

// 获取当前艺术风格后缀
App.getArtStyleSuffix = function() {
    const style = state.story?.imageStyle || state.story?.artStyle || 'anime';
    return App.artStyleSuffixes[style] || App.artStyleSuffixes['anime'];
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

    const include = {
        imageFace: level >= 0,
        imageHair: level >= 0,
        imageBody: level >= 1,
        imageClothes: level >= 1,
        imageEnvironment: level >= 0
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
    if (level === 0) {
        base += ', full body shot from head to toe, standing pose, complete figure';
    } else if (level === 1) {
        base += ', medium shot from waist up, upper body portrait';
    } else {
        base += ', close-up portrait from upper chest to collarbone, face detail shot';
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

// 三级降级生图：完整 → 半身 → 特写 → 备用
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
        // 模块化流程：三级降级
        // level 0 = 全身(face+hair+body+clothes+env) → full body from head to toe
        // level 1 = 半身(face+hair+body+clothes) → waist-up medium shot
        // level 2 = 特写(face+hair) → close-up from upper chest to collarbone
        const levels = [
            { name: '全身', level: 0 },
            { name: '半身', level: 1 },
            { name: '特写', level: 2 }
        ];

        for (const tier of levels) {
            try {
                rpLog('info', 'IMG', `尝试 ${tier.name} 生图: ${character.name}`);
                const prompt = App.buildModularPrompt(character, tier.level);
                rpLog('debug', 'IMG', `Prompt (${tier.name}): ${prompt.slice(0, 120)}...`);
                imageUrl = await App.agnesImageGen(prompt);
                if (imageUrl) {
                    rpLog('info', 'IMG', `${tier.name} 生成成功: ${character.name}`);
                    return imageUrl;
                }
            } catch (e) {
                rpLog('warn', 'IMG', `${tier.name} 失败 (${e.message}), 降级到 ${levels[levels.indexOf(tier) + 1]?.name || '备用'}`);
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
};
