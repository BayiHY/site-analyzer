// === Section: 应用初始化 ===
// 加载设置、恢复 API Key、初始化 IndexedDB、恢复上次状态

// === 画面风格中文显示名映射 ===
App.artStyleDisplayNames = {
    // 一、日系动画细分
    'akira toriyama style': '鸟山明龙珠风 (Akira Toriyama)',
    'rumiko takahashi style': '高桥留美子犬夜叉风 (Rumiko Takahashi)',
    'studio ghibli hand-drawn cel': '吉卜力手绘动画 (Studio Ghibli)',
    '80s toei cel animation': '80年代东映复古动画 (80s Toei)',
    '90s jump shonen cel anime': '90年代少年Jump热血动画 (90s Jump)',
    '00s josei cel anime': '00年代少女向恋爱动画 (00s Josei)',
    'modern moe cel anime': '现代萌系新番 (Modern Moe)',
    'y2k anime': '千禧年2000年代初动画 (Y2K Anime)',
    'seinen cel anime': '青年写实动画 (Seinen)',
    'trigger anime style': '扳机社特摄动画 (Trigger)',
    'three-tone cel shading': '极简三色赛璐璐 (Three-Tone)',
    // 二、漫画细分
    'shonen jump manga': '少年黑白网点漫画 (Shonen Jump Manga)',
    'shoujo manga': '少女黑白漫画 (Shoujo Manga)',
    'gekiga manga': '剧画写实成人漫画 (Gekiga)',
    'webtoon korean color manhwa': '韩式彩色条漫 (Webtoon Manhwa)',
    'doujinshi illustration': '同人插画漫画 (Doujinshi)',
    'horror manga': '日系恐怖黑白漫画 (Horror Manga)',
    'one piece manga style': '尾田荣一郎海贼王漫画 (One Piece)',
    'berserk manga style': '剑风传奇暗黑青年漫画 (Berserk)',
    // 三、3D 卡通细分
    'blender lowpoly cartoon render': 'Blender低多边形卡通3D (LowPoly)',
    'anime toon 3d render': '二次元三渲二 (Anime Toon 3D)',
    'pixar soft 3d cartoon': '皮克斯柔和卡通CG (Pixar Soft)',
    'clay figure render': '黏土人偶3D (Clay Figure)',
    'miniature diorama render': '微缩模型场景3D (Miniature Diorama)',
    'chibi super deformed 3d': 'Q版二头身3D (Chibi SD 3D)',
    // 四、通用美术&潮流细分
    'transparent watercolor wash': '透明水彩 (Transparent Watercolor)',
    'heavy oil painting texture': '厚重油画 (Heavy Oil Painting)',
    'digital thick paint illustration': '数字厚涂 (Digital Thick Paint)',
    'graphite pencil sketch': '石墨铅笔素描 (Graphite Pencil)',
    'chinese ink wash painting': '水墨国画 (Chinese Ink Wash)',
    'hard line ink line art': '纯硬笔线稿 (Hard Line Art)',
    'neon cyberpunk illustration': '赛博朋克霓虹 (Neon Cyberpunk)',
    'vaporwave retro 80s art': '蒸汽波80年代复古 (Vaporwave)',
    'dark gothic fantasy illustration': '暗黑哥特奇幻 (Dark Gothic Fantasy)',
    'flat vector minimal illustration': '扁平矢量极简 (Flat Vector)',
    'pixel art 16bit retro game': '16位像素复古游戏 (Pixel Art)',
    'unreal engine photoreal PBR': '虚幻引擎照片写实 (UE Photoreal)',
    'pop art screen print': '波普丝网印刷 (Pop Art)',
    // 兼容旧关键词
    'cel shading': '鸟山明龙珠风 (Akira Toriyama)',
    'watercolor': '透明水彩 (Transparent Watercolor)',
    'oil painting': '厚重油画 (Heavy Oil Painting)',
    'thick paint': '数字厚涂 (Digital Thick Paint)',
    'pencil sketch': '石墨铅笔素描 (Graphite Pencil)',
    'manga': '少年黑白网点漫画 (Shonen Jump Manga)',
    'concept art': '概念设计图 (Concept Art)',
    'unreal engine': '虚幻引擎照片写实 (UE Photoreal)',
    'blender cartoon': 'Blender低多边形卡通3D (LowPoly)',
    'studio ghibli': '吉卜力手绘动画 (Studio Ghibli)',
    'cyberpunk': '赛博朋克霓虹 (Neon Cyberpunk)',
    'chibi': 'Q版二头身3D (Chibi SD 3D)',
    'pixel art': '16位像素复古游戏 (Pixel Art)',
    'ink wash': '水墨国画 (Chinese Ink Wash)',
    'vaporwave': '蒸汽波80年代复古 (Vaporwave)',
    'dark fantasy': '暗黑哥特奇幻 (Dark Gothic Fantasy)',
    'line art': '纯硬笔线稿 (Hard Line Art)',
    'flat design': '扁平矢量极简 (Flat Vector)',
    'anime': '鸟山明龙珠风 (Akira Toriyama)',
};

