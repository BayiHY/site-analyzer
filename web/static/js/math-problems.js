// ===== 工具函数 =====
function randInt(min, max) {
    if (min >= max) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ===== 参数名映射（表单ID → URL短参数）=====
const PARAM_MAP = {
    addCount: 'a', subCount: 'b', mixCount: 'c', pageCount: 'p',
    addSubCols: 'd', mixCols: 'e', minNum: 'n', maxNum: 'm',
    fontSize: 's', gapAddSub: 'g', gapMixed: 'k', letterSpacing: 'l', lineHeightMixed: 'x',
};
const SHORT_IDS = Object.keys(PARAM_MAP);
const DEFAULTS = {addCount:'6',subCount:'6',mixCount:'8',pageCount:'1',addSubCols:'3',mixCols:'2',minNum:'100',maxNum:'999',fontSize:'12',gapAddSub:'12',gapMixed:'48',letterSpacing:'1',lineHeightMixed:'8'};

// ===== 从 URL 参数恢复 =====
function restoreFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    let anyUrlParam = false;
    for (const [id, short] of Object.entries(PARAM_MAP)) {
        const val = urlParams.get(short);
        if (val !== null && val !== '') {
            const el = document.getElementById(id);
            if (el) el.value = val;
            anyUrlParam = true;
        }
    }
    if (anyUrlParam) mpLog('info', 'URL', '从 URL 参数恢复: ' + urlParams.toString());
    return anyUrlParam;
}

// ===== 保存参数到缓存 + URL =====
function saveParams() {
    const params = {};
    SHORT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) params[id] = el.value;
    });
    localStorage.setItem('math-problems-params', JSON.stringify(params));
    updateUrlFromParams(params);
    mpLog('info', 'SAVE', '参数已保存: ' + JSON.stringify(params));
}

// ===== 更新 URL 查询字符串（不刷新页面）=====
function updateUrlFromParams(params) {
    const url = new URL(window.location.href);
    Object.values(PARAM_MAP).forEach(v => url.searchParams.delete(v));
    for (const [id, val] of Object.entries(params)) {
        if (val !== DEFAULTS[id]) {
            url.searchParams.set(PARAM_MAP[id], val);
        }
    }
    window.history.replaceState({}, '', url);
}

// ===== 从缓存恢复参数 =====
function restoreParams() {
    try {
        const saved = JSON.parse(localStorage.getItem('math-problems-params'));
        if (saved) {
            SHORT_IDS.forEach(id => {
                if (saved[id]) {
                    const el = document.getElementById(id);
                    if (el) el.value = saved[id];
                }
            });
            mpLog('info', 'RESTORE', '从本地缓存恢复参数');
        }
    } catch (e) {}
}

// ===== 应用字体参数 =====
function applyStyleParams() {
    const preview = document.getElementById('preview');
    preview.style.setProperty('--font-size', document.getElementById('fontSize').value + 'px');
    preview.style.setProperty('--gap-addsub', document.getElementById('gapAddSub').value + 'px');
    preview.style.setProperty('--gap-mixed', document.getElementById('gapMixed').value + 'px');
    preview.style.setProperty('--letter-spacing', document.getElementById('letterSpacing').value + 'px');
    preview.style.setProperty('--line-height-mixed', document.getElementById('lineHeightMixed').value + 'px');
}

// ===== 生成算式（保证数学合法性）=====
function genAddition(n, minN, maxN) {
    const results = [];
    for (let i = 0; i < n; i++) {
        let a, b;
        for (let t = 0; t < 1000; t++) {
            a = randInt(minN, maxN - minN);
            b = randInt(minN, maxN - a);
            if (b >= minN && a + b <= maxN) break;
        }
        if (b < minN || a + b > maxN) { a = minN; b = minN; }
        results.push({ a, b, op: '+' });
    }
    return results;
}

function genSubtraction(n, minN, maxN) {
    const results = [];
    for (let i = 0; i < n; i++) {
        let a, b;
        for (let t = 0; t < 1000; t++) {
            a = randInt(minN, maxN);
            b = randInt(minN, Math.max(minN, a));
            if (a - b >= minN) break;
        }
        if (a - b < minN) {
            a = minN * 2; b = minN;
            if (a > maxN) a = maxN;
            if (a - b < minN) b = a - minN;
        }
        results.push({ a, b, op: '-' });
    }
    return results;
}

