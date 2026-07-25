// 主入口

let currentRoot = null;
let jsonEditor = null;

// 全局节点切换函数（供 foreignObject 内 onclick 调用）
window.toggleNodeById = function(nodeId) {
    if (event) event.stopPropagation();
    const targetNode = findNodeById(nodeId, currentRoot);
    if (targetNode) {
        toggleNode(targetNode);
    }
};

// 可视化 JSON
function visualizeJson() {
    const data = parseJson();
    if (!data) return;

    currentRoot = buildTree(data);
    calculateLayout(currentRoot);
    renderTree(currentRoot);
    updateViewBox();
    resetCanvasState();
}

// 切换节点展开/收起状态
function toggleNode(node) {
    if (!node) return;
    
    node.collapsed = !node.collapsed;
    calculateLayout(currentRoot);
    renderTree(currentRoot);
    updateViewBox();
}

// 清空画布
function clearCanvas() {
    while (ELEMENTS.svg.firstChild) {
        ELEMENTS.svg.removeChild(ELEMENTS.svg.firstChild);
    }
    ELEMENTS.jsonInput.value = '';
    if (jsonEditor) {
        jsonEditor.setData(null);
    }
    hideError();
    ELEMENTS.nodeCount.textContent = '0';
    ELEMENTS.edgeCount.textContent = '0';
    currentRoot = null;
    resetCanvasState();
}

// 模板数据
const TEMPLATES = {
    default: {
        name: "默认模板",
        data: {
            项目名称: "JSON 可视化工具",
            版本: "4.0.0",
            描述: "支持树视图和图谱可视化的 JSON 编辑器",
            功能列表: ["图谱视图", "树视图", "代码编辑", "导入导出"],
            作者: {
                姓名: "开发者",
                邮箱: "dev@example.com"
            },
            设置: {
                主题: "深色",
                自动布局: true,
                动画效果: true
            }
        }
    },
    "math-knowledge": {
        name: "数学知识点",
        data: {
            "领域": "数与代数",
            "年级范围": "1-9年级",
            "核心模块": [
                "数的认识",
                "数的运算", 
                "常见的量",
                "数量关系",
                "方程",
                "函数"
            ],
            "知识点分布": {
                "小学阶段": {
                    "一年级": ["数数", "10以内加减法"],
                    "二年级": ["100以内加减法", "乘法口诀"],
                    "三年级": ["万以内加减法", "两位数乘除法"],
                    "四年级": ["大数认识", "三位数乘除法"],
                    "五年级": ["分数", "小数"],
                    "六年级": ["百分数", "比例"]
                },
                "初中阶段": {
                    "七年级": ["有理数", "整式"],
                    "八年级": ["分式", "方程组"],
                    "九年级": ["函数", "不等式"]
                }
            },
            "核心素养": {
                "数学抽象": "从具体到抽象的思维过程",
                "逻辑推理": "严谨的推理和证明能力",
                "数学建模": "用数学方法解决实际问题"
            }
        }
    },
    "api-response": {
        name: "API响应",
        data: {
            "status": "success",
            "code": 200,
            "message": "请求成功",
            "data": {
                "users": [
                    {
                        "id": 1,
                        "name": "张三",
                        "email": "zhangsan@example.com",
                        "age": 25,
                        "roles": ["user", "editor"],
                        "profile": {
                            "avatar": "https://example.com/avatar1.jpg",
                            "bio": "前端开发工程师"
                        }
                    },
                    {
                        "id": 2,
                        "name": "李四",
                        "email": "lisi@example.com",
                        "age": 30,
                        "roles": ["admin"],
                        "profile": {
                            "avatar": "https://example.com/avatar2.jpg",
                            "bio": "产品经理"
                        }
                    }
                ],
                "pagination": {
                    "page": 1,
                    "pageSize": 10,
                    "total": 2,
                    "hasNext": false
                }
            },
            "timestamp": "2026-07-25T13:43:00Z"
        }
    },
    "config": {
        name: "配置文件",
        data: {
            "app": {
                "name": "JSON可视化工具",
                "version": "4.0.0",
                "debug": false,
                "port": 3000,
                "host": "localhost"
            },
            "database": {
                "type": "postgresql",
                "host": "localhost",
                "port": 5432,
                "name": "json_visualizer",
                "user": "postgres",
                "password": "password",
                "pool": {
                    "min": 2,
                    "max": 10,
                    "idle": 30000
                }
            },
            "features": {
                "visualization": true,
                "export": true,
                "import": true,
                "share": false,
                "auth": {
                    "enabled": false,
                    "provider": "jwt"
                }
            },
            "logging": {
                "level": "info",
                "file": "logs/app.log",
                "maxSize": "10MB",
                "maxFiles": 5
            }
        }
    },
    "empty": {
        name: "空白模板",
        data: {}
    }
};

