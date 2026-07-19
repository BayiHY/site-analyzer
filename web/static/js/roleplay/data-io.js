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
 * 显示 Key 校验加载遮罩
 */
App.showKeyCheckOverlay = function() {
    let el = document.getElementById('key-check-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'key-check-overlay';
        el.className = 'key-check-overlay';
        el.innerHTML = '<div class="key-check-spinner"></div><span>正在校验 API Key…</span>';
        document.body.appendChild(el);
    }
    el.style.display = 'flex';
}

/**
 * 隐藏 Key 校验加载遮罩
 */
App.hideKeyCheckOverlay = function() {
    const el = document.getElementById('key-check-overlay');
    if (el) el.style.display = 'none';
}

/**
 * 校验 API Key 是否有效（发送一个最小请求测试）
 * @returns {Promise<boolean>}
 */
App.validateApiKey = async function(apiKey) {
    if (!apiKey) return false;
    try {
        const resp = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'agnes-2.0-flash',
                messages: [{ role: 'user', content: 'ok' }],
                max_tokens: 1
            }),
            signal: AbortSignal.timeout(15000)
        });
        return resp.ok;
    } catch (e) {
        return false;
    }
};

/**
 * 显示通用错误弹窗（替代 alert）
 * @param {string} message - 错误信息
 * @param {string} [title='⚠️ 提示'] - 弹窗标题
 * @param {Array<{label:string, action:Function, className?:string}>} [buttons] - 自定义按钮
 */