function genMixed(n, minN, maxN) {
    const results = [];
    const patterns = ['++', '--', '+-', '-+'];
    const patternList = [];
    while (patternList.length < n) {
        for (const p of patterns) patternList.push(p);
    }
    shuffle(patternList).slice(0, n).forEach(pattern => {
        if (pattern === '++') {
            let a, b, c;
            for (let t = 0; t < 1000; t++) {
                a = randInt(minN, Math.floor(maxN / 3));
                b = randInt(minN, Math.floor((maxN - a) / 2));
                c = randInt(minN, maxN - a - b);
                if (c >= minN && a + b + c <= maxN) break;
            }
            if (c < minN || a + b + c > maxN) { a = minN; b = minN; c = minN; }
            results.push({ a, b, c, op1: '+', op2: '+' });
        } else if (pattern === '--') {
            let a, b, c;
            for (let t = 0; t < 1000; t++) {
                a = randInt(minN, maxN);
                b = randInt(minN, Math.max(minN, a));
                c = randInt(minN, Math.max(minN, a - b));
                if (c >= minN && a - b - c >= minN) break;
            }
            if (c < minN || a - b - c < minN) { a = minN*2; b = minN; c = minN; }
            results.push({ a, b, c, op1: '-', op2: '-' });
        } else if (pattern === '+-') {
            let a, b, c, diff;
            for (let t = 0; t < 1000; t++) {
                a = randInt(minN, maxN);
                b = randInt(minN, Math.max(minN, a));
                diff = a - b;
                c = randInt(minN, Math.max(minN, maxN - diff));
                if (c >= minN && diff + c <= maxN) break;
            }
            if (c < minN || diff + c > maxN) { a = minN*2; b = minN; c = minN; }
            results.push({ a, b, c, op1: '-', op2: '+' });
        } else {
            let a, b, c, sum;
            for (let t = 0; t < 1000; t++) {
                a = randInt(minN, maxN);
                b = randInt(minN, Math.max(minN, maxN - a));
                sum = a + b;
                c = randInt(minN, Math.max(minN, sum - minN));
                if (c >= minN && sum - c >= minN) break;
            }
            if (c < minN || sum - c < minN) { a = minN; b = minN; c = minN; }
            results.push({ a, b, c, op1: '+', op2: '-' });
        }
    });
    return results;
}

function fmtAdd(e) { return `${e.a} + ${e.b} =`; }
function fmtSub(e) { return `${e.a} − ${e.b} =`; }
function fmtMix(e) { return `${e.a} ${e.op1} ${e.b} ${e.op2} ${e.c} =`; }

// ===== 全局状态 =====
let currentProblems = null;
let qrCodeDataUrl = null;

// ===== 生成二维码图片 dataURL =====
async function generateQRCodeAsync() {
    const tempDiv = document.createElement('div');
    new QRCode(tempDiv, {
        text: getShareUrl(),
        width: 200,
        height: 200,
        colorDark: '#1a1a1a',
        colorLight: '#ffffff',
    });
    const canvas = tempDiv.querySelector('canvas');
    if (canvas) qrCodeDataUrl = canvas.toDataURL('image/png');
    else {
        const imgEl = tempDiv.querySelector('img');
        if (imgEl) qrCodeDataUrl = imgEl.src;
    }
    return qrCodeDataUrl;
}

