// === Section: 数学题生成器日志工具 ===
// 页内调试日志面板 — 独立于 roleplay logger

window._mpLogEntries = [];
let _mpLogCollapsed = false;
let _mpLogPendingRender = false;

const MP_LOG_TAGS = new Set([
    'INIT', 'GEN', 'SAVE', 'RESTORE', 'URL', 'STYLE', 'QR',
    'PDF', 'SHARE', 'ERROR', 'WARN', 'PARAM', 'PREVIEW'
]);

function mpLog(level, tag, msg) {
    const now = new Date();
    const ts = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry = { level, tag, msg, t: Date.now(), ts };

    if (!MP_LOG_TAGS.has(tag)) return;

    console.log('[' + ts + '] [' + level.toUpperCase() + '] [' + tag + '] ' + msg);
    window._mpLogEntries.push(entry);

    scheduleMpLogRender();
}

function scheduleMpLogRender() {
    if (_mpLogPendingRender) return;
    _mpLogPendingRender = true;
    requestAnimationFrame(() => {
        _mpLogPendingRender = false;
        renderMpLogPanel();
    });
}

function renderMpLogPanel() {
    const panel = document.getElementById('rp-log-panel');
    if (!panel) return;
    panel.style.display = 'block';

    const visibleEntries = window._mpLogEntries;
    const body = document.getElementById('rp-log-body');
    const levelColor = { info: '#4fc3f7', warn: '#ffb74d', error: '#ef5350', debug: '#aaa' };

    if (_mpLogCollapsed) {
        panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#111;border-top:1px solid #333;z-index:30;';
        panel.innerHTML = '<div id="rp-log-expand" style="padding:4px 8px;font-size:11px;color:#888;cursor:pointer;">🔢 日志 (' + visibleEntries.length + ') · 点击展开</div>';
        document.getElementById('rp-log-expand').onclick = function(e) {
            e.stopPropagation();
            _mpLogCollapsed = false;
            renderMpLogPanel();
        };
        return;
    }

    const header = document.getElementById('rp-log-header');
    if (!header) {
        panel.innerHTML = '<div id="rp-log-header" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:2px 4px;border-bottom:1px solid #333;background:#111;user-select:none;"><span style="font-size:10px;color:#888;">🔢 日志 (' + visibleEntries.length + ')</span><div style="display:flex;gap:4px;"><button id="rp-log-copy" title="复制日志" style="background:none;color:#4fc3f7;border:none;font-size:11px;cursor:pointer;line-height:1;">📋</button><button id="rp-log-close" title="收起日志" style="background:none;color:#ef5350;border:none;font-size:14px;cursor:pointer;line-height:1;">×</button></div></div><div id="rp-log-body" style="overflow-y:auto;max-height:160px;"></div>';
        const newBody = document.getElementById('rp-log-body');
        newBody.innerHTML = visibleEntries.map(e => {
            const c = levelColor[e.level] || '#ccc';
            return '<div style="color:' + c + ';margin:1px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;"><span style="color:#555;">' + e.ts + '</span> [' + e.tag + ']: ' + e.msg + '</div>';
        }).join('');
        newBody.scrollTop = newBody.scrollHeight;
        document.getElementById('rp-log-close').onclick = function(e) {
            e.stopPropagation();
            _mpLogCollapsed = true;
            renderMpLogPanel();
        };
        document.getElementById('rp-log-copy').onclick = function(e) {
            e.stopPropagation();
            const text = visibleEntries.map(entry => entry.ts + ' [' + entry.tag + ']: ' + entry.msg).join('\n');
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('rp-log-copy');
                const orig = btn.innerHTML;
                btn.innerHTML = '✓';
                btn.style.color = '#4caf50';
                setTimeout(() => { btn.innerHTML = orig; btn.style.color = '#4fc3f7'; }, 1500);
            }).catch(() => {
                const btn = document.getElementById('rp-log-copy');
                btn.innerHTML = '✗';
                setTimeout(() => { btn.innerHTML = '📋'; btn.style.color = '#4fc3f7'; }, 1500);
            });
        };
        document.getElementById('rp-log-header').onclick = function(e) {
            e.stopPropagation();
            _mpLogCollapsed = true;
            renderMpLogPanel();
        };
        return;
    }

    // 增量追加新条目
    const headerSpan = header.querySelector('span');
    if (headerSpan) headerSpan.textContent = '🔢 日志 (' + visibleEntries.length + ')';

    if (!body) {
        const div = document.createElement('div');
        div.id = 'rp-log-body';
        div.style.cssText = 'overflow-y:auto;max-height:160px;';
        panel.appendChild(div);
        renderMpLogPanel();
        return;
    }

    const bodyEntryCount = body.children.length;
    if (bodyEntryCount < visibleEntries.length) {
        const fragment = document.createDocumentFragment();
        for (let i = bodyEntryCount; i < visibleEntries.length; i++) {
            const e = visibleEntries[i];
            const c = levelColor[e.level] || '#ccc';
            const div = document.createElement('div');
            div.style.cssText = 'color:' + c + ';margin:1px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;';
            div.innerHTML = '<span style="color:#555;">' + e.ts + '</span> [' + e.tag + ']: ' + e.msg;
            fragment.appendChild(div);
        }
        body.appendChild(fragment);
        body.scrollTop = body.scrollHeight;
    } else if (bodyEntryCount > visibleEntries.length) {
        body.innerHTML = visibleEntries.map(e => {
            const c = levelColor[e.level] || '#ccc';
            return '<div style="color:' + c + ';margin:1px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;"><span style="color:#555;">' + e.ts + '</span> [' + e.tag + ']: ' + e.msg + '</div>';
        }).join('');
    }
}

mpLog('info', 'INIT', '日志工具已就绪');
_mpLogCollapsed = true;
renderMpLogPanel();