// 获取画面风格的中文显示名（用于设置面板展示）
App.getArtStyleDisplayName = function(style) {
    return App.artStyleDisplayNames[style] || style;
};

// === LLM 语义识别画面风格 ===
// 从用户灵感文本中提取画面风格关键词，返回英文提示词
// 如果 LLM 识别失败或无灵感，返回 null
App.extractStyleFromInspiration = async function(inspiration, userSelectedStyle) {
    if (!inspiration || !inspiration.trim()) return null;
    
    const fallbackHint = userSelectedStyle
        ? `⚠️ 重要：如果灵感中没有明确风格指向，请使用用户在开始冒险界面选择的画面风格：「${userSelectedStyle}」，不要自行替换为其他风格。`
        : `⚠️ 重要：如果灵感中没有明确风格指向，请返回 "akira toriyama style"。`;
    
    const systemPrompt = `你是一个画面风格识别专家。请从用户的故事灵感中识别画面风格。

可用的画面风格选项（返回时必须使用下方精确的英文关键词之一，不要自创）：
- akira toriyama style（鸟山明龙珠风、粗硬轮廓、尖刺发型、大块硬阴影）
- rumiko takahashi style（高桥留美子犬夜叉风、柔和圆润线条、低饱和复古暖调）
- studio ghibli hand-drawn cel（吉卜力手绘动画、水彩肌理、自然背景）
- 80s toei cel animation（80年代东映复古动画、饱和度极高硬赛璐璐）
- 90s jump shonen cel anime（90年代少年Jump热血动画、强动态粗黑边线）
- 00s josei cel anime（少女向恋爱动画、柔渐变马卡龙浅色系）
- modern moe cel anime（现代萌系新番、高光皮肤、超大亮瞳、软轮廓）
- y2k anime（千禧年2000年代初动画、高饱和荧光色、复古数码滤镜）
- seinen cel anime（青年写实动画、低对比写实五官、偏灰沉稳色调）
- trigger anime style（扳机社特摄动画、高对比度扭曲线条、爆炸特效）
- three-tone cel shading（极简三色赛璐璐、无渐变平涂、干净统一）
- shonen jump manga（少年黑白网点漫画、速度线密集网点粗墨轮廓）
- shoujo manga（少女黑白漫画、渐变网点高光眼妆纤细细线）
- gekiga manga（剧画写实成人漫画、粗糙炭笔线条压抑高对比黑白）
- webtoon korean color manhwa（韩式彩色长条漫、柔厚涂渐变修长美型）
- doujinshi illustration（同人插画漫画、精致细化氛围感背景）
- horror manga（日系恐怖黑白漫画、破碎线条大面积涂黑扭曲五官）
- one piece manga style（尾田荣一郎海贼王漫画、夸张卡通人体粗轮廓）
- berserk manga style（剑风传奇暗黑青年漫画、密集排线厚重暗部）
- blender lowpoly cartoon render（Blender低多边形卡通3D、几何切面平阴影）
- anime toon 3d render（二次元三渲二、模拟手绘赛璐璐质感3D）
- pixar soft 3d cartoon（皮克斯柔和卡通CG、圆润曲面全局柔光）
- clay figure render（黏土人偶3D渲染、哑光毛绒黏土肌理）
- miniature diorama render（微缩模型场景3D、浅景深实体模型质感）
- chibi super deformed 3d（纯Q版二头身3D、大头极小躯体简化结构）
- transparent watercolor wash（透明水彩、通透晕染留白无厚重堆积）
- heavy oil painting texture（油画厚重堆叠笔触画布肌理）
- digital thick paint illustration（数字厚涂、多层叠加模糊明暗过渡）
- graphite pencil sketch（石墨铅笔素描、纸张颗粒柔和排线灰阶）
- chinese ink wash painting（水墨国画、墨色浓淡虚实留白）
- hard line ink line art（纯硬笔线稿、无上色单色清晰轮廓）
- neon cyberpunk illustration（赛博朋克霓虹、冷蓝粉紫霓虹雨夜金属）
- vaporwave retro 80s art（蒸汽波、粉青渐变复古电子故障纹理）
- dark gothic fantasy illustration（暗黑哥特奇幻、深暗低饱和复古雕花）
- flat vector minimal illustration（扁平矢量、无渐变纯色几何极简）
- pixel art 16bit retro game（16位像素复古游戏、方块色块网格）
- unreal engine photoreal PBR（虚幻引擎照片写实、物理真实材质光影）
- pop art screen print（波普丝网印刷、纯色平涂粗黑轮廓高对比）

${fallbackHint}

要求：
1. 只返回一个英文风格关键词，不要解释
2. 如果灵感中提到了明确风格，返回对应的精确英文关键词
3. 如果灵感中提到的是中文风格词，转换为最精确对应的英文关键词
4. 如果无法确定，使用上面标注的 fallback 风格

示例：
用户输入："中国，校园，后宫，四个女角色" → (返回用户选择的风格或 akira toriyama style)
用户输入："我想看赛博朋克风格的未来城市" → neon cyberpunk illustration
用户输入："线稿风格，校园日常" → hard line ink line art
用户输入："厚涂韩漫风格" → digital thick paint illustration
用户输入："2名女角色" → (返回用户选择的风格或 akira toriyama style)
用户输入："古风，仙侠，水墨" → chinese ink wash painting
用户输入："写实，电影感" → unreal engine photoreal PBR
用户输入："鸟山明龙珠风" → akira toriyama style
用户输入："吉卜力宫崎骏风" → studio ghibli hand-drawn cel
用户输入："韩漫条漫" → webtoon korean color manhwa`;

    const userPrompt = `请从以下故事灵感中识别画面风格：\n"${inspiration}"`;

    try {
        const reply = await App.agnesChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]);
        
        // 清理 LLM 回复，去除多余空格和引号
        const cleanReply = (reply || '').trim().replace(/["'`]/g, '').replace(/\s+/g, ' ');
        rpLog('info', 'STYLE', `LLM 原始回复: "${cleanReply}"`);
        return cleanReply || null;
    } catch (err) {
        rpLog('warn', 'STYLE', `LLM 风格识别失败: ${err.message}`);
        return null;
    }
};