// ===== 生成所有题目（按页数分配）=====
function generateAll() {
    const addCount = parseInt(document.getElementById('addCount').value) || 6;
    const subCount = parseInt(document.getElementById('subCount').value) || 6;
    const mixCount = parseInt(document.getElementById('mixCount').value) || 8;
    const pageCount = parseInt(document.getElementById('pageCount').value) || 1;
    const minNum = parseInt(document.getElementById('minNum').value) || 100;
    const maxNum = parseInt(document.getElementById('maxNum').value) || 999;

    // 表单中的题数是"每页"数量，直接复用
    const addsPerPage = addCount;
    const subsPerPage = subCount;
    const mixesPerPage = mixCount;

    const pages = [];
    for (let i = 0; i < pageCount; i++) {
        pages.push({
            adds: genAddition(addsPerPage, minNum, maxNum),
            subs: genSubtraction(subsPerPage, minNum, maxNum),
            mixes: genMixed(mixesPerPage, minNum, maxNum),
        });
    }

    const total = pages.reduce((s, p) => s + p.adds.length + p.subs.length + p.mixes.length, 0);
    mpLog('info', 'GEN', `生成 ${pages.length} 页，共 ${total} 道题 (加${addsPerPage} 减${subsPerPage} 混${mixesPerPage})`);
    return pages;
}

// ===== 渲染预览 =====
async function renderPreview(pages) {
    const container = document.getElementById('preview');
    container.innerHTML = '';

    // 先应用当前参数
    applyStyleParams();

    const addSubCols = parseInt(document.getElementById('addSubCols').value) || 3;
    const mixCols = parseInt(document.getElementById('mixCols').value) || 2;

    // 预生成二维码
    await generateQRCodeAsync();
    mpLog('info', 'QR', '二维码生成完成');

    pages.forEach((page, idx) => {
        const div = document.createElement('div');
        div.className = 'preview-page';
        div.innerHTML = `
            <div class="preview-page-header">第 ${idx + 1} 页</div>
            <div class="addsub-grid" style="grid-template-columns: repeat(${addSubCols}, 1fr);">
                ${page.adds.map(fmtAdd).map(s => `<div class="preview-problem">${s}</div>`).join('')}
                ${page.subs.map(fmtSub).map(s => `<div class="preview-problem">${s}</div>`).join('')}
            </div>
            <div style="height:16px;"></div>
            <div class="mix-grid" style="grid-template-columns: repeat(${mixCols}, 1fr);">
                ${page.mixes.map(fmtMix).map(s => `<div class="preview-problem">${s}</div>`).join('')}
            </div>
            <div class="page-qr"><img src="${qrCodeDataUrl}" alt="二维码"></div>
        `;
        container.appendChild(div);
    });

    container.classList.add('visible');
    mpLog('info', 'PREVIEW', `预览渲染完成: ${pages.length} 页`);
}

// ===== 预览缩放控制 =====
const PREVIEW_BASE_WIDTH = 332; // 手机端基准宽度

function updatePreviewScale() {
    const preview = document.getElementById('preview');
    if (!preview || !preview.classList.contains('visible')) return;
    
    const vw = window.innerWidth;
    const bodyPadding = 20; // body padding
    const availableWidth = vw - bodyPadding * 2;
    const scale = Math.min(1, availableWidth / PREVIEW_BASE_WIDTH);
    
    preview.style.transform = `scale(${scale})`;
    // 补偿缩放后的底部间距，避免多页重叠
    const scaledBottomMargin = (1 / scale - 1) * PREVIEW_BASE_WIDTH;
    preview.style.marginBottom = `${scaledBottomMargin}px`;
}

// 监听窗口 resize
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updatePreviewScale, 100);
});

// ===== 生成并预览 =====
async function generateAndPreview() {
    const status = document.getElementById('status');
    try {
        saveParams();
        const pages = generateAll();
        currentProblems = pages;
        await renderPreview(pages);
        updatePreviewScale();
        logContainerLayout();
        showStatus(status, 'success', `✅ 已生成 ${pages.length} 页，共 ${pages.reduce((s, p) => s + p.adds.length + p.subs.length + p.mixes.length, 0)} 道题`);
    } catch (e) {
        mpLog('error', 'ERROR', '生成失败: ' + e.message);
        showStatus(status, 'error', `❌ 生成失败: ${e.message}`);
    }
}

// ===== 重置参数 =====
function resetParams() {
    localStorage.removeItem('math-problems-params');
    const url = new URL(window.location.href);
    Object.values(PARAM_MAP).forEach(v => url.searchParams.delete(v));
    window.location.href = url.toString();
}

