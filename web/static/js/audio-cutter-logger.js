// === Section: 音频裁剪器日志工具 ===
// 页内调试日志面板 — 与 math-problems 保持一致的底部展开条样式
// 参考: math-problems-logger.js

window._acLogEntries = window._acLogEntries || [];
let _acLogCollapsed = false;
let _acLogPendingRender = false;

// 兼容: 允许在其它脚本 push 后再刷新 (window._logEntries 是原文件旧变量名)
window._logEntries = window._acLogEntries;

const AC_LOG_TAGS = new Set([
    'INIT', 'LOAD', 'DECODE', 'WAVEFORM', 'SELECT',
    'PLAY', 'PAUSE', 'PREVIEW', 'CUT', 'EXPORT', 'DOWNLOAD',
    'ERROR', 'WARN', 'PARAM'
]);

const AC_LEVEL_COLORS = { info: '#4fc3f7', warn: '#ffb74d', error: '#ef5350', debug: '#aaa' };
const AC_PAGE_VERSION = (typeof window.PAGE_VERSION === 'string' && window.PAGE_VERSION) || 'v36';

function acLog(level, tag, msg) {
    const now = new Date();
    const ts = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry = { level, tag, msg, t: Date.now(), ts, ver: AC_PAGE_VERSION };

    // 未被 tag 白名单包含时,只 console 输出,不入面板
    if (!AC_LOG_TAGS.has(tag)) {
        console.log('[' + ts + '] [' + level.toUpperCase() + '] [' + tag + '] [' + AC_PAGE_VERSION + '] ' + msg);
        return;
    }

    console.log('[' + ts + '] [' + level.toUpperCase() + '] [' + tag + '] [' + AC_PAGE_VERSION + '] ' + msg);
    window._acLogEntries.push(entry);

    scheduleAcLogRender();
}

// 暴露到全局,原来页面里 acLog(...) 直接可用
window.acLog = acLog;

function scheduleAcLogRender() {
    if (_acLogPendingRender) return;
    _acLogPendingRender = true;
    requestAnimationFrame(() => {
        _acLogPendingRender = false;
        renderAcLogPanel();
    });
}

function escapeHtmlAc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function renderAcLogEntry(e) {
    const c = AC_LEVEL_COLORS[e.level] || '#ccc';
    return '<div style="color:' + c + ';margin:1px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;"><span style="color:#555;">' + e.ts + '</span> [' + e.tag + ']: ' + escapeHtmlAc(e.msg) + '</div>';
}

function renderAcLogPanel() {
    const panel = document.getElementById('rp-log-panel');
    if (!panel) return;
    if (window.__hideLogPanel) return;
    panel.style.display = 'block';

    const visibleEntries = window._acLogEntries;
    const body = document.getElementById('rp-log-body');

    if (_acLogCollapsed) {
        panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#111;border-top:1px solid #333;z-index:30;';
        panel.innerHTML = '<div id="rp-log-expand" style="padding:4px 8px;font-size:11px;color:#888;cursor:pointer;">🎵 日志 (' + visibleEntries.length + ') · 点击展开</div>';
        document.getElementById('rp-log-expand').onclick = function(e) {
            e.stopPropagation();
            _acLogCollapsed = false;
            renderAcLogPanel();
        };
        return;
    }

    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#111;border-top:1px solid #333;z-index:30;';

    const header = document.getElementById('rp-log-header');
    if (!header) {
        panel.innerHTML = '<div id="rp-log-header" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:2px 4px;border-bottom:1px solid #333;background:#111;user-select:none;"><span style="font-size:10px;color:#888;">🎵 日志 (' + visibleEntries.length + ')</span><div style="display:flex;gap:4px;"><button id="rp-log-copy" title="复制日志" style="background:none;color:#4fc3f7;border:none;font-size:11px;cursor:pointer;line-height:1;">📋</button><button id="rp-log-close" title="收起日志" style="background:none;color:#ef5350;border:none;font-size:14px;cursor:pointer;line-height:1;">×</button></div></div><div id="rp-log-body" style="overflow-y:auto;max-height:240px;padding:4px 8px;"></div>';
        const newBody = document.getElementById('rp-log-body');
        newBody.innerHTML = visibleEntries.map(renderAcLogEntry).join('');
        newBody.scrollTop = newBody.scrollHeight;
        document.getElementById('rp-log-close').onclick = function(e) {
            e.stopPropagation();
            _acLogCollapsed = true;
            renderAcLogPanel();
        };
        document.getElementById('rp-log-copy').onclick = function(e) {
            e.stopPropagation();
            const text = visibleEntries.map(entry => entry.ts + ' [' + entry.tag + '] [' + entry.ver + ']: ' + entry.msg).join('\n');
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
            _acLogCollapsed = true;
            renderAcLogPanel();
        };
        return;
    }

    const headerSpan = header.querySelector('span');
    if (headerSpan) headerSpan.textContent = '🎵 日志 (' + visibleEntries.length + ')';

    if (!body) {
        const div = document.createElement('div');
        div.id = 'rp-log-body';
        div.style.cssText = 'overflow-y:auto;max-height:240px;padding:4px 8px;';
        panel.appendChild(div);
        renderAcLogPanel();
        return;
    }

    const bodyEntryCount = body.children.length;
    if (bodyEntryCount < visibleEntries.length) {
        const fragment = document.createDocumentFragment();
        for (let i = bodyEntryCount; i < visibleEntries.length; i++) {
            const e = visibleEntries[i];
            const div = document.createElement('div');
            div.innerHTML = renderAcLogEntry(e);
            fragment.appendChild(div);
        }
        body.appendChild(fragment);
        body.scrollTop = body.scrollHeight;
    } else if (bodyEntryCount > visibleEntries.length) {
        body.innerHTML = visibleEntries.map(renderAcLogEntry).join('');
    }
}

// 初始化: 默认收起
_acLogCollapsed = true;
acLog('info', 'INIT', '日志工具已就绪');
