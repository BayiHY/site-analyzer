// === Section: 应用初始化 ===
// 加载设置、恢复 API Key、初始化 IndexedDB、恢复上次状态

// === 画面风格中文显示名映射 ===
App.artStyleDisplayNames = {
    'cel shading': '赛璐璐风 (cel shading)',
    'watercolor': '水彩风 (watercolor)',
    'oil painting': '油画风 (oil painting)',
    'thick paint': '厚涂风 (thick paint)',
    'pencil sketch': '铅笔素描 (pencil sketch)',
    'manga': '黑白漫画 (manga)',
    'concept art': '概念设计图 (concept art)',
    'unreal engine': '虚幻引擎写实 (unreal engine)',
    'blender cartoon': 'Blender卡通3D (blender cartoon)',
    'studio ghibli': '吉卜力 (Studio Ghibli)',
    'cyberpunk': '赛博朋克 (cyberpunk)',
    'chibi': 'Q版 (chibi)',
    'pixel art': '像素风 (pixel art)',
    'ink wash': '水墨画 (ink wash)',
    'vaporwave': '蒸汽波 (vaporwave)',
    'dark fantasy': '暗黑奇幻 (dark fantasy)',
    'flat design': '扁平矢量 (flat design)',
    'line art': '线稿风格 (line art)',
    'anime': '赛璐璐风 (cel shading)',
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
        : `⚠️ 重要：如果灵感中没有明确风格指向，请返回 "cel shading"。`;
    
    const systemPrompt = `你是一个画面风格识别专家。请从用户的故事灵感中识别画面风格。

可用的画面风格选项（返回时必须使用下方精确的英文关键词之一，不要自创）：
- cel shading（赛璐璐风、动漫风、二次元、日系、平涂上色）
- watercolor（水彩风、湿画法、晕染）
- oil painting（油画风、厚涂颜料、画布质感）
- thick paint（厚涂风、韩漫厚涂、数字厚涂）
- pencil sketch（铅笔素描、手绘线稿、石墨）
- manga（黑白漫画、条漫、韩漫、网点纸）
- concept art（概念设计图、角色设计、设定稿）
- unreal engine（虚幻引擎写实、照片级、PBR材质）
- blender cartoon（Blender卡通3D、低多边形、3D渲染）
- studio ghibli（吉卜力、宫崎骏风、手绘动画）
- cyberpunk（赛博朋克、霓虹灯、反乌托邦）
- chibi（Q版、萌系、二头身）
- pixel art（像素风、复古游戏、8-bit）
- ink wash（水墨画、国画、毛笔晕染）
- vaporwave（蒸汽波、80年代复古、故障艺术）
- dark fantasy（暗黑奇幻、哥特、克苏鲁）
- flat design（扁平矢量、极简、Material Design）
- line art（线稿、简笔画、单色线条）

${fallbackHint}

要求：
1. 只返回一个英文风格关键词，不要解释
2. 如果灵感中提到了明确风格，返回对应的精确英文关键词
3. 如果灵感中提到的是中文风格词，转换为最精确对应的英文关键词
4. 如果无法确定，使用上面标注的 fallback 风格

示例：
用户输入："中国，校园，后宫，四个女角色" → (返回用户选择的风格或 cel shading)
用户输入："我想看赛博朋克风格的未来城市" → cyberpunk
用户输入："线稿风格，校园日常" → line art
用户输入："厚涂韩漫风格" → thick paint
用户输入："2名女角色" → (返回用户选择的风格或 cel shading)
用户输入："古风，仙侠，水墨" → ink wash
用户输入："写实，电影感" → unreal engine`;

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
    if (!select) return detectedStyle || 'cel shading';
    // 只在用户没有手动选择过、且检测到风格时，才预选到下拉框
    if (detectedStyle && !App._artStyleUserTouched) {
        select.value = detectedStyle;
        return detectedStyle;
    }
    // 用户手动选过或没检测到，保持当前值
    return select.value || 'cel shading';
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
    state.messages.forEach(msg => renderMessage(msg));
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
