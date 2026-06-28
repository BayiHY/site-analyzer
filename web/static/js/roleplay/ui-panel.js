// === Section: 侧边面板 ===
    // ===== 侧边面板 =====
    App.togglePanel = function(type) {
        const panel = document.getElementById('side-panel');
        const overlay = document.getElementById('panel-overlay');
        const title = document.getElementById('panel-title');
        const body = document.getElementById('panel-body');

        rpLog('info', 'PANEL', 'togglePanel: type=' + type + ', currentPanel=' + state.currentPanel);

        if (state.currentPanel === type) {
            closePanel();
            return;
        }

        state.currentPanel = type;
        panel.classList.add('open');
        overlay.classList.add('active');

        if (type === 'characters') {
            title.textContent = '👥 角色';
            try {
                const html = App.renderCharactersPanel();
                rpLog('info', 'PANEL', 'rendered ' + html.length + ' chars of HTML');
                body.innerHTML = html;
            } catch(err) {
                rpLog('error', 'PANEL', 'renderCharactersPanel error: ' + err.message);
                rpLog('error', 'PANEL', 'stack: ' + err.stack);
                body.innerHTML = '<p style="color:red;">渲染角色面板失败: ' + err.message + '</p>';
            }
        } else if (type === 'settings') {
            title.textContent = '⚙️ 设置';
            try {
                const html = App.renderSettingsPanel();
                rpLog('info', 'PANEL', 'rendered ' + html.length + ' chars of settings HTML');
                body.innerHTML = html;
            } catch(err) {
                rpLog('error', 'PANEL', 'renderSettingsPanel error: ' + err.message);
                body.innerHTML = '<p style="color:red;">渲染设置面板失败: ' + err.message + '</p>';
            }
        }
    }

    App.closePanel = function() {
        state.currentPanel = null;
        document.getElementById('side-panel').classList.remove('open');
        document.getElementById('panel-overlay').classList.remove('active');
    }

    App.renderCharactersPanel = function() {
        rpLog('info', 'PANEL', 'renderCharactersPanel: characters=' + (state.characters ? state.characters.length : 'null') + ', active=' + state.activeCharIndex);
        if (!state.characters || state.characters.length === 0) {
            rpLog('warn', 'PANEL', '角色列表为空');
            return '<p style="color:var(--text-dim);text-align:center;padding:20px;">暂无角色</p>';
        }
        rpLog('info', 'PANEL', 'characters data: ' + JSON.stringify(state.characters.map(c => c.name)));
        const result = state.characters.map((c, i) => {
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
                            ${App.renderInfoRow('外貌', c.appearance, rev.appearance)}
                            ${App.renderInfoRow('性格', c.personality, rev.personality)}
                            ${App.renderInfoRow('背景', c.background, rev.background)}
                            ${App.renderInfoRow('关系', c.relationship, rev.relationship)}
                        </div>
                        ${c.perception ? `<div class="char-card-info"><div class="info-row unlocked">玩家印象：${c.perception}</div></div>` : ''}
                        ${c.secret ? `<div class="char-card-info"><div class="info-row unlocked">🔮 秘密：${c.secret}</div></div>` : ''}
                        ${c.currentMood ? `<div class="char-card-info"><div class="info-row unlocked">当前状态：${c.currentMood}</div></div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        rpLog('info', 'PANEL', 'rendered ' + state.characters.length + ' char cards, HTML length=' + result.length);
        // 打印关键样式到日志
        setTimeout(() => {
            logComputedStyles('.side-panel', ['display', 'position', 'top', 'right', 'width', 'height', 'z-index']);
            logComputedStyles('.side-panel.open', ['display', 'right']);
            logComputedStyles('.overlay', ['display', 'position', 'z-index']);
            logComputedStyles('.overlay.active', ['display']);
            logComputedStyles('.char-card', ['background', 'border', 'border-radius', 'padding']);
            logComputedStyles('.char-card-avatar', ['width', 'height', 'border-radius', 'overflow']);
            logComputedStyles('.char-card-avatar img', ['width', 'height', 'object-fit', 'display', 'max-width', 'max-height']);
            logComputedStyles('.char-card-header', ['display', 'gap']);
        }, 100);
        return result;
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
