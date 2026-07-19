// === Section: 数据导入导出 ===
// JSON 数据的序列化、反序列化、文件读写

App.exportData = function() {
    const data = {
        characters: state.characters,
        story: state.story,
        emotions: state.emotions,
        revealed: state.revealed,
        messages: state.messages,
        sceneHistory: state.sceneHistory || [],
        currentSceneBg: state.currentSceneBg || '',
        apiKey: state.apiKeys.chat,
        exportTime: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roleplay_${state.story?.title || 'data'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// 暂存待加载的存档数据
let _pendingImportData = null;

/**
 * 导入存档并直接继续游戏：恢复角色、图片、对话记录，跳到聊天界面
 */
App.importArchive = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                // 解析数据，准备显示自定义弹窗
                const title = data.story?.title || data.title || '未命名';
                const charCount = (data.characters || []).length;
                const msgCount = (data.messages || []).length;
                const hasMessages = msgCount > 0;

                const descLines = [`已读取存档「${title}」`, '', `包含 ${charCount} 个角色`];
                if (hasMessages) {
                    descLines.push(`，${msgCount} 条对话记录`, '', '请选择加载方式：', '继续故事 → 保留全部对话', '从序章开始 → 仅加载序章');
                } else {
                    descLines.push('', '开始游戏');
                }

                _pendingImportData = { data, desc: descLines.join('\n') };

                const modal = document.getElementById('import-modal');
                if (modal) {
                    document.getElementById('import-modal-title').textContent = `📂 ${title}`;
                    document.getElementById('import-modal-desc').textContent = descLines.join('\n');
                    modal.style.display = 'flex';
                } else {
                    // 回退到 confirm
                    const choice = confirm(descLines.join('\n'));
                    await App.startFromArchive(data, choice ? 'continue' : 'prologue');
                }
            } catch (err) {
                alert('导入失败: 不是有效的 JSON 文件 (' + err.message + ')');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

/**
 * 处理导入存档的选择按钮
 */
App.importArchiveChoice = async function(mode) {
    const modal = document.getElementById('import-modal');
    if (modal) modal.style.display = 'none';
    if (_pendingImportData) {
        await App.startFromArchive(_pendingImportData.data, mode);
        _pendingImportData = null;
    }
}

/**
 * 从存档直接开始游戏（跳过角色生成，直接使用存档的角色和世界观）
 * @param {Object} data - 存档数据
 * @param {'continue'|'prologue'} mode - 'continue' 继续最新内容 / 'prologue' 仅加载序章
 */
App.startFromArchive = async function(data, mode = 'continue') {
    try {
        // 设置 API Key：优先用存档里的，其次用已有的
        const apiKey = data.apiKey || data.apiKeys?.chat || state.apiKeys.chat || '';
        if (!apiKey) throw new Error('未找到 API Key，请在设置面板填写后重试');
        state.apiKeys.chat = apiKey;
        localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));

        // 恢复状态
        if (data.characters) state.characters = data.characters;
        if (data.story) state.story = data.story;
        if (data.emotions) state.emotions = data.emotions;
        if (data.revealed) state.revealed = data.revealed;
        if (data.player) state.player = data.player;
        if (data.activeCharIndex != null) state.activeCharIndex = data.activeCharIndex;
        if (data.sceneHistory) state.sceneHistory = data.sceneHistory;
        if (data.currentSceneBg) {
            state.currentSceneBg = data.currentSceneBg;
            App.applySceneBackground(data.currentSceneBg);
        }

        // 确保必要的字段存在
        if (!state.story) state.story = {};
        if (!state.story.phase) state.story.phase = 'chat';
        if (!state.story.imageStyle) state.story.imageStyle = 'cel shaded anime style';
        if (!state.characters) state.characters = [];
        if (!state.emotions) state.emotions = {};

        // 迁移旧数据格式
        if (data.character && !state.characters?.length) {
            state.characters = [{
                name: data.character.name || '未知角色',
                age: data.character.age || 20,
                appearance: data.character.appearance || '',
                personality: data.character.personality || '',
                background: data.character.background || '',
                relationship: data.character.relationship || '',
                faceImageUrl: data.character.faceImageUrl || '',
                portraitImageUrl: data.character.portraitImageUrl || ''
            }];
            state.activeCharIndex = 0;
        }

        // 情感键名迁移
        for (const [charName, em] of Object.entries(state.emotions)) {
            if (em['好感度'] !== undefined) em['好感'] = em['好感度'];
            if (em['亲密感'] !== undefined) em['戒备'] = em['亲密感'];
            if (em['信任度'] !== undefined) em['厌恶'] = em['信任度'];
            if (em['吸引力'] !== undefined) em['信任'] = em['吸引力'];
            if (em['依赖感'] !== undefined) em['戒备'] = em['依赖感'];
            delete em['好感度'];
            delete em['亲密感'];
            delete em['信任度'];
            delete em['吸引力'];
            delete em['依赖感'];
        }

        // 处理消息：根据模式决定加载哪些
        if (data.messages && data.messages.length > 0) {
            let messagesToLoad;
            if (mode === 'prologue') {
                // 只保留序章消息（第一个用户消息之前的所有消息，不包含用户消息）
                const firstUserIdx = data.messages.findIndex(m => m.role === 'user');
                if (firstUserIdx !== -1) {
                    messagesToLoad = data.messages.slice(0, firstUserIdx);
                } else {
                    // 没有用户消息，保留全部
                    messagesToLoad = [...data.messages];
                }
            } else {
                messagesToLoad = [...data.messages];
            }
            state.messages = messagesToLoad;
            await saveMessages();
        } else {
            state.messages = [];
        }

        await saveState();

        // 切换到聊天界面
        showChatScreen();
        renderMessages();
        updateStoryHeader();
        updateGenerationControls();

        // 如果有消息，渲染最后一条消息的建议选项
        if (state.messages.length > 0) {
            const lastMsg = state.messages[state.messages.length - 1];
            if (lastMsg.role === 'char' && data.suggestedReplies) {
                App.renderReplyOptions(data.suggestedReplies.slice(0, 4), lastMsg.id);
            }
        }
    } catch (err) {
        alert('导入失败: ' + err.message);
    }
}

App.importData = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                await App.startFromArchive(data);
            } catch (err) {
                alert('导入失败: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}
