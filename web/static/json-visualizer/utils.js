// 工具函数

// 获取值的类型颜色
function getTypeColor(value) {
    if (value === null) return COLORS.null;
    if (Array.isArray(value)) return COLORS.array;
    if (typeof value === 'object') return COLORS.object;
    if (typeof value === 'string') return COLORS.string;
    if (typeof value === 'number') return COLORS.number;
    if (typeof value === 'boolean') return COLORS.boolean;
    return COLORS.string;
}

// 获取值的类型名称（中文）
function getTypeName(value) {
    if (value === null) return '空值';
    if (Array.isArray(value)) return '数组';
    if (typeof value === 'object') return '对象';
    if (typeof value === 'string') return '字符串';
    if (typeof value === 'number') return '数字';
    if (typeof value === 'boolean') return '布尔值';
    return typeof value;
}

// 显示错误信息
function showError(msg) {
    ELEMENTS.errorMsg.textContent = msg;
    ELEMENTS.errorMsg.style.display = 'block';
}

// 隐藏错误信息
function hideError() {
    ELEMENTS.errorMsg.style.display = 'none';
}

// 创建 SVG 元素
function createSvgElement(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

// 更新 viewBox
function updateViewBox() {
    const bbox = ELEMENTS.svg.getBBox();
    ELEMENTS.svg.setAttribute('viewBox', `${bbox.x - 50} ${bbox.y - 50} ${bbox.width + 100} ${bbox.height + 100}`);
    ELEMENTS.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}