// === 画面风格选择器显示/隐藏 ===
// 用户手动修改下拉框后，灵感检测不再覆盖它的值。
// 跟踪用户是否手动触碰过下拉框。
App._artStyleUserTouched = false;
document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('setup-art-style');
    if (select) {
        select.addEventListener('change', () => {
            App._artStyleUserTouched = true;
        });
    }
});

App.setupArtStyleOptions = function(detectedStyle) {
    const select = document.getElementById('setup-art-style');
    if (!select) return detectedStyle || 'akira toriyama style';
    // 只在用户没有手动选择过、且检测到风格时，才预选到下拉框
    if (detectedStyle && !App._artStyleUserTouched) {
        select.value = detectedStyle;
        return detectedStyle;
    }
    // 用户手动选过或没检测到，保持当前值
    return select.value || 'akira toriyama style';
};

App.onSetupImageKeyChange = function() {
    // 生图 key 变化时，如果灵感框有内容，重新检测画面风格
    const storyPrompt = document.getElementById('story-prompt')?.value.trim() || '';
    if (storyPrompt) {
        const detectedStyle = App.detectVisualStyleFromInspiration(storyPrompt);
        App.setupArtStyleOptions(detectedStyle);
    }
};

// 监听灵感输入框变化，实时更新画面风格预选（保留旧逻辑作为快速反馈，实际使用 LLM 检测）
document.addEventListener('DOMContentLoaded', () => {
    const storyPromptEl = document.getElementById('story-prompt');
    if (storyPromptEl) {
        storyPromptEl.addEventListener('input', function() {
            const detectedStyle = App.detectVisualStyleFromInspiration(this.value.trim());
            App.setupArtStyleOptions(detectedStyle);
        });
    }
});

