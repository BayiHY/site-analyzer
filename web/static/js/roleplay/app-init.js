// === Section: 应用初始化 ===
// 加载设置、恢复 API Key、初始化 IndexedDB、恢复上次状态

// === 从用户灵感中检测画面风格 ===
App.detectVisualStyleFromInspiration = function(inspiration) {
    if (!inspiration || inspiration.trim().length === 0) return null;
    const text = inspiration.toLowerCase();
    const styleMap = {
        '油画': 'oil painting',
        '油畫': 'oil painting',
        '水彩': 'watercolor',
        '动漫': 'anime',
        '动画': 'anime',
        '日漫': 'anime',
        '二次元': 'anime',
        'anime': 'anime',
        '卡通': 'anime',
        '漫画': 'comic book',
        '美漫': 'comic book',
        '绘本': 'comic book',
        '铅笔画': 'pencil sketch',
        '素描': 'pencil sketch',
        '速写': 'pencil sketch',
        '写实': 'digital realism',
        '现实': 'digital realism',
        '逼真': 'digital realism',
        'photorealistic': 'digital realism',
    };
    for (const [keyword, style] of Object.entries(styleMap)) {
        if (text.includes(keyword)) return style;
    }
    return null;
};

// === 画面风格选择器显示/隐藏 ===
App.setupArtStyleOptions = function(detectedStyle) {
    const select = document.getElementById('setup-art-style');
    if (!select) return detectedStyle || 'anime';
    // 只有在检测到风格时才覆盖用户选择，不检测到时保持用户当前的选择
    if (detectedStyle) {
        select.value = detectedStyle;
        return detectedStyle;
    }
    return select.value || 'anime';
};

App.onSetupImageKeyChange = function() {
    // 生图 key 变化时，如果灵感框有内容，重新检测画面风格
    const storyPrompt = document.getElementById('story-prompt')?.value.trim() || '';
    if (storyPrompt) {
        const detectedStyle = App.detectVisualStyleFromInspiration(storyPrompt);
        App.setupArtStyleOptions(detectedStyle);
    }
};

// 监听灵感输入框变化，实时更新画面风格预选
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
    
    state.player = { gender: state.player?.gender || '男', faceImageUrl: '' };
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

    // 保存画面风格
    const artStyleEl = document.getElementById('setting-art-style');
    if (artStyleEl) {
        state.story.imageStyle = artStyleEl.value;
        rpLog('info', 'SETTINGS', `画面风格已保存: ${artStyleEl.value}`);
    }

    // 保存故事标题
    const titleEl = document.getElementById('setting-story-title');
    if (titleEl) {
        state.story.title = titleEl.value.trim();
    }

    saveState().then(() => {
        // 重新渲染场景背景（风格变化后可能需要更新）
        if (state.story.openingScene) {
            App.generateInitialSceneImage(state.story.openingScene).catch(() => {});
        }
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
