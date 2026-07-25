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
            "领域": "中小学数学完整知识体系",
            "年级范围": "1-9年级",
            "核心模块": [
                "数与代数",
                "图形与几何",
                "统计与概率",
                "数学广角/综合应用"
            ],
            "知识点分布": {
                "小学阶段": {
                    "一年级": {
                        "数与代数": [
                            "0-20数认识、序数基数",
                            "10以内加减法",
                            "20以内进退位加减",
                            "认识钟表整时半时",
                            "人民币换算",
                            "比较大小多少长短"
                        ],
                        "图形与几何": [
                            "长方体正方体圆柱球辨认",
                            "正方形长方形三角形圆平面图形认识",
                            "上下左右前后方位"
                        ],
                        "统计与概率": [
                            "简单分类整理、分类计数"
                        ],
                        "综合应用": [
                            "看图列式、排队问题、简单比多少应用题"
                        ]
                    },
                    "二年级": {
                        "数与代数": [
                            "100以内进退位加减法",
                            "表内乘除法口诀",
                            "有余数除法",
                            "克与千克",
                            "时分秒换算",
                            "米、厘米长度单位"
                        ],
                        "图形与几何": [
                            "线段射线初步、直角锐角钝角",
                            "观察物体（正面侧面上面）",
                            "轴对称初步认知"
                        ],
                        "统计与概率": [
                            "单式统计表、简单数据汇总"
                        ],
                        "综合应用": [
                            "乘除法应用题、搭配排列、锯木头周期问题"
                        ]
                    },
                    "三年级": {
                        "数与代数": [
                            "万以内进退位加减法",
                            "两位数/三位数乘除一位数",
                            "分数初步认识（读写比较）",
                            "千米、吨单位换算",
                            "年、月、日、平闰年"
                        ],
                        "图形与几何": [
                            "长方形、正方形周长计算",
                            "面积概念、面积单位换算、长正方形面积公式"
                        ],
                        "统计与概率": [
                            "单式条形统计图、读取图表信息"
                        ],
                        "综合应用": [
                            "归一问题、归总问题、基础植树问题、倍数应用题"
                        ]
                    },
                    "四年级": {
                        "数与代数": [
                            "大数读写改写近似数、数位顺序表",
                            "三位数乘两位数、除数是两位数除法",
                            "加法乘法五大运算定律、简便运算",
                            "小数意义性质、小数大小比较",
                            "运算顺序与括号"
                        ],
                        "图形与几何": [
                            "平行与垂直、画垂线平行线",
                            "三角形分类、内角和、三边关系",
                            "平行四边形、梯形特征",
                            "复式条形统计图"
                        ],
                        "统计与概率": [
                            "平均数含义与基础计算"
                        ],
                        "综合应用": [
                            "和差问题、和倍差倍问题、鸡兔同笼入门"
                        ]
                    },
                    "五年级": {
                        "数与代数": [
                            "因数倍数、2/3/5倍数特征、质数合数、最大公因数最小公倍数",
                            "小数四则运算、循环小数",
                            "分数性质约分通分、分数四则运算、分数小数互化",
                            "简易方程、等式性质、解方程"
                        ],
                        "图形与几何": [
                            "长方体正方体棱长总和、表面积、体积、容积换算",
                            "平移、旋转、轴对称图形绘制",
                            "多边形面积（平行四边、三角、梯形）"
                        ],
                        "统计与概率": [
                            "单复式折线统计图",
                            "可能性大小、随机事件判断"
                        ],
                        "综合应用": [
                            "盈亏问题、鸡兔同笼经典题型、分段计费"
                        ]
                    },
                    "六年级": {
                        "数与代数": [
                            "百分数意义、百分率计算、折扣税率利率利息",
                            "比的性质化简比、正反比例判定、比例尺",
                            "鸽巢原理",
                            "分数百分数混合应用题"
                        ],
                        "图形与几何": [
                            "圆半径直径、周长面积、圆环面积",
                            "圆柱表面积体积、圆锥体积",
                            "图形放大与缩小"
                        ],
                        "统计与概率": [
                            "扇形统计图、三类统计图特点选用"
                        ],
                        "综合应用": [
                            "浓度问题、工程行程比例应用题、最值方案问题"
                        ]
                    }
                },
                "初中阶段": {
                    "七年级": {
                        "数与代数": [
                            "有理数概念、数轴相反数绝对值倒数",
                            "有理数乘方混合运算、科学记数法",
                            "整式单项式多项式、同类项合并、整式加减",
                            "一元一次方程解法与配套行程工程应用题",
                            "一元一次不等式及不等式组、数轴表示解集"
                        ],
                        "图形与几何": [
                            "相交线对顶角邻补角、垂线性质",
                            "平行线判定与性质",
                            "命题定理证明",
                            "三角形三边关系内角和外角性质",
                            "全等三角形SSS/SAS/ASA/AAS判定",
                            "平面直角坐标系、象限点对称"
                        ],
                        "统计与概率": [
                            "数据收集整理、抽样普查",
                            "算术平均数、中位数、众数"
                        ],
                        "综合应用": [
                            "分段计费、配套调配应用题、基础几何证明书写"
                        ]
                    },
                    "八年级": {
                        "数与代数": [
                            "平方根算术平方根立方根、实数分类",
                            "二次根式化简运算分母有理化",
                            "幂的运算公式、乘法公式（平方差、完全平方）",
                            "因式分解（提公因式、公式法、十字相乘）",
                            "分式性质约分通分、分式方程与增根检验",
                            "二元一次方程组（代入/加减消元）"
                        ],
                        "图形与几何": [
                            "等腰等边三角形性质判定、直角三角形勾股定理及逆定理",
                            "平行四边形、矩形菱形正方形性质判定",
                            "三角形中位线、梯形基础"
                        ],
                        "统计与概率": [
                            "方差、标准差、分析数据波动程度"
                        ],
                        "综合应用": [
                            "最优方案选择、几何证明拔高题、分式方程组实际应用题"
                        ]
                    },
                    "九年级": {
                        "数与代数": [
                            "一元二次方程四种解法、根判别式Δ、韦达定理根与系数关系"
                        ],
                        "图形与几何": [
                            "相似三角形判定与性质、位似图形",
                            "锐角三角函数sin/cos/tan、特殊角三角函数、解直角三角形（仰角俯角坡度）",
                            "圆：垂径定理、圆心角圆周角、切线判定与切线长、内心外心",
                            "弧长扇形面积、圆锥侧面积计算",
                            "投影、三视图绘制识别"
                        ],
                        "函数": [
                            "一次函数y=kx+b、正比例函数、图像增减性",
                            "反比例函数y=k/x、k几何意义",
                            "二次函数三种解析式、对称轴顶点最值、图像平移、与方程几何结合"
                        ],
                        "统计与概率": [
                            "列表法、树状图求解概率、频率估计概率"
                        ],
                        "综合应用": [
                            "二次函数压轴综合题、几何折叠动点最值、利润面积最值实际问题"
                        ]
                    }
                }
            },
            "核心素养": {
                "数学抽象": "从实物、数字、图形中提炼数学概念、符号与数量关系",
                "逻辑推理": "归纳类比合情推理、几何演绎证明、代数推导运算推理",
                "数学建模": "将生活场景转化为方程、函数、比例、几何模型求解",
                "直观想象": "平面识图、空间立体想象、图形变换拆解、三视图构建",
                "数学运算": "整数小数分式根式方程函数的精准运算、简便运算、验算习惯",
                "数据分析": "辨析统计图特征、计算统计量、分析数据趋势与波动",
                "应用意识": "运用数学知识解决生活计费、行程、方案选择等真实问题"
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
    initZoomSlider();
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
    btn.textContent = collapsed ? '▶ 编辑代码' : '◀ 显示图谱';
}