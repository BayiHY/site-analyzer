// 渲染相关

let nodes = [];
let edges = [];

// 长按相关变量
let longPressTimer = null;
let longPressNode = null;
let longPressStartPos = { x: 0, y: 0 };
let isMenuVisible = false;

// 隐藏右键菜单
function hideContextMenu() {
    if (ELEMENTS.contextMenu) {
        ELEMENTS.contextMenu.classList.remove('show');
    }
    isMenuVisible = false;
}

// 显示右键菜单
function showContextMenu(x, y) {
    if (!ELEMENTS.contextMenu) return;
    
    ELEMENTS.contextMenu.style.left = `${x}px`;
    ELEMENTS.contextMenu.style.top = `${y}px`;
    ELEMENTS.contextMenu.classList.add('show');
    isMenuVisible = true;
}

// 计算节点高度
function calculateNodeHeight(node) {
    if (node.type === '对象' || node.type === '数组') {
        // 添加额外的内边距和余量
        const baseHeight = 16; // 顶部和底部各8px内边距
        return Math.max(CONFIG.nodeHeight, baseHeight + node.children.length * ROW_HEIGHT);
    }
    return CONFIG.nodeHeight;
}

// 获取值的显示文本
function getValueText(child) {
    if (child.type === '对象') {
        const count = child.children.length;
        return child.collapsed ? `⋯ ${count} 键` : `{${count} 键}`;
    }
    if (child.type === '数组') {
        const count = child.children.length;
        return child.collapsed ? `⋯ ${count} 项` : `[${count} 项]`;
    }
    return child.value;
}

// 获取文本颜色
function getTextColor(type, value) {
    if (value === null) return '#9ca3af';
    if (type === '对象') return '#60a5fa';
    if (type === '数组') return '#c084fc';
    if (type === '数字') return '#f87171';
    if (type === '字符串') return '#4ade80';
    if (type === '布尔值') return value ? '#fbbf24' : '#f87171';
    return '#e5e7eb';
}