App.showErrorModal = function(message, title = '⚠️ 提示', buttons = null) {
    const overlay = document.createElement('div');
    overlay.className = 'error-modal-overlay';

    let buttonsHtml = '';
    if (buttons && buttons.length > 0) {
        buttonsHtml = '<div class="error-modal-actions">';
        buttons.forEach((btn, i) => {
            const cls = btn.className || 'btn btn-primary';
            buttonsHtml += `<button class="${cls}" id="err-btn-${i}">${btn.label}</button>`;
        });
        buttonsHtml += '</div>';
    }

    overlay.innerHTML = `
        <div class="error-modal-box">
            <h3>${title}</h3>
            <p>${message}</p>
            ${buttonsHtml}
        </div>
    `;
    document.body.appendChild(overlay);

    // 绑定按钮事件
    if (buttons && buttons.length > 0) {
        buttons.forEach((btn, i) => {
            const el = document.getElementById(`err-btn-${i}`);
            if (el) {
                el.addEventListener('click', () => {
                    overlay.remove();
                    btn.action();
                });
            }
        });
    } else {
        // 无按钮则点击遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }
};

/**
 * 显示 Key 校验失败的提示
 */
App.showKeyError = function(message) {
    App.showErrorModal(
        '请输入有效的 API Key 后继续。<br><br>' +
        '还没有 Key？<a href="https://platform.agnes-ai.com/settings/apiKeys" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">点击申请 →</a>',
        '🔑 需要 API Key',
        [{ label: '输入 Key', action: App.promptForKeyInput }]
    );
};

/**
 * 弹出 Key 输入框
 */
App.promptForKeyInput = function() {
    const overlay = document.createElement('div');
    overlay.className = 'error-modal-overlay';
    overlay.innerHTML = `
        <div class="error-modal-box">
            <h3>🔑 输入 API Key</h3>
            <div style="margin-bottom:12px;">
                <input type="password" id="inline-api-key-input" placeholder="输入 API Key (sk-...)" style="width:100%;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:0.9rem;outline:none;">
            </div>
            <div class="error-modal-actions">
                <button class="btn btn-primary" id="inline-key-submit">校验并继续</button>
                <button class="btn btn-outline" id="inline-key-cancel">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById('inline-api-key-input');
    if (input) input.focus();

    document.getElementById('inline-key-submit').addEventListener('click', async () => {
        const apiKey = input?.value.trim();
        if (!apiKey) {
            App.showErrorModal('请输入 API Key', '⚠️ 提示');
            return;
        }
        overlay.remove();
        const valid = await App.validateApiKey(apiKey);
        if (!valid) {
            App.showErrorModal('API Key 无效，请检查后重试', '⚠️ 校验失败');
            return;
        }
        state.apiKeys.chat = apiKey;
        localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));
        // 重新执行存档加载
        if (_pendingImportData) {
            App.startFromArchive(_pendingImportData.data, _pendingImportData.mode || 'continue');
        }
    });

    document.getElementById('inline-key-cancel').addEventListener('click', () => {
        overlay.remove();
    });

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('inline-key-submit')?.click();
            if (e.key === 'Escape') overlay.remove();
        });
    }
};

/**
 * 导入存档并直接继续游戏：恢复角色、图片、对话记录，跳到聊天界面
 */
App.importArchive = async function() {
    // 先校验当前已有的 key
    const existingKey = state.apiKeys.chat || localStorage.getItem('rp_apiKeys');
    if (existingKey) {
        App.showKeyCheckOverlay();
        try {
            const isValid = await App.validateApiKey(existingKey);
            if (!isValid) {
                App.hideKeyCheckOverlay();
                App.showKeyError('API Key 无效');
                return;
            }
        } finally {
            App.hideKeyCheckOverlay();
        }
    } else {
        App.showKeyError('请先填写 API Key');
        return;
    }

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

                _pendingImportData = { data, desc: descLines.join('\n'), mode: 'continue' };

                const modal = document.getElementById('import-modal');
                if (modal) {
                    document.getElementById('import-modal-title').textContent = `📂 ${title}`;
                    document.getElementById('import-modal-desc').textContent = descLines.join('\n');
                    modal.style.display = 'flex';
                } else {
                    // 回退到 confirm
                    const choice = confirm(descLines.join('\n'));
                    _pendingImportData.mode = choice ? 'continue' : 'prologue';
                    await App.startFromArchive(data, _pendingImportData.mode);
                }
            } catch (err) {
                App.showErrorModal('导入失败: 不是有效的 JSON 文件 (' + err.message + ')', '❌ 错误');
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
        _pendingImportData.mode = mode;
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
        if (!apiKey) {
            // 没有 API Key，提示用户填写
            return App.promptForApiKey();
        }
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
        App.showErrorModal('导入失败: ' + err.message, '❌ 错误');
    }
}

App.importData = async function() {
    // 先校验当前已有的 key
    const existingKey = state.apiKeys.chat || localStorage.getItem('rp_apiKeys');
    if (!existingKey) {
        App.showKeyError('请先填写 API Key');
        return;
    }
    try {
        App.showKeyCheckOverlay();
        const isValid = await App.validateApiKey(existingKey);
        if (!isValid) {
            App.showKeyError('API Key 无效');
            return;
        }
    } catch (e) {
        App.showErrorModal('API Key 校验失败，请检查后重试', '❌ 网络错误');
        return;
    } finally {
        App.hideKeyCheckOverlay();
    }

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

                _pendingImportData = { data, desc: descLines.join('\n'), mode: 'continue' };

                const modal = document.getElementById('import-modal');
                if (modal) {
                    document.getElementById('import-modal-title').textContent = `📂 ${title}`;
                    document.getElementById('import-modal-desc').textContent = descLines.join('\n');
                    modal.style.display = 'flex';
                } else {
                    // 回退到 confirm
                    const choice = confirm(descLines.join('\n'));
                    _pendingImportData.mode = choice ? 'continue' : 'prologue';
                    await App.startFromArchive(data, _pendingImportData.mode);
                }
            } catch (err) {
                App.showErrorModal('导入失败: 不是有效的 JSON 文件 (' + err.message + ')', '❌ 错误');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

/**
 * 提示用户填写 API Key（存档中没有时）
 */
App.promptForApiKey = function() {
    App.showKeyError('此存档未包含 API Key');
}
