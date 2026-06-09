// 配置和常量
const CONFIG = {
    // 节点尺寸
    nodeWidth: 180,
    nodeHeight: 60,
    horizontalGap: 120,
    verticalGap: 80,
    
    // 缩放限制
    minScale: 0.2,
    maxScale: 3,
    
    // 字符串截断长度
    maxStringLength: 20,
    
    // 初始展开深度
    initialExpandDepth: 1
};

// 节点类型颜色
const COLORS = {
    object: '#00d4ff',
    array: '#667eea',
    string: '#38ef7d',
    number: '#f5576c',
    boolean: '#ffa726',
    null: '#78909c'
};

// DOM 元素引用
const ELEMENTS = {
    svg: null,
    jsonInput: null,
    errorMsg: null,
    nodeCount: null,
    edgeCount: null,
    tooltip: null,
    contextMenu: null,
    editModalOverlay: null,
    deleteConfirmOverlay: null,
    modalTitle: null,
    simpleEdit: null,
    listEdit: null,
    propertyList: null,
    editKey: null,
    editValue: null,
    editBoolean: null,
    valueHint: null,
    editType: null,
    btnCancel: null,
    btnConfirm: null,
    btnAddItem: null,
    btnDeleteCancel: null,
    btnDeleteConfirm: null
};

// 初始化 DOM 元素引用
function initElements() {
    ELEMENTS.svg = document.getElementById('canvas');
    ELEMENTS.jsonInput = document.getElementById('jsonInput');
    ELEMENTS.errorMsg = document.getElementById('errorMsg');
    ELEMENTS.nodeCount = document.getElementById('nodeCount');
    ELEMENTS.edgeCount = document.getElementById('edgeCount');
    ELEMENTS.tooltip = document.getElementById('tooltip');
    ELEMENTS.contextMenu = document.getElementById('contextMenu');
    ELEMENTS.editModalOverlay = document.getElementById('editModalOverlay');
    ELEMENTS.deleteConfirmOverlay = document.getElementById('deleteConfirmOverlay');
    ELEMENTS.modalTitle = document.getElementById('modalTitle');
    ELEMENTS.simpleEdit = document.getElementById('simpleEdit');
    ELEMENTS.listEdit = document.getElementById('listEdit');
    ELEMENTS.propertyList = document.getElementById('propertyList');
    ELEMENTS.editKey = document.getElementById('editKey');
    ELEMENTS.editValue = document.getElementById('editValue');
    ELEMENTS.editBoolean = document.getElementById('editBoolean');
    ELEMENTS.valueHint = document.getElementById('valueHint');
    ELEMENTS.editType = document.getElementById('editType');
    ELEMENTS.btnCancel = document.getElementById('btnCancel');
    ELEMENTS.btnConfirm = document.getElementById('btnConfirm');
    ELEMENTS.btnAddItem = document.getElementById('btnAddItem');
    ELEMENTS.btnDeleteCancel = document.getElementById('btnDeleteCancel');
    ELEMENTS.btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
}
