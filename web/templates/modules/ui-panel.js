// === Section: 侧边面板 ===
    // ===== 侧边面板 =====
    App.togglePanel = function(type) {
        const panel = document.getElementById('side-panel');
        const overlay = document.getElementById('panel-overlay');
        const title = document.getElementById('panel-title');
        const body = document.getElementById('panel-body');

        if (state.currentPanel === type) {
            closePanel();
            return;
        }

        state.currentPanel = type;
        panel.classList.add('open');
        overlay.classList.add('active');

        if (type === 'characters') {
            title.textContent = '👥 角色';
            body.innerHTML = renderCharactersPanel();
        } else if (type === 'settings') {
            title.textContent = '⚙️ 设置';
            body.innerHTML = renderSettingsPanel();
        }
    }

    App.closePanel = function() {
        state.currentPanel = null;
        document.getElementById('side-panel').classList.remove('open');
        document.getElementById('panel-overlay').classList.remove('active');
    }

    App.renderCharactersPanel = function() {
        if (!state.characters || state.characters.length === 0) {
            return '<p style="color:var(--text-dim);text-align:center;padding:20px;">暂无角色</p>';
        }
        return state.characters.map((c, i) => {
            const isActive = i === state.activeCharIndex;
            const rev = (state.revealed && state.revealed[c.name]) || {};
            const emotions = state.emotions[c.name] || {};
            const emotionEntries = Object.entries(emotions);
            const hasEmotions = emotionEntries.length > 0;

            // 收集已发现的新信息（用于顶部通知）
            const newDiscoveries = [];
            if (rev._lastNew) newDiscoveries.push(...rev._lastNew);

            // 渲染已发现的信息行
            App.renderInfoRow = function(label, value, revealed) {
                if (!value) return '';
                if (!revealed) {
                    return `<div class="info-row locked">${label}：尚未了解</div>`;
                }
                return `<div class="info-row unlocked">${label}：${value}</div>`;
            }

            return `
                <div class="char-card ${isActive ? 'active' : ''}">
                    <div class="char-card-header">
                        <div class="char-card-avatar">
                            ${c.faceImageUrl
                                ? `<img src="${c.faceImageUrl}" onerror="this.parentElement.textContent='🎭'">`
                                : '🎭'}
                        </div>
                        <div>
                            <div class="char-card-name">${c.name}</div>
                            <div class="char-card-expand" onclick="App.toggleCharDetails(${i})">
                                ▼ 查看详情
                            </div>
                        </div>
                    </div>
                    <div class="char-card-details" id="char-details-${i}">
                        ${newDiscoveries.length > 0 ? `
                            <div class="new-discovery">
                                <div class="new-discovery-title">💡 新发现</div>
                                ${newDiscoveries.map(d => `<div>${d}</div>`).join('')}
                            </div>
                        ` : ''}
                        <div class="char-card-info">
                            <div class="info-row unlocked">${c.gender ? (c.gender === '男' ? '♂' : c.gender === '女' ? '♀' : c.gender) + ' ' : ''}年龄：${c.age || '未知'}岁</div>
                            ${c.gender ? `<div class="info-row unlocked">性别：${c.gender}</div>` : ''}
                            ${renderInfoRow('外貌', c.appearance, rev.appearance)}
                            ${renderInfoRow('性格', c.personality, rev.personality)}
                            ${renderInfoRow('背景', c.background, rev.background)}
                            ${renderInfoRow('关系', c.relationship, rev.relationship)}
                        </div>
                        ${c.perception ? `<div class="char-card-info"><div class="info-row unlocked">玩家印象：${c.perception}</div></div>` : ''}
                        ${c.secret ? `<div class="char-card-info"><div class="info-row unlocked">🔮 秘密：${c.secret}</div></div>` : ''}
                        ${c.currentMood ? `<div class="char-card-info"><div class="info-row unlocked">当前状态：${c.currentMood}</div></div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    App.renderSettingsPanel = function() {
        return `
            <div class="setting-item">
                <label>对话 API Key</label>
                <input type="password" id="setting-chat-key" value="${state.apiKeys.chat}" placeholder="输入 Agnes 对话 API Key">
                <div class="setting-hint">用于角色对话的 LLM API 密钥</div>
            </div>
            <div class="setting-item">
                <label>生图 API Key</label>
                <input type="password" id="setting-image-key" value="${state.apiKeys.image}" placeholder="输入 Agnes 生图 API Key">
                <div class="setting-hint">用于角色图片生成的 API 密钥</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="App.saveSettings()" style="margin-top:8px;">保存设置</button>
            <hr style="border-color:var(--border);margin:20px 0;">
            <div class="setting-item">
                <label>故事标题</label>
                <input type="text" id="setting-story-title" value="${state.story ? state.story.title : ''}" placeholder="输入故事标题">
            </div>
            <button class="btn btn-outline btn-sm" onclick="App.exportData()" style="margin-top:8px;width:100%;">导出数据 (JSON)</button>
            <button class="btn btn-outline btn-sm" onclick="App.importData()" style="margin-top:8px;width:100%;">导入数据</button>
        `;
    }
