// === Section: 角色创建 ===
    // ===== 角色创建 =====
    App.createCharacter = async function() {
        const chatKey = document.getElementById('setup-chat-key').value.trim();
        const imageKey = document.getElementById('setup-image-key').value.trim();
        const storyPrompt = document.getElementById('story-prompt').value.trim();

        if (!chatKey) {
            alert('请先填写对话 API Key');
            return;
        }

        // 保存 API Key
        state.apiKeys.chat = chatKey;
        state.apiKeys.image = imageKey;
        localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));

        state.characters = [];
        state.activeCharIndex = 0;
        state.emotions = {};

        state.story = {
            title: '',
            worldview: '',
            mainArc: [],
            currentStage: 1,
            openingScene: ''
        };

        state.messages = [];

        await saveState();
        await saveMessages();

        showChatScreen();
        renderMessages();

        // 自动初始化：生成角色 + 故事 + 序章 + 头像
        document.getElementById('send-btn').disabled = true;
        addSystemMessage('正在初始化故事世界...');

        try {
            await initializeStory(storyPrompt);
        } catch (err) {
            console.error('初始化失败:', err);
            addSystemMessage('初始化完成，可以开始对话了');
        }

        document.getElementById('send-btn').disabled = false;
    }

    App.addSystemMessage = function(text) {
        const msg = {
            id: 'msg_' + Date.now(),
            role: 'system',
            type: 'system',
            content: text,
            timestamp: new Date().toISOString()
        };
        state.messages.push(msg);
        renderMessage(msg);
        saveMessages();
    }
