// === Section: 消息渲染 ===
// 消息 DOM 创建 + 交互格式解析（{场景}(动作)语言[内心想法]）

App.renderMessage = function(msg) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${msg.role}`;
    div.dataset.msgId = msg.id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    if (msg.role === 'char' && msg.charIndex != null && state.characters[msg.charIndex]) {
        const c = state.characters[msg.charIndex];
        avatar.textContent = c.name?.charAt(0) || '🎭';
        avatar.title = c.name;
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
    } else {
        bubble.innerHTML = App.formatInteraction(msg.content);
    }

    div.appendChild(avatar);
    div.appendChild(bubble);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

App.formatInteraction = function(text) {
    let html = '';
    let remaining = text;

    let parts = [];
    let pos = 0;

    while (pos < remaining.length) {
        let bestMatch = null;
        let bestPos = remaining.length;

        [['{', '}', 'scene'], ['(', ')', 'action'], ['[', ']', 'thought']].forEach(([open, close, type]) => {
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
            default: return App.escHtml(p.content);
        }
    }).join('');
}

App.escHtml = function(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