// ===== 下载 PDF（逐页截图）=====
async function downloadPDF() {
    if (!currentProblems || currentProblems.length === 0) {
        showStatus(document.getElementById('status'), 'error', '⚠️ 请先生成预览');
        mpLog('warn', 'WARN', '未生成预览，无法下载 PDF');
        return;
    }

    const btn = document.getElementById('downloadBtn');
    const status = document.getElementById('status');
    const preview = document.getElementById('preview');

    btn.disabled = true;
    btn.textContent = '⏳ 生成中...';
    showStatus(status, 'info', '📄 正在生成 PDF，请稍候...');
    mpLog('info', 'PDF', '开始生成 PDF...');

    try {
        preview.style.display = 'block';
        const pages = preview.querySelectorAll('.preview-page');

        // 临时取消缩放，让 html2canvas 截到真实基准尺寸
        const originalTransform = preview.style.transform;
        const originalMargin = preview.style.marginBottom;
        preview.style.transform = 'none';
        preview.style.marginBottom = '0';

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        for (let i = 0; i < pages.length; i++) {
            const canvas = await html2canvas(pages[i], {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
            mpLog('info', 'PDF', `第 ${i + 1}/${pages.length} 页截图完成 (${canvas.width}×${canvas.height})`);
        }

        const filename = `数学练习题_${new Date().toISOString().slice(0, 10)}.pdf`;
        pdf.save(filename);
        mpLog('info', 'PDF', `PDF 已下载: ${filename}`);

        showStatus(status, 'success', `✅ PDF 已下载：${filename}`);
    } catch (e) {
        mpLog('error', 'ERROR', 'PDF 生成失败: ' + e.message);
        showStatus(status, 'error', `❌ PDF 生成失败: ${e.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '📥 下载 PDF';
        // 恢复缩放状态
        preview.style.transform = originalTransform;
        preview.style.marginBottom = originalMargin;
    }
}

function showStatus(el, type, msg) {
    el.className = `status ${type}`;
    el.textContent = msg;
}

// ===== 获取分享 URL =====
function getShareUrl() {
    const url = new URL(window.location.href);
    for (const [id, val] of Object.entries(PARAM_MAP)) {
        const el = document.getElementById(id);
        if (el && el.value !== DEFAULTS[id]) {
            url.searchParams.set(val, el.value);
        }
    }
    return url.toString();
}

// ===== 分享弹窗 =====
let isCapturing = false;

function openShareModal() {
    if (!currentProblems || currentProblems.length === 0) {
        showStatus(document.getElementById('status'), 'error', '⚠️ 请先生成预览');
        mpLog('warn', 'WARN', '未生成预览，无法分享');
        return;
    }

    const modal = document.getElementById('shareModal');
    const previewImg = document.getElementById('sharePreviewImg');
    const preview = document.getElementById('preview');

    if (isCapturing) return;
    isCapturing = true;
    modal.classList.add('active');
    mpLog('info', 'SHARE', '打开分享弹窗，开始截图...');

    // 异步截图，不阻塞点击事件
    captureShareImage(preview, previewImg).finally(() => {
        isCapturing = false;
        mpLog('info', 'SHARE', '截图完成，弹窗保持打开');
    });
}

async function captureShareImage(preview, previewImg) {
    try {
        const firstPage = preview.querySelector('.preview-page');
        if (firstPage) {
            preview.style.display = 'block';

            await new Promise(resolve => requestAnimationFrame(resolve));
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(firstPage, {
                scale: 4,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
            });
            previewImg.src = canvas.toDataURL('image/jpeg', 0.9);
            mpLog('info', 'SHARE', `分享截图完成 (${canvas.width}×${canvas.height})`);
        }
    } catch (e) {
        mpLog('error', 'ERROR', '分享截图失败: ' + e.message);
        console.error('生成预览图失败:', e);
    }
}

function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.classList.remove('active');
        mpLog('info', 'SHARE', '关闭分享弹窗');
    }
}

document.addEventListener('click', (e) => {
    const modal = document.getElementById('shareModal');
    if (isCapturing || !modal || !modal.classList.contains('active')) return;
    if (e.target === modal) closeShareModal();
});

// ===== 长按预览图：触发原生复制/保存图片菜单 =====
let longPressTimer;
document.addEventListener('touchstart', (e) => {
    const img = e.target.closest('.share-preview-img');
    if (img) {
        longPressTimer = setTimeout(() => {
            const touch = e.touches[0];
            const event = new MouseEvent('contextmenu', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                bubbles: true
            });
            img.dispatchEvent(event);
        }, 800);
    }
});

document.addEventListener('touchend', () => clearTimeout(longPressTimer));
document.addEventListener('touchmove', () => clearTimeout(longPressTimer));

// ===== 记录容器尺寸与自适应情况 =====
function logContainerLayout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const docW = document.documentElement.clientWidth;
    const docH = document.documentElement.clientHeight;
    const bodyRect = document.body.getBoundingClientRect();
    const containerEl = document.querySelector('.container');
    const containerRect = containerEl ? containerEl.getBoundingClientRect() : null;
    const previewEl = document.getElementById('preview');
    const previewRect = previewEl ? previewEl.getBoundingClientRect() : null;
    const pages = previewEl ? previewEl.querySelectorAll('.preview-page') : [];
    const firstPage = pages[0];
    const firstPageRect = firstPage ? firstPage.getBoundingClientRect() : null;
    const addsubGrids = previewEl ? previewEl.querySelectorAll('.addsub-grid') : [];
    const mixGrids = previewEl ? previewEl.querySelectorAll('.mix-grid') : [];
    const cards = document.querySelectorAll('.card');

    // 获取计算后的 CSS 变量值
    const getCSSVar = (el, prop) => {
        const cs = getComputedStyle(el);
        return cs.getPropertyValue('--' + prop).trim();
    };

    let lines = [];
    lines.push(`[视口] ${vw}×${vh} | 文档 ${docW}×${docH} | body ${Math.round(bodyRect.width)}×${Math.round(bodyRect.height)}`);

    if (containerRect) {
        lines.push(`[布局] .container ${Math.round(containerRect.width)}×${Math.round(containerRect.height)} (max-w=720)`);
    } else {
        lines.push(`[布局] .container N/A`);
    }

    if (previewRect && previewEl.classList.contains('visible')) {
        const previewCS = getComputedStyle(previewEl);
        const pPadL = parseFloat(previewCS.paddingLeft) || 0;
        const pPadT = parseFloat(previewCS.paddingTop) || 0;
        const previewInnerW = Math.round(previewRect.width - pPadL * 2);
        const previewInnerH = Math.round(previewRect.height - pPadT * 2);
        lines.push(`[预览] #preview ${Math.round(previewRect.width)}×${Math.round(previewRect.height)} (内边距 ${Math.round(pPadT)}×${Math.round(pPadL)}, 内容区 ${previewInnerW}×${previewInnerH})`);

        if (firstPageRect) {
            const pageCS = getComputedStyle(firstPage);
            const ppPadT = parseFloat(pageCS.paddingTop) || 0;
            const ppPadL = parseFloat(pageCS.paddingLeft) || 0;
            const pageInnerW = Math.round(firstPageRect.width - ppPadL * 2);
            const pageInnerH = Math.round(firstPageRect.height - ppPadT * 2);
            const aspectRatio = (firstPageRect.width / firstPageRect.height).toFixed(4);
            lines.push(`[纸张] .preview-page ${Math.round(firstPageRect.width)}×${Math.round(firstPageRect.height)} (aspect=${aspectRatio}, 内容区 ${pageInnerW}×${pageInnerH}, padding=${Math.round(ppPadT)}×${Math.round(ppPadL)})`);
        }

        // 预览页数量
        lines.push(`[页数] 共 ${pages.length} 页`);

        // 加/减网格
        if (addsubGrids.length > 0) {
            const g = addsubGrids[0].getBoundingClientRect();
            const gCS = getComputedStyle(addsubGrids[0]);
            const gapVal = gCS.gap || gCS.columnGap || '';
            const headerEl = addsubGrids[0].parentElement?.querySelector('.preview-page-header');
            const headerRect = headerEl ? headerEl.getBoundingClientRect() : null;
            const problemsInAddSub = addsubGrids[0].querySelectorAll('.preview-problem').length;
            lines.push(`[网格] .addsub-grid ${Math.round(g.width)}×${Math.round(g.height)} | 题数:${problemsInAddSub} | gap:${gapVal} | cols:${addsubGrids[0].style.gridTemplateColumns}`);
        }

        // 混合网格
        if (mixGrids.length > 0) {
            const g = mixGrids[0].getBoundingClientRect();
            const gCS = getComputedStyle(mixGrids[0]);
            const gapVal = gCS.rowGap || gCS.gap || '';
            const problemsInMix = mixGrids[0].querySelectorAll('.preview-problem').length;
            lines.push(`[网格] .mix-grid ${Math.round(g.width)}×${Math.round(g.height)} | 题数:${problemsInMix} | row-gap:${gapVal} | cols:${mixGrids[0].style.gridTemplateColumns}`);
        }

        // CSS 变量（实际渲染参数）
        const fs = getCSSVar(previewEl, 'font-size');
        const ga = getCSSVar(previewEl, 'gap-addsub');
        const gm = getCSSVar(previewEl, 'gap-mixed');
        const ls = getCSSVar(previewEl, 'letter-spacing');
        const lh = getCSSVar(previewEl, 'line-height-mixed');
        lines.push(`[样式] --font-size:${fs} --gap-addsub:${ga} --gap-mixed:${gm} --letter-spacing:${ls} --line-height-mixed:${lh}`);

        // 首行实际计算样式
        const firstProblem = previewEl.querySelector('.preview-problem');
        if (firstProblem) {
            const pCS = getComputedStyle(firstProblem);
            lines.push(`[实测] .preview-problem font-size:${pCS.fontSize} line-height:${pCS.lineHeight} padding:${Math.round(parseFloat(pCS.paddingTop))}×${Math.round(parseFloat(pCS.paddingBottom))}`);
        }
    } else {
        lines.push(`[预览] #preview hidden`);
    }

    if (cards.length > 0) {
        const cRect = cards[0].getBoundingClientRect();
        lines.push(`[UI] .card[${cards.length}] ${Math.round(cRect.width)}×${Math.round(cRect.height)}`);
    }

    // 自适应断点判断
    const isMobile = vw < 600;
    const isTablet = vw >= 600 && vw < 720;
    const isDesktop = vw >= 720;
    if (isMobile) lines.push(`[响应] MOBILE(<600) 表单单列/按钮全宽`);
    else if (isTablet) lines.push(`[响应] TABLET(600-720) 表单多列但容器未满`);
    else lines.push(`[响应] DESKTOP(≥720) 容器居中最大720px`);

    mpLog('info', 'PARAM', lines.join('\n'));
}

// ===== 初始化 =====
window.addEventListener('DOMContentLoaded', () => {
    const hasUrlParams = restoreFromUrl();
    if (!hasUrlParams) restoreParams();
    mpLog('info', 'INIT', '页面初始化，开始生成预览');
    generateAndPreview();

    // 根据 URL 参数控制左上角返回链接显示/隐藏，默认显示
    const urlParams = new URLSearchParams(window.location.search);
    const backLink = document.getElementById('backLink');
    const pageTitle = document.getElementById('pageTitle');
    if (urlParams.get('h') === '1' && backLink) {
        backLink.style.display = 'none';
        if (pageTitle) pageTitle.classList.add('no-back-margin');
    }
});

// 监听样式参数变化，实时更新预览
document.querySelectorAll('#fontSize, #gapAddSub, #gapMixed, #letterSpacing, #lineHeightMixed').forEach(input => {
    input.addEventListener('input', () => {
        if (currentProblems && currentProblems.length > 0) {
            applyStyleParams();
            mpLog('info', 'STYLE', `样式参数变更: ${input.id}=${input.value}`);
        }
    });
});

// 监听列数变化，重新渲染预览
['addSubCols', 'mixCols'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        if (currentProblems && currentProblems.length > 0) {
            saveParams();
            mpLog('info', 'PARAM', `列数变更: ${id}=${document.getElementById(id).value}`);
            renderPreview(currentProblems);
        }
    });
});