// 加载模板
function loadTemplate() {
    const templateSelect = document.getElementById('templateSelect');
    const selectedTemplate = templateSelect.value;
    
    if (TEMPLATES[selectedTemplate]) {
        const templateData = TEMPLATES[selectedTemplate].data;
        ELEMENTS.jsonInput.value = JSON.stringify(templateData, null, 2);
        if (jsonEditor) {
            jsonEditor.setData(templateData);
        }
        visualizeJson();
    }
}

// 设置示例 JSON
function setExampleJson() {
    // 默认加载默认模板
    loadTemplate();
}

// 将树节点转换为JSON对象
function nodeToJson(node) {
    if (node.type === '字符串') {
        return node.value.replace(/^"|"$/g, '');
    } else if (node.type === '数字') {
        return parseFloat(node.value);
    } else if (node.type === '布尔值') {
        return node.value === 'true';
    } else if (node.type === '空值') {
        return null;
    } else if (node.type === '数组') {
        const arr = [];
        node.children.forEach(child => {
            arr.push(nodeToJson(child));
        });
        return arr;
    } else if (node.type === '对象') {
        const obj = {};
        node.children.forEach(child => {
            obj[child.key] = nodeToJson(child);
        });
        return obj;
    }
    return null;
}

// 更新输入框中的JSON
function updateJsonInput() {
    if (!currentRoot) return;
    const jsonData = nodeToJson(currentRoot);
    ELEMENTS.jsonInput.value = JSON.stringify(jsonData, null, 2);
    if (jsonEditor) {
        jsonEditor.setData(jsonData);
    }
}

// 将输入值转换为指定类型
function convertValue(value, type) {
    switch (type) {
        case 'string':
            return value;
        case 'number':
            const num = parseFloat(value);
            return isNaN(num) ? 0 : num;
        case 'boolean':
            return value === 'true' || value === '1';
        case 'null':
            return null;
        case 'object':
            try {
                return JSON.parse(value || '{}');
            } catch {
                return {};
            }
        case 'array':
            try {
                return JSON.parse(value || '[]');
            } catch {
                return [];
            }
        default:
            return value;
    }
}

// 初始化应用
function init() {
    initElements();
    
    // 初始化 JSON 树编辑器
    const editorContainer = document.getElementById('jsonEditor');
    if (editorContainer) {
        jsonEditor = new JsonTreeEditor(editorContainer, ELEMENTS.jsonInput);
        jsonEditor.onChange = visualizeJson;
    }
    
    initCanvasInteraction();
    bindEditorEvents();
    
    document.addEventListener('click', (e) => {
        if (ELEMENTS.contextMenu && !ELEMENTS.contextMenu.contains(e.target)) {
            const isNodeClick = e.target.classList.contains('node') || 
                               e.target.closest('.node') ||
                               e.target.tagName === 'rect' ||
                               e.target.tagName === 'foreignObject';
            
            if (!isNodeClick) {
                hideContextMenu();
            }
        }
    });
    
    setExampleJson();
    visualizeJson();

    // 默认显示树视图，隐藏 textarea
    ELEMENTS.jsonInput.style.display = 'none';
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 视图切换：树视图 ↔ 代码编辑
function switchView(mode) {
    const textarea = ELEMENTS.jsonInput;
    const editor = document.getElementById('jsonEditor');
    const btnTree = document.getElementById('vtTree');
    const btnCode = document.getElementById('vtCode');

    if (mode === 'code') {
        // 切到代码编辑：从树同步数据到 textarea
        if (jsonEditor) textarea.value = JSON.stringify(jsonEditor.data, null, 2);
        textarea.style.display = 'block';
        editor.style.display = 'none';
        btnTree.classList.remove('active');
        btnCode.classList.add('active');
    } else {
        // 切到树视图：从 textarea 解析数据渲染树
        try {
            const data = JSON.parse(textarea.value);
            if (jsonEditor) {
                jsonEditor.setData(data);
            } else {
                jsonEditor = new JsonTreeEditor(editor, textarea);
                jsonEditor.onChange = visualizeJson;
                jsonEditor.setData(data);
            }
        } catch (e) {
            // JSON 不合法，提示错误但仍然切换过去
        }
        textarea.style.display = 'none';
        editor.style.display = 'block';
        btnCode.classList.remove('active');
        btnTree.classList.add('active');
    }
}

// 导入 JSON 文件
function importJson() {
    document.getElementById('fileInput').click();
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        ELEMENTS.jsonInput.value = text;
        try {
            const data = JSON.parse(text);
            if (jsonEditor) jsonEditor.setData(data);
        } catch (err) {
            showError('JSON 解析错误: ' + err.message);
        }
        visualizeJson();
    };
    reader.readAsText(file);
    event.target.value = '';
}

// 导出 JSON 文件
function exportJson() {
    const text = ELEMENTS.jsonInput.value;
    if (!text.trim()) return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
}

// 收起/展开左侧编辑区
function toggleLeftPanel() {
    const left = document.querySelector('.left-panel');
    const btn = document.getElementById('panelToggle');
    const collapsed = left.classList.toggle('collapsed');
    btn.textContent = collapsed ? '▸' : '◂';
    btn.title = collapsed ? '展开编辑区' : '收起编辑区';
}