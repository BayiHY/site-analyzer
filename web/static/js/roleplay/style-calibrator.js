// === Section: 风格锚点校准 ===
// 目标：解决 27 大类字符串风格标签太粗（同标签下不同种子/不同 API 内部风格差异大）导致的一致性差问题。
// 流程：
//   1. 从场景描述生成一张**中性锚点图**（不含具体角色，只有风格 + 场景氛围）
//   2. 用 Agnes 语言模型的 vision 能力反推**精准风格提示词**（描述这张图的画面语言）
//   3. 存到 state.story.styleAnchor，后续所有生图（头像 / 场景图）追加同一段风格描述
//
// 只在故事初始化时跑一次；跑不成功不阻塞主流程（fallback 用旧的 appendArtStyle）。

(function () {

    // ---- 1. 中性锚点图 prompt ----
    // 只保留：场景氛围 + 光照 + 画面风格标签，不写具体角色相貌/情节
    App.buildAnchorPrompt = function(sceneDesc, imageStyle) {
        const envHint = (sceneDesc || '').replace(/[「」""''“”]/g, '').slice(0, 180).trim();
        // 单个中性人物 + 场景氛围，让识图能同时判"人物画风"和"场景画风"
        let base = `A neutral clean-featured young character (unspecified gender), soft neutral expression, `
                 + `standing quietly in the scene, `
                 + `scene atmosphere: ${envHint || 'a peaceful ambient environment'}. `
                 + `Focus on visual style, palette, lighting, brushwork and rendering technique.`;
        // 追加已选的粗粒度风格后缀（作为初始指引）
        if (imageStyle && App.artStyleSuffixes[imageStyle]) {
            base += App.artStyleSuffixes[imageStyle];
        } else if (imageStyle) {
            base += `, ${imageStyle} style`;
        }
        return base;
    };

    // ---- 2. Vision 反推风格 ----
    App.extractStyleFromImage = async function(imageUrl) {
        const apiKey = state.apiKeys.chat;
        if (!apiKey) throw new Error('未配置 API Key');
        if (!imageUrl) throw new Error('缺少锚点图 URL');

        const systemPrompt = `你是一个 AI 绘图 prompt 专家。你的任务是根据一张参考图，
提炼一段可直接追加到生图 prompt 末尾的**画面风格描述**（英文，逗号分隔的短语，60~120 词）。

要求：
1. 只描述**画面语言**：媒介（如 anime, oil painting, 3D render）、线稿粗细、上色方式、
   色板/主调、光照类型、渲染质感、笔触、背景氛围、时代感
2. **不要**描述任何具体人物特征（发色、五官、服装、身份）
3. **不要**描述具体场景内容（如"在森林里"、"夜晚"）
4. **不要**出现描述"这张图"的元话语（如 "the image shows"），直接输出可用的风格短语
5. 用英文输出，逗号分隔，不要编号，不要 markdown
6. 前面加一个逗号+空格，方便直接拼接

示例输出格式：
, cel shaded anime style, clean crisp line art, vibrant saturated palette, soft rim lighting, glossy skin highlights, painterly background wash, modern shounen aesthetic`;

        const userPrompt = '请为这张图片提炼可复用的画面风格提示词。';

        const resp = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'agnes-2.0-flash',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: [
                        { type: 'text', text: userPrompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]}
                ],
                temperature: 0.2,
                max_tokens: 400
            }),
            signal: AbortSignal.timeout(60000)
        });
        if (!resp.ok) {
            let msg = `Vision 错误 (${resp.status})`;
            try { const j = await resp.json(); msg = j.error?.message || msg; } catch(e){}
            throw new Error(msg);
        }
        const data = await resp.json();
        let styleText = (data.choices?.[0]?.message?.content || '').trim();

        // 清洗：去掉 markdown、多余引号、换行
        styleText = styleText
            .replace(/^```[\s\S]*?\n/, '')
            .replace(/```$/, '')
            .replace(/[\r\n]+/g, ' ')
            .replace(/^["'`]|["'`]$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        // 强制前缀逗号
        if (!styleText.startsWith(',')) styleText = ', ' + styleText;
        // 长度上限
        if (styleText.length > 800) styleText = styleText.slice(0, 800);

        return styleText;
    };

    // ---- 3. 主流程：生成锚点图 → 反推 → 存到 state.story.styleAnchor ----
    App.calibrateStoryStyle = async function(sceneDesc, imageStyle) {
        const t0 = Date.now();
        try {
            rpLog('info', 'STYLE', '=== 开始画面风格锚点校准 ===');
            const prompt = App.buildAnchorPrompt(sceneDesc, imageStyle);
            rpLog('info', 'STYLE', `锚点 prompt (${prompt.length}字): ${prompt.slice(0, 200)}...`);

            // 生成锚点图（图小 + 竖屏最低）
            const anchorUrl = await App.agnesImageGenerate({
                prompt,
                size: '1K',
                ratio: '9:16',
                model: 'agnes-image-2.1-flash',
                label: 'style_anchor'
            });
            rpLog('info', 'STYLE', `锚点图生成完成: ${anchorUrl.slice(0, 100)}`);

            // Vision 反推
            const styleAnchor = await App.extractStyleFromImage(anchorUrl);
            rpLog('info', 'STYLE', `✅ 精准风格提示词: ${styleAnchor}`);

            // 保存到 story
            if (state.story) {
                state.story.styleAnchor = styleAnchor;
                state.story.styleAnchorImage = anchorUrl;
                saveState().catch(() => {});
            }
            rpLog('info', 'STYLE', `✅ 风格校准完成，耗时 ${Date.now() - t0}ms`);
            return styleAnchor;
        } catch (err) {
            rpLog('warn', 'STYLE', `❌ 风格校准失败: ${err.message}，将 fallback 使用粗粒度风格标签`);
            return null;
        }
    };

    // ---- 3b. 开启后台校准（不阻塞，存入 state.story._styleAnchorPromise）----
    // 后续所有生图入口在真正发 API 前会 await 这个 promise
    App.startStyleCalibrationBg = function(sceneDesc, imageStyle) {
        if (!state.story) return null;
        if (state.story.styleAnchor) return Promise.resolve(state.story.styleAnchor);
        if (state.story._styleAnchorPromise) return state.story._styleAnchorPromise;
        rpLog('info', 'STYLE', '🚀 后台启动风格校准（不阻塞文本流）');
        state.story._styleAnchorPromise = App.calibrateStoryStyle(sceneDesc, imageStyle)
            .finally(() => {
                // 保留 promise 实例的 already-resolved 状态，便于多次 await
            });
        return state.story._styleAnchorPromise;
    };

    // ---- 3c. 确保风格已就绪（生图前调用）----
    App.awaitStyleReady = async function() {
        if (!state.story) return null;
        if (state.story.styleAnchor) return state.story.styleAnchor;
        if (state.story._styleAnchorPromise) {
            try { return await state.story._styleAnchorPromise; }
            catch (e) { return null; }
        }
        return null;
    };

    // ---- 4. 覆盖 appendArtStyle：首选锚点；未就绪时插入占位符，后续在 agnesImageGenerate 里 await 后替换 ----
    App.STYLE_ANCHOR_PLACEHOLDER = '<<STYLE_ANCHOR>>';
    const _origAppend = App.appendArtStyle;
    App.appendArtStyle = function(prompt) {
        const anchor = state.story?.styleAnchor;
        if (anchor && typeof anchor === 'string' && anchor.length > 0) {
            return prompt + anchor;
        }
        // 风格校准已开启则插占位符，等 agnesImageGenerate await 完再替换
        if (state.story?._styleAnchorPromise) {
            return prompt + ' ' + App.STYLE_ANCHOR_PLACEHOLDER;
        }
        // fallback：老的粗粒度后缀
        return _origAppend.call(App, prompt);
    };

    // 提供给 agnesImageGenerate 调用的替换工具
    App.resolveStyleInPrompt = function(prompt) {
        if (!prompt || typeof prompt !== 'string') return prompt;
        if (!prompt.includes(App.STYLE_ANCHOR_PLACEHOLDER)) return prompt;
        const anchor = state.story?.styleAnchor;
        if (anchor) {
            return prompt.replace(App.STYLE_ANCHOR_PLACEHOLDER, anchor);
        }
        // 就续失败→用老后缀兄徕
        try {
            const fallback = App.getArtStyleSuffix ? App.getArtStyleSuffix() : '';
            return prompt.replace(App.STYLE_ANCHOR_PLACEHOLDER, fallback);
        } catch (e) {
            return prompt.replace(App.STYLE_ANCHOR_PLACEHOLDER, '');
        }
    };

})();
