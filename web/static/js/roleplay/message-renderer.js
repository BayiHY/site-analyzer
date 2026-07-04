// === Section: 消息渲染 ===
// 消息 DOM 创建 + 多角色格式解析（场景、动作、对话、内心想法）
// 建议回复选项统一渲染到底部 .reply-options 容器

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
        let avatarUrl = c.portraitImageUrl || c.faceImageUrl;
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
            let showUrl = c.portraitImageUrl || c.faceImageUrl;
            if (showUrl) {
                document.getElementById('img-overlay-img').src = showUrl;
                document.getElementById('img-overlay').classList.add('show');
            }
        };
    } else if (msg.role === 'user') {
        let playerFace = state.player?.faceImageUrl;
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
        avatar.dataset.faceUrl = state.player?.faceImageUrl || '';
        avatar.onclick = function() {
            let pf = state.player?.faceImageUrl;
            if (pf) {
                document.getElementById('img-overlay-img').src = pf;
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
        let imgSrc = msg.content;
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = msg.caption || '';
        img.onclick = () => {
            document.getElementById('img-overlay-img').src = imgSrc;
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
        bubble.innerHTML = App.formatMultiCharMessage(msg);
    } else if (msg.suggestedReplies && msg.suggestedReplies.length > 0) {
        // 普通文本但有建议回复（如序章开场）：渲染内容，选项放到底部容器
        const textHtml = App.formatInteraction(msg.content);
        bubble.innerHTML = textHtml;
    } else {
        bubble.innerHTML = App.formatInteraction(msg.content);
    }

    div.appendChild(avatar);
    div.appendChild(bubble);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // 如果有建议回复，渲染到底部独立容器
    if (msg.suggestedReplies && msg.suggestedReplies.length > 0) {
        App.renderReplyOptions(msg.suggestedReplies, msg.id);
    }

    // 异步生成语音
    if (msg.role === 'char') {
        setTimeout(() => App.attachAudioToBubble(div, msg), 100);
    }
}

// 格式化多角色消息：(动作)对话[内心想法]
// 建议回复选项通过 msg.suggestedReplies 统一渲染到底部容器
App.formatMultiCharMessage = function(msg) {
    const action = msg.action || '';
    const dialogue = msg.dialogue || '';
    const thought = msg.thought || '';
    const charName = msg.charName || '';

    rpLog('INFO', 'FORMAT-MULTI', `多角色消息格式化: charName="${charName}", action="${action}", dialogue="${dialogue}", thought="${thought}"`);

    let html = '';

    if (charName) {
        html += `<span class="char-label">${App.escHtml(charName)}</span> `;
    }

    if (action) {
        html += `<span class="format-action">${App.escHtml(action)}</span>`;
    }

    if (dialogue) {
        html += `<span class="format-speak">${App.escHtml(dialogue)}</span>`;
    }

    if (thought) {
        const thoughtId = 'thought_' + msg.id;
        html += ` <button class="thought-btn" data-thought-id="${thoughtId}" onclick="App.toggleThought('${thoughtId}', this)">💭 内心想法</button>`;
        html += `<div class="thought-content" id="${thoughtId}" style="display:none;">${App.escHtml(thought)}</div>`;
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

// 发送底部容器的建议回复
App.sendReplyOption = async function(text) {
    // 清空输入框旧内容
    const input = document.getElementById('chat-input');
    if (input) input.value = text;

    // 直接调用 sendMessage
    await App.sendMessage();
}

// 原有交互格式解析（兼容旧消息）
App.formatInteraction = function(text) {
    if (!text || text.length > 20000) {
        return App.escHtml(text);
    }
    
    // 检测角色名前缀：冒号前的连续汉字（到空格/换行/其他非汉字符号截断）
    let charLabel = '';
    let labelText = '';
    const charPrefixMatch = text.match(/^([\u4e00-\u9fff]+?)[:：]\s*/);
    if (charPrefixMatch) {
        charLabel = charPrefixMatch[1];
        labelText = charPrefixMatch[1];
        text = text.slice(charPrefixMatch[0].length);
    }
    
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

    const bodyHtml = parts.map(p => {
        switch (p.type) {
            case 'scene': return `<span class="format-scene">${App.escHtml(p.content)}</span>`;
            case 'action': return `<span class="format-action">${App.escHtml(p.content)}</span>`;
            case 'thought': return `<span class="format-thought">${App.escHtml(p.content)}</span>`;
            case 'suggested_replies':
                // <> 标签不再内联渲染按钮，选项由底部 .reply-options 容器统一渲染
                // 如果 msg.suggestedReplies 为空（旧消息兼容），则显示为纯文本
                return `<span class="format-suggested-replies">${App.escHtml(p.content)}</span>`;
            default: return App.escHtml(p.content);
        }
    }).join('');
    
    // 如果有角色名前缀，包装成 label
    if (charLabel) {
        return `<span class="char-label">${App.escHtml(labelText)}</span> ${bodyHtml}`;
    }
    
    return bodyHtml;
}

App.escHtml = function(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