// 绘制节点
function drawNode(node) {
    const group = createSvgElement('g');
    group.setAttribute('class', 'node');
    group.setAttribute('data-node-id', node.id);
    group.setAttribute('data-parent-id', node.parentId || '');
    
    const nodeHeight = calculateNodeHeight(node);
    
    // 绘制矩形背景
    const rect = createSvgElement('rect');
    rect.setAttribute('x', node.x);
    rect.setAttribute('y', node.y);
    rect.setAttribute('width', node.width);
    rect.setAttribute('height', nodeHeight);
    rect.setAttribute('rx', 10);
    rect.setAttribute('ry', 10);
    rect.setAttribute('fill', 'var(--node-fill, #1e293b)');
    rect.setAttribute('stroke', 'var(--node-stroke, #475569)');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))');

    // 创建 foreignObject 用于渲染 HTML 内容
    const foreignObject = createSvgElement('foreignObject');
    foreignObject.setAttribute('x', node.x + 8);
    foreignObject.setAttribute('y', node.y + 8);
    foreignObject.setAttribute('width', node.width - 16);
    foreignObject.setAttribute('height', nodeHeight - 16);
    
    // 创建 div 容器
    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    div.style.fontSize = '13px';
    div.style.color = '#e5e7eb';
    div.style.whiteSpace = 'nowrap';
    
    // 对象和数组显示子属性行（参考 JsonCrack 的多行显示）
    if ((node.type === '对象' || node.type === '数组') && node.children.length > 0) {
        // 如果节点被收起，只显示一行摘要信息
        if (node.collapsed) {
            const summaryRow = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
            summaryRow.style.display = 'flex';
            summaryRow.style.alignItems = 'center';
            summaryRow.style.height = `${ROW_HEIGHT}px`;
            summaryRow.style.paddingLeft = node.depth > 0 ? '8px' : '0';
            
            const summarySpan = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
            summarySpan.style.color = '#9ca3af';
            summarySpan.textContent = node.type === '对象' 
                ? `⋯ {${node.children.length} 个键}` 
                : `⋯ [${node.children.length} 项]`;
            summaryRow.appendChild(summarySpan);
            
            div.appendChild(summaryRow);
        } else {
            // 展开状态：显示所有子节点
            node.children.forEach((child, index) => {
            const row = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.height = `${ROW_HEIGHT}px`;
            row.style.cursor = 'pointer';
            
            // 非根节点的子属性需要缩进
            if (node.depth > 0) {
                row.style.paddingLeft = '8px';
            }
            
            // 只有对象和数组类型的子节点才有展开按钮
            const hasChildren = child.type === '对象' || child.type === '数组';
            if (hasChildren) {
                const childToggle = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
                childToggle.style.display = 'inline-flex';
                childToggle.style.alignItems = 'center';
                childToggle.style.justifyContent = 'center';
                childToggle.style.width = '18px';
                childToggle.style.height = '18px';
                childToggle.style.borderRadius = '4px';
                childToggle.style.backgroundColor = child.collapsed ? '#3b82f6' : '#475569';
                childToggle.style.color = '#fff';
                childToggle.style.fontSize = '12px';
                childToggle.style.fontWeight = 'bold';
                childToggle.style.cursor = 'pointer';
                childToggle.style.marginRight = '8px';
                childToggle.style.userSelect = 'none';
                childToggle.textContent = child.collapsed ? '+' : '−';
                row.appendChild(childToggle);
                
                // 使用 onclick 属性绑定事件（foreignObject 内事件冒泡有问题）
                row.style.cursor = 'pointer';
                childToggle.setAttribute('onclick', `window.toggleNodeById('${child.id}'); event.stopPropagation()`);
                row.setAttribute('onclick', `window.toggleNodeById('${child.id}')`);
            } else {
                const spacer = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
                spacer.style.width = '18px';
                spacer.style.display = 'inline-block';
                spacer.style.marginRight = '8px';
                row.appendChild(spacer);
            }
            
            // 键名
            const childKeySpan = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
            childKeySpan.style.color = '#94a3b8';
            childKeySpan.textContent = child.key + ': ';
            row.appendChild(childKeySpan);
            
            // 值
            const valueSpan = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
            valueSpan.style.color = getTextColor(child.type, child.type === '布尔值' ? child.value === 'true' : child.value);
            valueSpan.textContent = getValueText(child);
            row.appendChild(valueSpan);
            
            div.appendChild(row);
            });
        }
    } else if (node.type === '对象' || node.type === '数组') {
        // 空对象或空数组显示类型标识
        const emptyRow = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
        emptyRow.style.display = 'flex';
        emptyRow.style.alignItems = 'center';
        emptyRow.style.height = '28px';
        
        const typeSpan = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
        typeSpan.style.color = '#9ca3af';
        typeSpan.textContent = node.type === '对象' ? '{}' : '[]';
        emptyRow.appendChild(typeSpan);
        
        div.appendChild(emptyRow);
    }
    
    // 基本类型节点显示值
    if (node.type === '字符串' || node.type === '数字' || node.type === '布尔值' || node.type === '空值') {
        const valueRow = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
        valueRow.style.display = 'flex';
        valueRow.style.alignItems = 'center';
        valueRow.style.height = '28px';
        valueRow.style.paddingLeft = '8px';
        
        const valueSpan = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
        valueSpan.style.color = getTextColor(node.type, node.type === '布尔值' ? node.value === 'true' : node.value);
        valueSpan.textContent = node.value;
        valueRow.appendChild(valueSpan);
        
        div.appendChild(valueRow);
    }
    
    foreignObject.appendChild(div);
    group.appendChild(rect);
    group.appendChild(foreignObject);

    // 添加事件监听（仅保留tooltip相关，移除click展开）
    group.addEventListener('mouseenter', (e) => {
        showTooltip(e, node);
    });

    group.addEventListener('mousemove', (e) => {
        updateTooltipPosition(e);
        // 检测鼠标移动，如果移动超过阈值则取消长按
        if (longPressTimer && longPressNode === node) {
            const dx = Math.abs(e.clientX - longPressStartPos.x);
            const dy = Math.abs(e.clientY - longPressStartPos.y);
            if (dx > 10 || dy > 10) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }
    });

    group.addEventListener('mouseleave', () => {
        hideTooltip();
        // 鼠标离开时取消长按
        if (longPressTimer && longPressNode === node) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    });

    // 长按事件处理
    group.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // 只处理左键
        longPressNode = node;
        longPressStartPos = { x: e.clientX, y: e.clientY };
        
        // 800ms后触发长按菜单
        longPressTimer = setTimeout(() => {
            hideTooltip();
            showContextMenu(e.clientX, e.clientY);
            longPressTimer = null;
        }, 800);
    });

    group.addEventListener('mouseup', () => {
        if (longPressTimer && longPressNode === node) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    });

    // 右键菜单事件
    group.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        hideTooltip();
        longPressNode = node;
        showContextMenu(e.clientX, e.clientY);
    });

    return group;
}

