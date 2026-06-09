// 画布交互（拖拽、缩放）

let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// 触摸相关变量
let isTouching = false;
let touchStartDistance = 0;
let touchStartScale = 1;
let touchStartX = 0;
let touchStartY = 0;
let lastTouchCenterX = 0;
let lastTouchCenterY = 0;

// 计算两点距离
function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// 计算两点中心
function getTouchCenter(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

// 初始化画布交互事件
function initCanvasInteraction() {
    const svg = ELEMENTS.svg;

    // ===== 鼠标事件 =====
    
    // 鼠标按下
    svg.addEventListener('mousedown', (e) => {
        if (e.target === svg || (e.target.tagName === 'path' && !e.target.classList.contains('node'))) {
            isDragging = true;
            dragStartX = e.clientX - offsetX;
            dragStartY = e.clientY - offsetY;
        }
    });

    // 鼠标移动
    svg.addEventListener('mousemove', (e) => {
        if (isDragging) {
            offsetX = e.clientX - dragStartX;
            offsetY = e.clientY - dragStartY;
            svg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        }
    });

    // 鼠标松开
    svg.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // 鼠标离开
    svg.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    // 滚轮缩放
    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scale = Math.min(Math.max(scale * delta, CONFIG.minScale), CONFIG.maxScale);
        svg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    });

    // ===== 触摸事件（移动端支持）=====
    
    // 触摸开始
    svg.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            // 单指拖动
            isTouching = true;
            isDragging = true;
            dragStartX = e.touches[0].clientX - offsetX;
            dragStartY = e.touches[0].clientY - offsetY;
        } else if (e.touches.length === 2) {
            // 双指缩放
            e.preventDefault();
            isTouching = true;
            isDragging = false;
            touchStartDistance = getTouchDistance(e.touches);
            touchStartScale = scale;
            const center = getTouchCenter(e.touches);
            lastTouchCenterX = center.x;
            lastTouchCenterY = center.y;
        }
    }, { passive: false });

    // 触摸移动
    svg.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isDragging) {
            // 单指拖动
            e.preventDefault();
            offsetX = e.touches[0].clientX - dragStartX;
            offsetY = e.touches[0].clientY - dragStartY;
            svg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        } else if (e.touches.length === 2) {
            // 双指缩放 + 平移
            e.preventDefault();
            
            // 计算缩放
            const currentDistance = getTouchDistance(e.touches);
            const scaleChange = currentDistance / touchStartDistance;
            scale = Math.min(Math.max(touchStartScale * scaleChange, CONFIG.minScale), CONFIG.maxScale);
            
            // 计算平移（双指中心移动）
            const center = getTouchCenter(e.touches);
            offsetX += (center.x - lastTouchCenterX);
            offsetY += (center.y - lastTouchCenterY);
            lastTouchCenterX = center.x;
            lastTouchCenterY = center.y;
            
            svg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        }
    }, { passive: false });

    // 触摸结束
    svg.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            isTouching = false;
            isDragging = false;
        } else if (e.touches.length === 1) {
            // 从双指变为单指，切换到拖动模式
            isDragging = true;
            dragStartX = e.touches[0].clientX - offsetX;
            dragStartY = e.touches[0].clientY - offsetY;
        }
    });

    // 触摸取消
    svg.addEventListener('touchcancel', () => {
        isTouching = false;
        isDragging = false;
    });
}

// 重置画布状态
function resetCanvasState() {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    isDragging = false;
    isTouching = false;
    ELEMENTS.svg.style.transform = '';
}
