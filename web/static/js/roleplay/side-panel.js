// === Section: 侧边面板 ===
// 角色面板 + 设置面板渲染

App.renderInfoRow = function(label, value, revealed) {
    if (!value) return '';
    if (!revealed) {
        return `<div class="info-row locked">${label}：尚未了解</div>`;
    }
    return `<div class="info-row unlocked">${label}：${value}</div>`;
}

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
    } else if (type === 'story') {
        title.textContent = '📖 故事概要';
        const story = state.story;
        if (story) {
            body.innerHTML = `
                <div class="setting-item">
                    <label>故事标题</label>
                    <div class="story-field story-title-field">
                        ${App.escapeHtml(story.title || '未命名')}
                    </div>
                </div>
                <div class="setting-item">
                    <label>世界观概要</label>
                    <div class="story-field worldview-field">
                        ${App.escapeHtml(story.worldview || '暂无')}
                    </div>
                </div>
            `;
        } else {
            body.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px;">故事尚未生成</p>';
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

        const newDiscoveries = [];
        if (rev._lastNew) newDiscoveries.push(...rev._lastNew);

        return `
            <div class="char-card ${isActive ? 'active' : ''}">
                <div class="char-card-header">
                    <div class="char-card-avatar">
                        ${c.faceImageUrl
                            ? `<img src="${c.faceImageUrl}" onerror="this.parentElement.textContent='🎭'" title="面部特写">`
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
    return result;
}

App.renderSettingsPanel = function() {
    const ns = state.narrationSettings || { enabled: true, rate: '+0%' };
    const rateVal = parseInt(ns.rate?.replace('%','')) || 0;
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
            <label>🎙️ 环境旁白</label>
            <div class="setting-hint" style="margin-bottom:8px;">场景描述气泡自动生成语音，使用固定女声（xiaoxiao）</div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                <label style="font-size:0.85rem;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" id="setting-narration-enabled" ${ns.enabled !== false ? 'checked' : ''}>
                    启用环境旁白
                </label>
            </div>
            <label style="font-size:0.85rem;color:var(--text);">语速调节</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
                <span style="font-size:0.75rem;color:var(--text-dim);">慢</span>
                <input type="range" id="setting-narration-rate" min="-30" max="30" value="${rateVal}" step="5"
                       style="flex:1;" oninput="document.getElementById('narration-rate-val').textContent=(this.value>=0?'+':'')+this.value+'%'">
                <span style="font-size:0.8rem;color:var(--text);min-width:36px;text-align:right;" id="narration-rate-val">${ns.rate}</span>
                <span style="font-size:0.75rem;color:var(--text-dim);">快</span>
            </div>
            <div class="setting-hint">语速范围 -30% ~ +30%，0% 为标准语速</div>
        </div>
        <hr style="border-color:var(--border);margin:20px 0;">
        <div class="setting-item">
            <label>故事标题</label>
            <div style="padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:#ffffff;font-size:0.9rem;min-height:36px;display:flex;align-items:center;">
                ${state.story ? state.story.title : '—'}
            </div>
        </div>
        <hr style="border-color:var(--border);margin:20px 0;">
        <div class="setting-item" style="opacity:0.7;">
            <label>🎨 画面风格</label>
            <div style="padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.9rem;min-height:36px;display:flex;align-items:center;">
                ${App.getArtStyleDisplayName(state.story?.imageStyle || state.story?.artStyle || 'akira toriyama style')}
            </div>
            <div class="setting-hint">灵感中自动检测的画面风格，不可修改</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="App.exportData()" style="margin-top:8px;width:100%;">导出数据 (JSON)</button>
        <button class="btn btn-outline btn-sm" onclick="App.importData()" style="margin-top:8px;width:100%;">导入数据</button>
    `;
}
