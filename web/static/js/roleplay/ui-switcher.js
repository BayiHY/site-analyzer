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
    const container = document.getElementById('gen-controls');
    if (!container) return;

    const phase = state.story?.phase || 'idle';
    const badge = container.querySelector('.phase-badge');
    const status = container.querySelector('.phase-status');
    const btnRegenWw = document.getElementById('btn-regen-worldview');
    const btnGenChars = document.getElementById('btn-generate-chars');
    const btnRegenChars = document.getElementById('btn-regen-chars');

    if (phase === 'idle' || phase === 'worldview') {
        container.classList.add('visible');
        if (badge) { badge.textContent = '📖 世界观'; badge.classList.add('active'); }
        if (status) status.textContent = '准备生成...';
        if (btnRegenWw) btnRegenWw.style.display = 'inline-flex';
        if (btnGenChars) btnGenChars.style.display = 'none';
        if (btnRegenChars) btnRegenChars.style.display = 'none';
    } else if (phase === 'regenerating_worldview') {
        container.classList.add('visible');
        if (badge) { badge.textContent = '📖 世界观'; badge.classList.add('active'); }
        if (status) status.textContent = '生成中...';
        if (btnRegenWw) btnRegenWw.style.display = 'none';
        if (btnGenChars) btnGenChars.style.display = 'none';
        if (btnRegenChars) btnRegenChars.style.display = 'none';
    } else if (phase === 'chat') {
        container.classList.add('visible');
        if (badge) { badge.textContent = '✨ 角色已就绪'; badge.classList.remove('active'); }
        if (status) status.textContent = '可以开始冒险了';
        if (btnRegenWw) btnRegenWw.style.display = 'inline-flex';
        if (btnGenChars) btnGenChars.style.display = 'none';
        if (btnRegenChars) btnRegenChars.style.display = 'inline-flex';
    } else if (phase === 'regenerating_chars') {
        container.classList.add('visible');
        if (badge) { badge.textContent = '✨ 角色'; badge.classList.add('active'); }
        if (status) status.textContent = '生成中...';
        if (btnRegenWw) btnRegenWw.style.display = 'none';
        if (btnGenChars) btnGenChars.style.display = 'none';
        if (btnRegenChars) btnRegenChars.style.display = 'none';
    }
}

App.truncate = function(str, len) {
    return str.length > len ? str.slice(0, len) + '…' : str;
}

App.showSetupScreen = function() {
    document.getElementById('char-setup-screen').style.display = 'flex';
    document.getElementById('chat-screen').style.display = 'none';
}

App.showTyping = function() {
    const activeChar = state.characters[state.activeCharIndex];
    const avatarText = activeChar ? activeChar.name.charAt(0) : '🎭';
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg char';
    div.id = 'typing-indicator';
    div.innerHTML = `
        <div class="avatar">${avatarText}</div>
        <div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

App.hideTyping = function() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}