// 绘制边
function drawEdge(parentNode, childNode, childKey) {
    const line = createSvgElement('path');
    
    const startX = parentNode.x + parentNode.width;
    const startY = parentNode.y + parentNode.height / 2;
    const endX = childNode.x;
    const endY = childNode.y + childNode.height / 2;
    
    const midX = (startX + endX) / 2;
    
    const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
    line.setAttribute('d', path);
    line.setAttribute('stroke', 'rgba(255,255,255,0.4)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('fill', 'none');

    // 在连线中间添加属性名标注
    const text = createSvgElement('text');
    text.setAttribute('x', midX);
    text.setAttribute('y', (startY + endY) / 2 - 8);
    text.setAttribute('fill', '#94a3b8');
    text.setAttribute('font-size', '12px');
    text.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('pointer-events', 'none');
    
    // 如果属性名过长，截断显示
    const maxKeyLength = 12;
    const displayKey = childKey.length > maxKeyLength ? childKey.substring(0, maxKeyLength) + '...' : childKey;
    text.textContent = displayKey;

    const group = createSvgElement('g');
    group.appendChild(line);
    group.appendChild(text);
    
    return group;
}

// 渲染整个树
function renderTree(root) {
    // 清空画布
    while (ELEMENTS.svg.firstChild) {
        ELEMENTS.svg.removeChild(ELEMENTS.svg.firstChild);
    }

    const defs = createSvgElement('defs');
    ELEMENTS.svg.appendChild(defs);

    edges = [];
    nodes = [];

    function render(node, parentCollapsed = false) {
        // 如果父节点被收起，不渲染当前节点
        if (parentCollapsed) return;

        // 如果当前节点被收起且不是根节点，不渲染
        if (node.collapsed && node.parentId) return;

        const nodeElement = drawNode(node);
        nodes.push(nodeElement);
        ELEMENTS.svg.appendChild(nodeElement);

        // 绘制到父节点的边
        if (node.parentId) {
            const parentNode = findNodeById(node.parentId, root);
            if (parentNode && !parentNode.collapsed) {
                const edge = drawEdge(parentNode, node, node.key);
                edges.push(edge);
                ELEMENTS.svg.insertBefore(edge, nodeElement);
            }
        }

        // 只有对象和数组类型的子节点才渲染为独立方块
        // 字符串、数字等基本类型只在父节点内显示，不创建独立方块
        node.children.forEach(child => {
            if (child.type === '对象' || child.type === '数组') {
                render(child, node.collapsed);
            }
        });
    }

    render(root);

    // 更新统计信息
    ELEMENTS.nodeCount.textContent = nodes.length;
    ELEMENTS.edgeCount.textContent = edges.length;
}
