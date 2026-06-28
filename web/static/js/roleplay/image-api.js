// === Section: 图片 API 封装 ===
// 生图 API 调用 + prompt 清洗 + 风格后缀 + 备用 prompt

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
        cleaned += `, portrait of ${character.name}, ${character.age} years old, wearing ${character.appearance}, clean background, professional character design`;
    }

    return App.appendArtStyle(cleaned.trim());
}

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
