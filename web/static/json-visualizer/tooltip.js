// Tooltip 功能

// 显示 tooltip
function showTooltip(e, node) {
    let tooltipContent = '';
    
    if ((node.type === '对象' || node.type === '数组') && node.children.length > 0) {
        const simpleChildren = node.children.filter(child => 
            child.type === '字符串' || child.type === '数字' || child.type === '布尔值' || child.type === '空值'
        );
        
        if (simpleChildren.length > 0) {
            simpleChildren.forEach(child => {
                let childValue = child.fullValue;
                if (child.type === '字符串') {
                    childValue = child.fullValue.slice(1, -1);
                } else if (child.type === '布尔值') {
                    childValue = child.fullValue === 'true' ? '是' : '否';
                }
                tooltipContent += `<div><span class="tooltip-key">${child.key}</span>: <span class="tooltip-value">${childValue}</span></div>`;
            });
        } else {
            tooltipContent = `<div class="tooltip-type">${node.type} 没有基本类型属性</div>`;
        }
    } else {
        let valueDisplay = node.fullValue;
        if (node.type === '字符串') {
            valueDisplay = node.fullValue.slice(1, -1);
        } else if (node.type === '布尔值') {
            valueDisplay = node.fullValue === 'true' ? '是' : '否';
        }
        tooltipContent = `
            <div><span class="tooltip-key">${node.key}</span>: <span class="tooltip-value">${valueDisplay}</span></div>
            <div class="tooltip-type">类型: ${node.type}${node.children.length > 0 ? ` | 子节点: ${node.children.length}` : ''}</div>
        `;
    }
    
    ELEMENTS.tooltip.innerHTML = tooltipContent;
    ELEMENTS.tooltip.style.display = 'block';
    
    positionTooltip(e);
}

// 隐藏 tooltip
function hideTooltip() {
    ELEMENTS.tooltip.style.display = 'none';
}

// 更新 tooltip 位置
function updateTooltipPosition(e) {
    if (ELEMENTS.tooltip.style.display === 'none') return;
    positionTooltip(e);
}

// 计算 tooltip 位置（固定在画布左上角）
function positionTooltip(e) {
    const x = 20; // 距离左边 20px
    const y = 20; // 距离顶部 20px
    
    ELEMENTS.tooltip.style.left = x + 'px';
    ELEMENTS.tooltip.style.top = y + 'px';
}