App.resetStory = async function() {
    if (!confirm('确定要重新生成随机故事吗？当前故事将被替换为全新的随机故事。')) return;
    
    state.player = { gender: state.player?.gender || '男', faceImageUrl: '', portraitImageUrl: '' };
    state.characters = [];
    state.activeCharIndex = 0;
    state.emotions = {};
    state.messages = [];
    state.story = null;
    state.revealed = {};
    state.currentSceneBg = '';
    state.lastReplyOptions = null;
    state.sceneHistory = [];
    
    // 持久化清空后的状态到 IndexedDB / localStorage
    await saveState();
    await saveMessages();
    
    // 同时清除 localStorage 回退键，防止 IndexedDB 不可用时残留旧数据
    localStorage.removeItem('rp_state_fallback');
    localStorage.removeItem('rp_messages_fallback');
    
    // 清空选项气泡
    const replyOpts = document.getElementById('reply-options');
    if (replyOpts) replyOpts.innerHTML = '';

    document.getElementById('char-setup-screen').style.display = 'flex';
    document.getElementById('chat-screen').style.display = 'none';
    
    document.getElementById('story-prompt').value = '';

    // 清除场景背景
    const bgLayer = document.getElementById('scene-bg-layer');
    if (bgLayer) bgLayer.style.backgroundImage = '';
    
    showNewDiscovery('故事已重置，请点击"开始冒险"生成新的随机故事');
}

App.restoreApiKeysToInputs = function() {
    const chatInput = document.getElementById('setup-chat-key');
    const imageInput = document.getElementById('setup-image-key');
    if (chatInput && state.apiKeys.chat) chatInput.value = state.apiKeys.chat;
    if (imageInput && state.apiKeys.image) imageInput.value = state.apiKeys.image;
}

App.renderMessages = function() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    state.messages.forEach(msg => {
        // 从 sessionStorage 读取已播放的消息 ID 列表
        try {
            const playedIds = JSON.parse(sessionStorage.getItem('rp_played_msg_ids') || '[]');
            if (playedIds.includes(msg.id)) {
                msg._played = true;
            }
        } catch(e) {}
        renderMessage(msg);
    });
    container.scrollTop = container.scrollHeight;
}

App.saveSettings = function() {
    state.apiKeys.chat = document.getElementById('setting-chat-key').value.trim();
    state.apiKeys.image = document.getElementById('setting-image-key').value.trim();
    localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));

    // 保存故事标题
    const titleEl = document.getElementById('setting-story-title');
    if (titleEl) {
        state.story.title = titleEl.value.trim();
    }

    saveState().then(() => {
        alert('设置已保存');
    }).catch(() => {
        alert('设置已保存（本地存储）');
    });
}

App.showNewDiscovery = function(msg) {
    const el = document.getElementById('new-discovery-toast');
    if (el) { el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }
}

App.init = async function() {
    loadSettings();
    restoreApiKeysToInputs();
    try { await openDB(); } catch(e) { /* IndexedDB 不可用，使用 localStorage 回退 */ }
    const hasState = await loadState();

    if (hasState && (state.character || state.characters?.length)) {
        await loadMessages();
        showChatScreen();
        renderMessages();

        // 恢复场景背景图
        if (state.currentSceneBg) {
            App.applySceneBackground(state.currentSceneBg);
        }
    }
}

App.clearApiKey = function(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.value = '';
        input.focus();
    }
}

// 自动调整输入框高度
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }
});
