// === Section: 自动调整输入框高度 ===
// === Section: 清除 API Key ===
// === Section: 初始化 ===
// === Section: 数据导入 ===
// === Section: 数据导出 ===
// === Section: 设置保存 ===
// === Section: 渲染已有消息 ===
// === Section: 恢复 API Key 到设置界面 ===
// === Section: 重置故事 ===
    // ===== 重置故事 =====
    App.resetStory = function() {
        if (!confirm('确定要重新生成随机故事吗？当前故事将被替换为全新的随机故事。')) return;
        
        // 清除当前故事数据，但保留API Key
        state.characters = [];
        state.activeCharIndex = 0;
        state.emotions = {};
        state.messages = [];
        state.story = null;
        state.revealed = {};
        
        // 保存清理后的状态
        localStorage.setItem('rp_state', JSON.stringify(state));
        
        // 重新显示角色创建界面
        document.getElementById('char-setup-screen').style.display = 'flex';
        document.getElementById('chat-screen').style.display = 'none';
        
        // 清空故事设定文本框
        document.getElementById('story-prompt').value = '';
        
        // 显示提示信息
        showNewDiscovery('故事已重置，请点击"开始冒险"生成新的随机故事');
    }

    // ===== 恢复 API Key 到设置界面 =====
    App.restoreApiKeysToInputs = function() {
        const chatInput = document.getElementById('setup-chat-key');
        const imageInput = document.getElementById('setup-image-key');
        if (chatInput && state.apiKeys.chat) chatInput.value = state.apiKeys.chat;
        if (imageInput && state.apiKeys.image) imageInput.value = state.apiKeys.image;
    }

    // ===== 渲染已有消息 =====
    App.renderMessages = function() {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        state.messages.forEach(msg => renderMessage(msg));
        container.scrollTop = container.scrollHeight;
    }

    // ===== 设置保存 =====
    App.saveSettings = function() {
        state.apiKeys.chat = document.getElementById('setting-chat-key').value.trim();
        state.apiKeys.image = document.getElementById('setting-image-key').value.trim();
        localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));
        alert('设置已保存');
    }

    // ===== 数据导出 =====
    App.exportData = function() {
        const data = {
            characters: state.characters,
            story: state.story,
            emotions: state.emotions,
            revealed: state.revealed,
            messages: state.messages,
            exportTime: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roleplay_${state.characters[0]?.name || 'data'}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ===== 数据导入 =====
    App.importData = function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.character) state.character = data.character;
                    if (data.characters) state.characters = data.characters;
                    if (data.story) state.story = data.story;
                    if (data.emotions) state.emotions = data.emotions;
                    if (data.revealed) state.revealed = data.revealed;
                    if (data.messages) { state.messages = data.messages; await saveMessages(); }
                    await saveState();
                    showChatScreen();
                    renderMessages();
                    closePanel();
                    alert('数据导入成功');
                } catch (err) {
                    alert('导入失败: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // ===== 初始化 =====
    App.init = async function() {
        loadSettings();
        restoreApiKeysToInputs();
        const hasState = await loadState();

        if (hasState && (state.character || state.characters?.length)) {
            await loadMessages();
            showChatScreen();
            renderMessages();
        }
    }

    // ===== 清除 API Key =====
    App.clearApiKey = function(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    // ===== 自动调整输入框高度 =====
    document.addEventListener('DOMContentLoaded', () => {
        // 聊天输入框自适应
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });
        }
        // 故事设定 textarea 自适应
        const storyPrompt = document.getElementById('story-prompt');
        if (storyPrompt) {
            // 初始化高度
            storyPrompt.style.height = 'auto';
            storyPrompt.style.height = Math.min(storyPrompt.scrollHeight, 300) + 'px';
            
            // 监听输入事件
            storyPrompt.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 300) + 'px';
            });
            
            // 监听粘贴事件
            storyPrompt.addEventListener('paste', function() {
                setTimeout(() => {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 300) + 'px';
                }, 0);
            });
        }
    });

    // 暴露公共方法
