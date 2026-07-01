// === Section: 应用初始化 ===
// 加载设置、恢复 API Key、初始化 IndexedDB、恢复上次状态

// === 从用户灵感中检测画面风格 ===
// 关键词排序规则：多字/具体关键词在前，单字/泛关键词在后。
// Object.entries 按插入顺序遍历，第一个命中即 return，所以顺序就是优先级。
App.detectVisualStyleFromInspiration = function(inspiration) {
    if (!inspiration || inspiration.trim().length === 0) return null;
    const text = inspiration.toLowerCase();
    // 使用数组保证顺序，而非对象（对象键顺序不可靠）
    const styleRules = [
        // --- 赛璐璐风（默认动漫风）--- 具体关键词在前
        ['日本动画', 'cel shading'],
        ['日本动漫', 'cel shading'],
        ['日系', 'cel shading'],
        ['日式', 'cel shading'],
        ['动漫', 'cel shading'],
        ['日漫', 'cel shading'],
        ['二次元', 'cel shading'],
        ['动画', 'cel shading'],
        ['anime', 'cel shading'],
        ['卡通', 'cel shading'],
        ['赛璐璐', 'cel shading'],
        ['清新', 'cel shading'],
        ['明亮', 'cel shading'],
        // --- 黑白漫画（Manga）--- 具体关键词在前
        ['日漫黑白', 'manga'],
        ['黑白漫画', 'manga'],
        ['韩漫', 'manga'],
        ['条漫', 'manga'],
        ['网漫', 'manga'],
        ['webtoon', 'manga'],
        ['美漫', 'manga'],
        ['绘本', 'manga'],
        ['漫画', 'manga'],
        // --- 厚涂风 --- 具体关键词在前
        ['韩漫厚涂', 'thick paint'],
        ['韩系厚涂', 'thick paint'],
        ['digital painting', 'thick paint'],
        ['数码绘画', 'thick paint'],
        ['板绘', 'thick paint'],
        ['厚涂', 'thick paint'],
        // --- 概念设计图 ---
        ['概念设计', 'concept art'],
        ['游戏美术', 'concept art'],
        ['角色设计', 'concept art'],
        ['概念图', 'concept art'],
        ['game art', 'concept art'],
        // --- 虚幻引擎写实 --- 具体关键词在前
        ['虚幻引擎', 'unreal engine'],
        ['photorealistic', 'unreal engine'],
        ['写实', 'unreal engine'],
        ['逼真', 'unreal engine'],
        ['照片', 'unreal engine'],
        ['摄影', 'unreal engine'],
        ['现实', 'unreal engine'],
        ['真实', 'unreal engine'],
        // --- Blender卡通3D --- 具体关键词在前
        ['3D卡通', 'blender cartoon'],
        ['Blender', 'blender cartoon'],
        ['maya', 'blender cartoon'],
        ['C4D', 'blender cartoon'],
        ['3D', 'blender cartoon'],
        ['三维', 'blender cartoon'],
        ['渲染', 'blender cartoon'],
        // --- 水彩 ---
        ['watercolor', 'watercolor'],
        ['水彩', 'watercolor'],
        // --- 油画 --- 具体关键词在前
        ['古典油画', 'oil painting'],
        ['油畫', 'oil painting'],
        ['古典', 'oil painting'],
        ['油画', 'oil painting'],
        // --- 铅笔素描 --- 具体关键词在前
        ['graphite', 'pencil sketch'],
        ['铅笔画', 'pencil sketch'],
        ['手绘', 'pencil sketch'],
        ['素描', 'pencil sketch'],
        ['速写', 'pencil sketch'],
        // --- 吉卜力 --- 具体关键词在前
        ['宫崎骏', 'studio ghibli'],
        ['ghibli', 'studio ghibli'],
        ['治愈', 'studio ghibli'],
        ['温馨', 'studio ghibli'],
        ['吉卜力', 'studio ghibli'],
        // --- 赛博朋克 --- 具体关键词在前
        ['赛博朋克', 'cyberpunk'],
        ['霓虹', 'cyberpunk'],
        ['科幻', 'cyberpunk'],
        ['未来', 'cyberpunk'],
        // --- Q版 --- 具体关键词在前
        ['可爱风', 'chibi'],
        ['萌系', 'chibi'],
        ['Q版', 'chibi'],
        ['可爱', 'chibi'],
        ['萌', 'chibi'],
        // --- 像素风 --- 具体关键词在前
        ['复古游戏', 'pixel art'],
        ['16bit', 'pixel art'],
        ['8bit', 'pixel art'],
        ['retro', 'pixel art'],
        ['像素', 'pixel art'],
        // --- 水墨画 --- 具体关键词在前
        ['中国风', 'ink wash'],
        ['传统', 'ink wash'],
        ['水墨', 'ink wash'],
        ['国画', 'ink wash'],
        // --- 蒸汽波 --- 具体关键词在前
        ['vaporwave', 'vaporwave'],
        ['蒸汽波', 'vaporwave'],
        ['80年代', 'vaporwave'],
        // --- 暗黑奇幻 --- 具体关键词在前
        ['黑暗奇幻', 'dark fantasy'],
        ['dark fantasy', 'dark fantasy'],
        ['哥特', 'dark fantasy'],
        ['恐怖', 'dark fantasy'],
        ['惊悚', 'dark fantasy'],
        ['暗黑', 'dark fantasy'],
        // --- 扁平矢量 --- 具体关键词在前
        ['flat design', 'flat design'],
        ['极简', 'flat design'],
        ['简约', 'flat design'],
        ['扁平', 'flat design'],
        ['矢量', 'flat design'],
    ];
    for (const [keyword, style] of styleRules) {
        if (text.includes(keyword)) return style;
    }
    return null;
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
