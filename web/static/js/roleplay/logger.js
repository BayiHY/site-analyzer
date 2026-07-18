// === Section: 日志工具 ===
// 页内调试日志面板
// 性能优化：避免每次 rpLog 都重建整个 DOM，使用增量追加 + 防抖

window._rpLogEntries = [];
let _rpLogCollapsed = false;
let _rpLogPendingRender = false; // 防抖标志

// 日志过滤：精简模式 — 只保留关键 tag
const _RP_LOG_FILTER_ACTIVE = true;
const _RP_LOG_TAGS = new Set(['TITLE', 'SCENE', 'TIMEOUT', 'META', 'PARSE', 'PARSE-REPLY', 'PARSE-COL', 'WORLDVIEW', 'IMG', 'IMG-MODULAR', 'IMG-MODULES', 'IMG-API', 'IMG-IMG2IMG', 'IMG-SANITIZE', 'IMG-BACKUP', 'STYLE', 'CREATE', 'CHARS', 'REGEN', 'LLM', 'LLM-REQUEST', 'LLM-RESPONSE', 'INIT', 'RENDER', 'FORMAT-MULTI', 'FORMAT-INTERACTION', 'CHAR-NAME', 'PARSE-CHAR', 'PARSE-SCENE', 'SCENE-RULE', 'TTS', 'EMOTION', 'EMOTION-DELTA', 'EMOTION-CONFLICT', 'WORLDVIEW-SYNC', 'IMG-SAFETY', 'IMG-MODULAR', 'IMG-MODULES', 'IMG-API', 'IMG-IMG2IMG', 'SCENE-BUILD', 'STRUCTURED', 'STRUCTURED-PARSE']);

function rpLog(level, tag, msg) {
    const now = new Date();
    const ts = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry = { level, tag, msg, t: Date.now(), ts };
    
    // 精简模式：只打印过滤列表中的 tag
    if (_RP_LOG_FILTER_ACTIVE && !_RP_LOG_TAGS.has(tag)) {
        return;
    }
    
    console.log('[' + ts + '] [' + level.toUpperCase() + '] [' + tag + '] ' + msg);
    window._rpLogEntries.push(entry);
    
    // 防抖：批量追加 DOM，避免每次 rpLog 都重建
    scheduleLogRender();
}

function scheduleLogRender() {
    if (_rpLogPendingRender) return;
    _rpLogPendingRender = true;
    // 下一帧渲染，合并多次 rpLog 调用
    requestAnimationFrame(() => {
        _rpLogPendingRender = false;
        renderLogPanel();
    });
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
    
    // 过滤掉渲染相关的日志（RENDER / FORMAT-*），不在面板中显示
    const visibleEntries = window._rpLogEntries.filter(e => {
        const t = (e.tag || '').toUpperCase();
        if (t.startsWith('FORMAT-')) return false;
        if (t === 'RENDER') return false;
        return true;
    });
    
    // ===== 增量更新：只追加新条目，不重建整个 DOM =====
    const body = document.getElementById('rp-log-body');
    const levelColor = { info: '#4fc3f7', warn: '#ffb74d', error: '#ef5350', debug: '#aaa' };
    
    if (_rpLogCollapsed) {
        panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#111;border-top:1px solid #333;z-index:30;';
        panel.innerHTML = '<div id="rp-log-expand" style="padding:4px 8px;font-size:11px;color:#888;cursor:pointer;">' + visibleEntries.length + ' 条日志 · 点击展开</div>';
        document.getElementById('rp-log-expand').onclick = function(e) {
            e.stopPropagation();
            _rpLogCollapsed = false;
            renderLogPanel();
        };
        return;
    }
    
    // 只在首次或 body 不存在时重建头部
    const header = document.getElementById('rp-log-header');
    if (!header) {
        // 首次渲染：构建完整面板
        panel.innerHTML = '<div id="rp-log-header" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:2px 4px;border-bottom:1px solid #333;background:#111;user-select:none;"><span style="font-size:10px;color:#888;">📋 日志 (' + visibleEntries.length + ')</span><div style="display:flex;gap:4px;"><button id="rp-log-copy" title="复制日志" style="background:none;color:#4fc3f7;border:none;font-size:11px;cursor:pointer;line-height:1;">📋</button><button id="rp-log-close" title="收起日志" style="background:none;color:#ef5350;border:none;font-size:14px;cursor:pointer;line-height:1;">×</button></div></div><div id="rp-log-body" style="overflow-y:auto;max-height:160px;"></div>';
        const newBody = document.getElementById('rp-log-body');
        newBody.innerHTML = visibleEntries.map(e => {
            const c = levelColor[e.level] || '#ccc';
            return '<div style="color:' + c + ';margin:1px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;"><span style="color:#555;">' + e.ts + '</span> [' + e.tag + ']: ' + e.msg + '</div>';
        }).join('');
        newBody.scrollTop = newBody.scrollHeight;
        document.getElementById('rp-log-close').onclick = function(e) {
            e.stopPropagation();
            _rpLogCollapsed = true;
            renderLogPanel();
        };
        document.getElementById('rp-log-copy').onclick = function(e) {
            e.stopPropagation();
            // 重新获取最新的 visibleEntries，避免闭包捕获旧值
            const latestVisible = window._rpLogEntries.filter(entry => {
                const t = (entry.tag || '').toUpperCase();
                if (t.startsWith('FORMAT-')) return false;
                if (t === 'RENDER') return false;
                return true;
            });
            const text = latestVisible.map(entry => entry.ts + ' [' + entry.tag + ']: ' + entry.msg).join('\n');
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
            _rpLogCollapsed = true;
            renderLogPanel();
        };
        return;
    }
    
    // ===== 增量追加新条目 =====
    const headerSpan = header.querySelector('span');
    if (headerSpan) headerSpan.textContent = '📋 日志 (' + visibleEntries.length + ')';
    
    if (!body) {
        // body 不存在，重建
        const div = document.createElement('div');
        div.id = 'rp-log-body';
        div.style.cssText = 'overflow-y:auto;max-height:160px;';
        panel.appendChild(div);
        // 重新执行完整渲染
        renderLogPanel();
        return;
    }
    
    // 增量追加：比较 body 中的条目数与 visibleEntries 的长度
    // 由于 FILTER 可能移除部分条目，body.children.length 不一定等于 visibleEntries.length
    // 因此采用追加策略：body 中的每个 div 对应 visibleEntries 中的一个条目
    const bodyEntryCount = body.children.length;
    if (bodyEntryCount < visibleEntries.length) {
        // 追加新增的可见条目
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
        // 条目被过滤掉了，重建 body
        body.innerHTML = visibleEntries.map(e => {
            const c = levelColor[e.level] || '#ccc';
            return '<div style="color:' + c + ';margin:1px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;"><span style="color:#555;">' + e.ts + '</span> [' + e.tag + ']: ' + e.msg + '</div>';
        }).join('');
    }
}

rpLog('info', 'INIT', '日志工具已就绪');

// 日志面板默认收起
_rpLogCollapsed = true;
renderLogPanel();
