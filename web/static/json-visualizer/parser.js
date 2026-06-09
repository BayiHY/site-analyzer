// JSON 解析和树构建

// 解析 JSON 输入
function parseJson() {
    try {
        const input = ELEMENTS.jsonInput.value.trim();
        if (!input) {
            showError('请输入 JSON 数据');
            return null;
        }
        const data = JSON.parse(input);
        hideError();
        return data;
    } catch (e) {
        showError('JSON 解析错误: ' + e.message);
        return null;
    }
}

// 构建树结构
let nodeIdCounter = 0;

// 获取下一个唯一节点ID（供 editor.js 新增节点使用）
function getNextNodeId() {
    return `node_${nodeIdCounter++}`;
}

// 获取树中最大的节点ID数字（用于同步计数器）
function getMaxNodeId(node) {
    let maxId = parseInt(node.id.split('_')[1]);
    for (const child of node.children) {
        maxId = Math.max(maxId, getMaxNodeId(child));
    }
    return maxId;
}

// 同步节点计数器到当前树的最大ID
function syncNodeIdCounter(root) {
    nodeIdCounter = getMaxNodeId(root) + 1;
}

function buildTree(data, parentId = null, key = 'root', depth = 0) {
    // 根节点调用时重置计数器，避免多次生成树时ID重复
    if (depth === 0) {
        nodeIdCounter = 0;
    }
    // 使用数字计数器生成唯一ID，避免中文/特殊字符导致的问题
    const nodeId = getNextNodeId();
    const type = getTypeName(data);
    
    let value = '';
    let fullValue = '';
    
    if (typeof data === 'string') {
        value = `"${data.substring(0, CONFIG.maxStringLength)}${data.length > CONFIG.maxStringLength ? '...' : ''}"`;
        fullValue = `"${data}"`;
    }
    else if (typeof data === 'number' || typeof data === 'boolean') {
        value = String(data);
        fullValue = String(data);
    }
    else if (data === null) {
        value = '空值';
        fullValue = '空值';
    }
    else if (Array.isArray(data)) {
        value = `[${data.length} 项]`;
        fullValue = `数组[${data.length}]`;
    }
    else {
        value = '{对象}';
        fullValue = `对象{${Object.keys(data).length} 个键}`;
    }

    const node = {
        id: nodeId,
        key: key,
        value: value,
        fullValue: fullValue,
        type: type,
        color: getTypeColor(data),
        depth: depth,
        parentId: parentId,
        children: [],
        collapsed: depth > CONFIG.initialExpandDepth,
        x: 0,
        y: 0,
        width: 0,
        height: 0
    };

    // 递归构建子节点
    if (type === '对象' && data !== null) {
        Object.keys(data).forEach(k => {
            const child = buildTree(data[k], nodeId, k, depth + 1);
            if (child) node.children.push(child);
        });
    } else if (type === '数组') {
        data.forEach((item, index) => {
            const child = buildTree(item, nodeId, `[${index}]`, depth + 1);
            if (child) node.children.push(child);
        });
    }

    return node;
}

// 根据 ID 查找节点
function findNodeById(nodeId, root) {
    function search(node) {
        if (node.id === nodeId) return node;
        for (const child of node.children) {
            const found = search(child);
            if (found) return found;
        }
        return null;
    }
    return search(root);
}
