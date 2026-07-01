// === Section: 消息渲染 ===
// 消息 DOM 创建 + 多角色格式解析（场景、动作、对话、内心想法、建议回复）

App.renderMessage = function(msg) {
    rpLog('INFO', 'RENDER', `渲染消息: id=${msg.id}, role=${msg.role}, type=${msg.type}, suggestedReplies=${JSON.stringify(msg.suggestedReplies || [])}`);
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${msg.role}`;
    div.dataset.msgId = msg.id;

    // 场景消息：特殊样式
    if (msg.isScene) {
        div.classList.add('scene-msg');
        const bubble = document.createElement('div');
        bubble.className = 'bubble scene-bubble';
        bubble.textContent = msg.content;
        div.appendChild(bubble);
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        return;
    }

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    if (msg.role === 'char' && msg.charIndex != null && state.characters[msg.charIndex]) {
        const c = state.characters[msg.charIndex];
        // 对话头像优先用 portraitImageUrl（全身/半身立绘），fallback 到 faceImageUrl（面部特写）
        const avatarUrl = c.portraitImageUrl || c.faceImageUrl;
        if (avatarUrl) {
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = c.name;
            img.loading = 'lazy';
            img.onerror = function() {
                this.remove();
                avatar.textContent = c.name?.charAt(0) || '🎭';
            };
            avatar.appendChild(img);
        } else {
            avatar.textContent = c.name?.charAt(0) || '🎭';
        }
        avatar.title = c.name;
        avatar.dataset.faceUrl = c.faceImageUrl || '';
        avatar.dataset.portraitUrl = c.portraitImageUrl || '';
        avatar.onclick = function() {
            // 点击放大：优先 portrait，fallback 到 face
            const showUrl = c.portraitImageUrl || c.faceImageUrl;
            if (showUrl) {
                document.getElementById('img-overlay-img').src = showUrl;
                document.getElementById('img-overlay').classList.add('show');
            }
        };
    } else if (msg.role === 'user') {
        // 玩家头像
        const playerFace = state.player?.faceImageUrl;
        if (playerFace) {
            const img = document.createElement('img');
            img.src = playerFace;
            img.alt = '玩家';
            img.loading = 'lazy';
            img.onerror = function() {
                this.remove();
                avatar.textContent = '😊';
            };
            avatar.appendChild(img);
        } else {
            avatar.textContent = '😊';
        }
        avatar.dataset.faceUrl = playerFace || '';
        avatar.onclick = function() {
            if (playerFace) {
                document.getElementById('img-overlay-img').src = playerFace;
                document.getElementById('img-overlay').classList.add('show');
            }
        };
    } else {
        avatar.textContent = msg.role === 'system' ? '⚙️' : '😊';
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (msg.type === 'image') {
        div.classList.add('img-msg');
        const img = document.createElement('img');
        img.src = msg.content;
        img.alt = msg.caption || '';
        img.onclick = () => {
            document.getElementById('img-overlay-img').src = msg.content;
            document.getElementById('img-overlay').classList.add('show');
        };
        if (msg.caption) {
            const cap = document.createElement('div');
            cap.style.cssText = 'font-size:0.8rem;color:var(--text-dim);margin-top:4px;';
            cap.textContent = msg.caption;
            bubble.appendChild(img);
            bubble.appendChild(cap);
        } else {
            bubble.appendChild(img);
        }
    } else if (msg.type === 'system') {
        bubble.style.cssText = 'background:transparent;border:none;font-size:0.75rem;color:var(--text-dim);text-align:center;padding:4px 0;';
        bubble.textContent = msg.content;
    } else if (msg.type === 'multi_char') {
        // 多角色消息：解析 (动作)对话[内心想法]<建议回复>
        bubble.innerHTML = App.formatMultiCharMessage(msg);
    } else if (msg.suggestedReplies && msg.suggestedReplies.length > 0) {
        // 普通文本但有建议回复（如序章开场）：渲染内容 + 胶囊按钮
        const textHtml = App.formatInteraction(msg.content);
        bubble.innerHTML = textHtml;
        // 追加建议回复胶囊
        bubble.innerHTML += '<div class="inline-replies">';
        msg.suggestedReplies.forEach((reply, i) => {
            const escaped = App.escHtml(reply).replace(/'/g, "\\'");
            bubble.innerHTML += `<button class="inline-reply-btn" onclick="App.sendInlineReply('${escaped}', this)">${App.escHtml(reply)}</button>`;
        });
        bubble.innerHTML += '</div>';
    } else {
        // 普通消息：尝试解析交互格式
        bubble.innerHTML = App.formatInteraction(msg.content);
    }

    div.appendChild(avatar);
    div.appendChild(bubble);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // 异步生成语音（不阻塞 UI 渲染）
    if (msg.role === 'char') {
        setTimeout(() => App.attachAudioToBubble(div, msg), 100);
    }
}

// 格式化多角色消息：(动作)对话[内心想法]<建议回复>
App.formatMultiCharMessage = function(msg) {
    const action = msg.action || '';
    const dialogue = msg.dialogue || '';
    const thought = msg.thought || '';
    const suggestedReplies = msg.suggestedReplies || [];
    const charName = msg.charName || '';

    rpLog('INFO', 'FORMAT-MULTI', `多角色消息格式化: charName="${charName}", action="${action}", dialogue="${dialogue}", thought="${thought}", suggestedReplies=${JSON.stringify(suggestedReplies)}`);

    let html = '';

    // 角色名标签（多角色时有）
    if (charName) {
        html += `<span class="char-label">${App.escHtml(charName)}</span> `;
    }

    // 动作
    if (action) {
        html += `<span class="format-action">${App.escHtml('(' + action + ')')}</span>`;
    }

    // 对话
    if (dialogue) {
        html += `<span class="format-speak">${App.escHtml(dialogue)}</span>`;
    }

    // 内心想法：渲染为可折叠按钮
    if (thought) {
        const thoughtId = 'thought_' + msg.id;
        html += ` <button class="thought-btn" data-thought-id="${thoughtId}" onclick="App.toggleThought('${thoughtId}', this)">💭 内心想法</button>`;
        html += `<div class="thought-content" id="${thoughtId}" style="display:none;">${App.escHtml(thought)}</div>`;
    }

    // 建议回复选项：内联显示
    if (suggestedReplies.length > 0) {
        html += '<div class="inline-replies">';
        suggestedReplies.forEach((reply, i) => {
            html += `<button class="inline-reply-btn" onclick="App.sendInlineReply('${App.escHtml(reply).replace(/'/g, "\\'")}', this)">${App.escHtml(reply)}</button>`;
        });
        html += '</div>';
    }

    return html;
}

