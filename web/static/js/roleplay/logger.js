// === Section: 日志工具 ===
// 页内调试日志面板

window._rpLogEntries = [];
let _rpLogCollapsed = false;

function rpLog(level, tag, msg) {
    const now = new Date();
    const ts = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry = { level, tag, msg, t: Date.now(), ts };
    console.log('[' + ts + '] [' + level.toUpperCase() + '] [' + tag + '] ' + msg);
    window._rpLogEntries.push(entry);
    renderLogPanel();
}

function logComputedStyles(selector, props) {
    const el = document.querySelector(selector);
    if (!el) { rpLog('warn', 'STYLE', 'selector not found: ' + selector); return; }
    const cs = getComputedStyle(el);
    const info = props.map(p => p + ': ' + cs[p]).join('; ');
    rpLog('info', 'STYLE', selector + ': ' + info);
}

function renderLogPanel() {
    const panel = document.getElementById('rp-log-panel');
    if (!panel) return;
    panel.style.display = 'block';
    const levelColor = { info: '#4fc3f7', warn: '#ffb74d', error: '#ef5350', debug: '#aaa' };
    if (_rpLogCollapsed) {
        panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#111;border-top:1px solid #333;z-index:9999;';
        panel.innerHTML = '<div id="rp-log-expand" style="padding:4px 8px;font-size:11px;color:#888;cursor:pointer;">' + window._rpLogEntries.length + ' 条日志 · 点击展开</div>';
        document.getElementById('rp-log-expand').onclick = function() {
            _rpLogCollapsed = false;
            rpLog('info', 'LOG', '面板已展开');
        };
        return;
    }
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#0a0a0a;border-top:1px solid #333;z-index:9999;';
    panel.innerHTML = '<div id="rp-log-header" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:2px 4px;border-bottom:1px solid #333;background:#111;user-select:none;"><span style="font-size:10px;color:#888;">📋 日志 (' + window._rpLogEntries.length + ')</span><div style="display:flex;gap:4px;"><button id="rp-log-copy" title="复制日志" style="background:none;color:#4fc3f7;border:none;font-size:11px;cursor:pointer;line-height:1;">📋</button><button id="rp-log-close" title="收起日志" style="background:none;color:#ef5350;border:none;font-size:14px;cursor:pointer;line-height:1;">×</button></div></div><div id="rp-log-body" style="overflow-y:auto;max-height:160px;"></div>';
    const body = document.getElementById('rp-log-body');
    body.innerHTML = window._rpLogEntries.map(e => {
        const c = levelColor[e.level] || '#ccc';
        return '<div style="color:' + c + ';margin:1px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;"><span style="color:#555;">' + e.ts + '</span> [' + e.tag + ']: ' + e.msg + '</div>';
    }).join('');
    body.scrollTop = body.scrollHeight;
    document.getElementById('rp-log-close').onclick = function(e) {
        e.stopPropagation();
        _rpLogCollapsed = true;
        rpLog('info', 'LOG', '面板已收起');
    };
    document.getElementById('rp-log-copy').onclick = function(e) {
        e.stopPropagation();
        const text = window._rpLogEntries.map(e => e.ts + ' [' + e.tag + ']: ' + e.msg).join('\n');
        navigator.clipboard.writeText(text).then(() => rpLog('info', 'LOG', '日志已复制到剪贴板'));
    };
    document.getElementById('rp-log-header').onclick = function() {
        _rpLogCollapsed = true;
        rpLog('info', 'LOG', '面板已收起');
    };
}

rpLog('info', 'INIT', '日志工具已就绪');

// 日志面板默认收起
_rpLogCollapsed = true;
renderLogPanel();
