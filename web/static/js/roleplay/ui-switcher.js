// === Section: UI 切换 ===
// 页面切换 + 故事头 + 两阶段控制栏 + 打字指示器

App.showChatScreen = function() {
    document.getElementById('char-setup-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'flex';
    updateStoryHeader();
}

App.updateStoryHeader = function() {
    const s = state.story;
    document.getElementById('header-story-title').textContent = s?.title || '未命名故事';
    document.getElementById('header-story-summary').textContent =
        s?.worldview ? truncate(s.worldview, 30) : '等待故事生成...';
}

App.updateGenerationControls = function() {
    // 控制栏已移至设置面板，此处不再需要操作 DOM
    // 保留此函数供现有调用点（story-gen.js / char-gen.js / two-stage.js）调用
}

App.truncate = function(str, len) {
    return str.length > len ? str.slice(0, len) + '…' : str;
}

App.showSetupScreen = function() {
    document.getElementById('char-setup-screen').style.display = 'flex';
    document.getElementById('chat-screen').style.display = 'none';
}

App.showTyping = function() {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg char';
    div.id = 'typing-indicator';
    div.innerHTML = `<div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

App.hideTyping = function() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

// ===== 工具函数 =====
App.escapeHtml = function(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
