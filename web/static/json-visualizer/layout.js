// 布局计算

const ROW_HEIGHT = 30;

// 计算节点高度
function calculateNodeHeight(node) {
    if (node.type === '对象' || node.type === '数组') {
        // 添加额外的内边距和余量
        const baseHeight = 16; // 顶部和底部各8px内边距
        return Math.max(CONFIG.nodeHeight, baseHeight + node.children.length * ROW_HEIGHT);
    }
    return CONFIG.nodeHeight;
}

// 获取需要渲染的子节点（仅对象和数组类型）
function getContainerChildren(node) {
    return node.children.filter(child => child.type === '对象' || child.type === '数组');
}

// 计算子树的总高度
function getSubtreeHeight(node) {
    const nodeHeight = calculateNodeHeight(node);
    const containerChildren = getContainerChildren(node);
    if (node.collapsed || containerChildren.length === 0) {
        return nodeHeight;
    }
    let totalHeight = 0;
    for (let i = 0; i < containerChildren.length; i++) {
        totalHeight += getSubtreeHeight(containerChildren[i]);
        if (i < containerChildren.length - 1) {
            totalHeight += CONFIG.verticalGap;
        }
    }
    return Math.max(nodeHeight, totalHeight);
}

// 递归布局节点
function layoutNode(node, startX, startY) {
    const nodeHeight = calculateNodeHeight(node);
    node.x = startX;
    node.y = startY;
    node.width = CONFIG.nodeWidth;
    node.height = nodeHeight;

    const containerChildren = getContainerChildren(node);
    if (!node.collapsed && containerChildren.length > 0) {
        const startChildX = startX + CONFIG.nodeWidth + CONFIG.horizontalGap;
        
        // 计算所有子节点的总高度
        let totalChildrenHeight = 0;
        for (let i = 0; i < containerChildren.length; i++) {
            totalChildrenHeight += getSubtreeHeight(containerChildren[i]);
            if (i < containerChildren.length - 1) {
                totalChildrenHeight += CONFIG.verticalGap;
            }
        }

        // 从父节点中心开始，向上偏移一半的总高度
        let currentY = startY + nodeHeight / 2 - totalChildrenHeight / 2;

        containerChildren.forEach((child) => {
            const childHeight = getSubtreeHeight(child);
            const childStartY = currentY + (childHeight - calculateNodeHeight(child)) / 2;
            layoutNode(child, startChildX, childStartY);
            currentY += childHeight + CONFIG.verticalGap;
        });
    }
}

// 计算整个树的布局
function calculateLayout(root) {
    layoutNode(root, 100, 150);
}