// 切换内心想法显示/隐藏
App.toggleThought = function(id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    const isVisible = el.style.display !== 'none';
    el.style.display = isVisible ? 'none' : 'block';
    btn.textContent = isVisible ? '💭 内心想法' : '💬 收起想法';
}

// 发送内联建议回复
App.sendInlineReply = async function(text, btn) {
    // 禁用所有内联按钮
    const container = btn.parentElement;
    if (container) {
        container.querySelectorAll('.inline-reply-btn').forEach(b => {
            b.disabled = true;
            b.style.opacity = '0.5';
        });
    }

    // 填充输入框并发送
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = text;
        input.dispatchEvent(new Event('input')); // 触发高度自适应
    }
    await App.sendMessage();
}

// 原有交互格式解析（兼容旧消息）
App.formatInteraction = function(text) {
    let html = '';
    let remaining = text;

    let parts = [];
    let pos = 0;

    while (pos < remaining.length) {
        let bestMatch = null;
        let bestPos = remaining.length;

        [['{', '}', 'scene'], ['(', ')', 'action'], ['[', ']', 'thought'], ['<', '>', 'suggested_replies']].forEach(([open, close, type]) => {
            const idx = remaining.indexOf(open, pos);
            if (idx !== -1 && idx < bestPos) {
                const closeIdx = remaining.indexOf(close, idx + 1);
                if (closeIdx !== -1) {
                    bestMatch = { pos: idx, end: closeIdx + 1, type, content: remaining.slice(idx + 1, closeIdx) };
                    bestPos = idx;
                }
            }
        });

        if (!bestMatch) {
            parts.push({ type: 'text', content: remaining.slice(pos) });
            break;
        }

        if (bestMatch.pos > pos) {
            parts.push({ type: 'text', content: remaining.slice(pos, bestMatch.pos) });
        }
        parts.push(bestMatch);
        pos = bestMatch.end;
    }

    return parts.map(p => {
        switch (p.type) {
            case 'scene': return `<span class="format-scene">${App.escHtml(p.content)}</span>`;
            case 'action': return `<span class="format-action">${App.escHtml(p.content)}</span>`;
            case 'thought': return `<span class="format-thought">${App.escHtml(p.content)}</span>`;
            case 'suggested_replies':
                let replies = p.content.split('|').map(s => {
                    let t = s.trim();
                    t = t.replace(/^["「」]/, '').replace(/[\"」]$/, '');
                    return t;
                }).filter(Boolean);
                // 兜底：如果 | 分隔结果不足，尝试其他分隔符
                if (replies.length < 2) {
                    const fb1 = p.content.split('>。<').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
                    if (fb1.length >= 2) replies = fb1;
                    else {
                        const fb2 = p.content.split('、').map(s => { let t = s.trim(); t = t.replace(/^["「」]/, '').replace(/["」]$/, ''); return t; }).filter(Boolean);
                        if (fb2.length >= 2) replies = fb2;
                    }
                }
                rpLog('INFO', 'FORMAT-INTERACTION', `<> 建议回复解析: ${JSON.stringify(replies)}`);
                if (replies.length === 0) return App.escHtml(p.content);
                let replyHtml = '<div class="inline-replies">';
                replies.forEach((reply, i) => {
                    const escaped = App.escHtml(reply).replace(/'/g, "\\'");
                    replyHtml += `<button class="inline-reply-btn" onclick="App.sendInlineReply('${escaped}', this)">${App.escHtml(reply)}</button>`;
                });
                replyHtml += '</div>';
                return replyHtml;
            default: return App.escHtml(p.content);
        }
    }).join('');
}

App.escHtml = function(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
