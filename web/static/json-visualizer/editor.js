// 编辑器功能

let currentEditingNode = null;
let currentEditingMode = null;
let deletingItemIndex = -1;

// 打开编辑模态框
function openEditModal(node) {
    currentEditingNode = node;
    currentEditingMode = 'edit';
    
    if (node.type === '对象' || node.type === '数组') {
        ELEMENTS.modalTitle.textContent = `编辑 ${node.type}`;
        showListEdit();
        renderPropertyList(node);
    } else {
        ELEMENTS.modalTitle.textContent = '修改属性';
        showSimpleEdit();
        ELEMENTS.editKey.value = node.key;
        ELEMENTS.editValue.value = getNodeRawValue(node);
        
        const typeMap = {
            '对象': 'object',
            '数组': 'array',
            '字符串': 'string',
            '数字': 'number',
            '布尔值': 'boolean',
            '空值': 'null'
        };
        const typeValue = typeMap[node.type] || 'string';
        ELEMENTS.editType.value = typeValue;
        
        if (ELEMENTS.editBoolean) {
            ELEMENTS.editBoolean.value = node.type === '布尔值' && node.value === 'true' ? 'true' : 'false';
        }
        
        updateValueInput(typeValue);
    }
    
    ELEMENTS.editModalOverlay.classList.add('show');
}

// 打开新增属性模态框
function openAddModal(node) {
    currentEditingNode = node;
    currentEditingMode = 'add';
    
    ELEMENTS.modalTitle.textContent = '新增属性';
    showSimpleEdit();
    
    if (node.type === '数组') {
        ELEMENTS.editKey.value = `[${node.children.length}]`;
        ELEMENTS.editKey.disabled = true;
        ELEMENTS.editKey.style.opacity = '0.6';
        ELEMENTS.editKey.style.cursor = 'not-allowed';
    } else {
        ELEMENTS.editKey.value = '';
        ELEMENTS.editKey.disabled = false;
        ELEMENTS.editKey.style.opacity = '1';
        ELEMENTS.editKey.style.cursor = 'text';
    }
    
    ELEMENTS.editValue.value = '';
    ELEMENTS.editType.value = 'string';
    
    if (ELEMENTS.editBoolean) {
        ELEMENTS.editBoolean.value = 'true';
    }
    
    updateValueInput('string');
    
    ELEMENTS.editModalOverlay.classList.add('show');
}

// 显示简单编辑界面
function showSimpleEdit() {
    if (ELEMENTS.simpleEdit) {
        ELEMENTS.simpleEdit.style.display = 'block';
    }
    if (ELEMENTS.listEdit) {
        ELEMENTS.listEdit.style.display = 'none';
    }
}

// 显示列表编辑界面
function showListEdit() {
    if (ELEMENTS.simpleEdit) {
        ELEMENTS.simpleEdit.style.display = 'none';
    }
    if (ELEMENTS.listEdit) {
        ELEMENTS.listEdit.style.display = 'block';
    }
}

// 渲染属性列表
function renderPropertyList(node) {
    if (!ELEMENTS.propertyList || !node) return;
    
    ELEMENTS.propertyList.innerHTML = '';
    
    node.children.forEach((child, index) => {
        const item = document.createElement('div');
        item.className = 'property-item';
        item.dataset.index = index;
        
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'property-key';
        keyInput.value = child.key;
        keyInput.placeholder = '键';
        if (node.type === '数组') {
            keyInput.disabled = true;
            keyInput.style.opacity = '0.6';
        }
        
        const isComplexType = child.type === '对象' || child.type === '数组';
        
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'property-value';
        valueInput.value = isComplexType ? '' : getNodeRawValue(child);
        valueInput.placeholder = isComplexType ? '' : '值';
        if (isComplexType) {
            valueInput.disabled = true;
            valueInput.style.opacity = '0.6';
            valueInput.style.cursor = 'not-allowed';
        }
        
        const boolSelect = document.createElement('select');
        boolSelect.className = 'property-bool';
        boolSelect.style.display = 'none';
        const boolOptions = [
            { value: 'true', label: '是' },
            { value: 'false', label: '否' }
        ];
        boolOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            boolSelect.appendChild(option);
        });
        
        const hint = document.createElement('div');
        hint.className = 'property-hint';
        hint.style.display = 'none';
        hint.style.color = '#94a3b8';
        hint.style.fontSize = '12px';
        hint.textContent = '值在子项图块中添加';
        
        const typeSelect = document.createElement('select');
        typeSelect.className = 'property-type';
        const types = [
            { value: 'string', label: '字符串' },
            { value: 'number', label: '数字' },
            { value: 'boolean', label: '布尔' },
            { value: 'null', label: '空值' },
            { value: 'object', label: '对象' },
            { value: 'array', label: '数组' }
        ];
        types.forEach(t => {
            const option = document.createElement('option');
            option.value = t.value;
            option.textContent = t.label;
            typeSelect.appendChild(option);
        });
        
        const typeMap = {
            '字符串': 'string',
            '数字': 'number',
            '布尔值': 'boolean',
            '空值': 'null',
            '对象': 'object',
            '数组': 'array'
        };
        const currentType = typeMap[child.type] || 'string';
        typeSelect.value = currentType;
        
        if (isComplexType) {
            typeSelect.disabled = true;
            typeSelect.style.opacity = '0.6';
            typeSelect.style.cursor = 'not-allowed';
        }
        
        typeSelect.addEventListener('change', (e) => {
            updateListItemValueInput(e.target.value, valueInput, boolSelect, hint);
        });
        
        updateListItemValueInput(currentType, valueInput, boolSelect, hint);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.textContent = '删';
        deleteBtn.addEventListener('click', () => {
            deletingItemIndex = index;
            ELEMENTS.deleteConfirmOverlay.classList.add('show');
        });
        
        item.appendChild(keyInput);
        item.appendChild(valueInput);
        item.appendChild(boolSelect);
        item.appendChild(hint);
        item.appendChild(typeSelect);
        item.appendChild(deleteBtn);
        
        ELEMENTS.propertyList.appendChild(item);
    });
    
    if (node.children.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.color = '#94a3b8';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.padding = '15px';
        emptyMsg.style.fontSize = '13px';
        emptyMsg.textContent = node.type === '对象' ? '暂无属性' : '数组为空';
        ELEMENTS.propertyList.appendChild(emptyMsg);
    }
}

// 更新列表项的值输入控件
function updateListItemValueInput(type, textInput, boolSelect, hint) {
    if (type === 'boolean') {
        textInput.style.display = 'none';
        boolSelect.style.display = 'block';
        hint.style.display = 'none';
    } else if (type === 'null') {
        textInput.style.display = 'none';
        boolSelect.style.display = 'none';
        hint.style.display = 'none';
    } else if (type === 'object' || type === 'array') {
        textInput.style.display = 'none';
        boolSelect.style.display = 'none';
        hint.style.display = 'block';
    } else {
        textInput.style.display = 'block';
        boolSelect.style.display = 'none';
        hint.style.display = 'none';
    }
}

// 确认删除
function confirmDelete() {
    if (currentEditingNode && deletingItemIndex >= 0) {
        currentEditingNode.children.splice(deletingItemIndex, 1);
        calculateLayout(currentRoot);
        renderTree(currentRoot);
        updateViewBox();
        updateJsonInput();
        renderPropertyList(currentEditingNode);
        updateItemIndices();
    }
    cancelDelete();
}

// 取消删除
function cancelDelete() {
    ELEMENTS.deleteConfirmOverlay.classList.remove('show');
    deletingItemIndex = -1;
}

// 关闭模态框
function closeModal() {
    ELEMENTS.editModalOverlay.classList.remove('show');
    
    if (ELEMENTS.editKey) {
        ELEMENTS.editKey.disabled = false;
        ELEMENTS.editKey.style.opacity = '1';
        ELEMENTS.editKey.style.cursor = 'text';
    }
    
    currentEditingNode = null;
    currentEditingMode = null;
}

// 获取节点的原始值
function getNodeRawValue(node) {
    if (node.type === '字符串') {
        return node.value.replace(/^"|"$/g, '');
    } else if (node.type === '布尔值') {
        return node.value === 'true' ? 'true' : 'false';
    } else if (node.type === '数字') {
        return node.value;
    } else if (node.type === '空值') {
        return '';
    }
    return '';
}

// 根据类型切换值输入控件
function updateValueInput(type) {
    if (!ELEMENTS.editValue || !ELEMENTS.editBoolean || !ELEMENTS.valueHint) return;
    
    const textInput = ELEMENTS.editValue;
    const boolSelect = ELEMENTS.editBoolean;
    const hint = ELEMENTS.valueHint;
    
    if (type === 'boolean') {
        textInput.style.display = 'none';
        boolSelect.style.display = 'block';
        hint.style.display = 'none';
    } else if (type === 'null') {
        textInput.style.display = 'none';
        boolSelect.style.display = 'none';
        hint.style.display = 'none';
    } else if (type === 'object' || type === 'array') {
        textInput.style.display = 'none';
        boolSelect.style.display = 'none';
        hint.style.display = 'block';
    } else {
        textInput.style.display = 'block';
        boolSelect.style.display = 'none';
        hint.style.display = 'none';
    }
}

// 获取当前值
function getCurrentValue() {
    const type = ELEMENTS.editType.value;
    
    if (type === 'boolean') {
        return ELEMENTS.editBoolean.value === 'true';
    } else if (type === 'null') {
        return null;
    } else if (type === 'object') {
        return {};
    } else if (type === 'array') {
        return [];
    } else {
        return ELEMENTS.editValue.value;
    }
}

// 保存修改（简单编辑）
function saveSimpleEdit() {
    if (!currentEditingNode) return;
    
    const key = ELEMENTS.editKey.value.trim();
    const type = ELEMENTS.editType.value;
    
    if (!key) {
        showError('请输入属性名称');
        return;
    }
    
    const newValue = getCurrentValue();
    currentEditingNode.key = key;
    currentEditingNode.type = getTypeName(newValue);
    
    if (typeof newValue === 'string') {
        currentEditingNode.value = `"${newValue.substring(0, CONFIG.maxStringLength)}${newValue.length > CONFIG.maxStringLength ? '...' : ''}"`;
        currentEditingNode.fullValue = `"${newValue}"`;
    } else if (typeof newValue === 'number' || typeof newValue === 'boolean') {
        currentEditingNode.value = String(newValue);
        currentEditingNode.fullValue = String(newValue);
    } else if (newValue === null) {
        currentEditingNode.value = '空值';
        currentEditingNode.fullValue = '空值';
    } else if (Array.isArray(newValue)) {
        currentEditingNode.value = `[${newValue.length} 项]`;
        currentEditingNode.fullValue = `数组[${newValue.length}]`;
    } else {
        currentEditingNode.value = '{对象}';
        currentEditingNode.fullValue = `对象{${Object.keys(newValue).length} 个键}`;
    }
    
    currentEditingNode.color = getTypeColor(newValue);
    
    calculateLayout(currentRoot);
    renderTree(currentRoot);
    updateViewBox();
    updateJsonInput();
    
    closeModal();
}

// 保存属性列表修改
function saveListEdit() {
    if (!currentEditingNode) return;
    
    const items = ELEMENTS.propertyList.querySelectorAll('.property-item');
    items.forEach((item, index) => {
        const keyInput = item.querySelector('input.property-key');
        const valueInput = item.querySelector('input.property-value');
        const boolSelect = item.querySelector('select.property-bool');
        const typeSelect = item.querySelector('select.property-type');
        
        if (!keyInput || !valueInput || !typeSelect) return;
        
        const child = currentEditingNode.children[index];
        if (!child) return;
        
        const key = keyInput.value.trim();
        
        if (!key) return;
        
        child.key = key;
        
        if (child.type === '对象' || child.type === '数组') {
            return;
        }
        
        const type = typeSelect.value;
        let value = valueInput.value;
        
        if (type === 'boolean' && boolSelect) {
            value = boolSelect.value;
        }
        
        const newValue = convertValue(value, type);
        child.type = getTypeName(newValue);
        
        if (typeof newValue === 'string') {
            child.value = `"${newValue.substring(0, CONFIG.maxStringLength)}${newValue.length > CONFIG.maxStringLength ? '...' : ''}"`;
            child.fullValue = `"${newValue}"`;
        } else if (typeof newValue === 'number' || typeof newValue === 'boolean') {
            child.value = String(newValue);
            child.fullValue = String(newValue);
        } else if (newValue === null) {
            child.value = '空值';
            child.fullValue = '空值';
        }
        
        child.color = getTypeColor(newValue);
    });
    
    calculateLayout(currentRoot);
    renderTree(currentRoot);
    updateViewBox();
    updateJsonInput();
    
    closeModal();
}

// 保存新增属性
function saveAdd() {
    if (!currentEditingNode) return;
    
    let key = ELEMENTS.editKey.value.trim();
    const type = ELEMENTS.editType.value;
    const parentNode = currentEditingNode;
    
    if (parentNode.type === '数组') {
        key = `[${parentNode.children.length}]`;
    } else if (!key) {
        showError('请输入属性名称');
        return;
    }
    
    const newValue = getCurrentValue();
    
    let nodeValue = '';
    let nodeFullValue = '';
    const nodeType = getTypeName(newValue);
    
    if (typeof newValue === 'string') {
        nodeValue = `"${newValue.substring(0, CONFIG.maxStringLength)}${newValue.length > CONFIG.maxStringLength ? '...' : ''}"`;
        nodeFullValue = `"${newValue}"`;
    } else if (typeof newValue === 'number' || typeof newValue === 'boolean') {
        nodeValue = String(newValue);
        nodeFullValue = String(newValue);
    } else if (newValue === null) {
        nodeValue = '空值';
        nodeFullValue = '空值';
    } else if (Array.isArray(newValue)) {
        nodeValue = `[${newValue.length} 项]`;
        nodeFullValue = `数组[${newValue.length}]`;
    } else {
        nodeValue = '{对象}';
        nodeFullValue = `对象{${Object.keys(newValue).length} 个键}`;
    }
    
    // 同步计数器到当前树的最大ID（避免新增节点与现有ID冲突）
    syncNodeIdCounter(currentRoot);
    
    const newNode = {
        id: getNextNodeId(),
        key: key,
        value: nodeValue,
        fullValue: nodeFullValue,
        type: nodeType,
        color: getTypeColor(newValue),
        depth: parentNode.depth + 1,
        parentId: parentNode.id,
        children: [],
        collapsed: (parentNode.depth + 1) > CONFIG.initialExpandDepth,
        x: 0,
        y: 0,
        width: 0,
        height: 0
    };
    
    if (nodeType === '对象') {
        Object.keys(newValue).forEach(k => {
            const child = buildTree(newValue[k], newNode.id, k, newNode.depth + 1);
            if (child) newNode.children.push(child);
        });
    } else if (nodeType === '数组') {
        newValue.forEach((item, index) => {
            const child = buildTree(item, newNode.id, `[${index}]`, newNode.depth + 1);
            if (child) newNode.children.push(child);
        });
    }
    
    parentNode.children.push(newNode);
    
    calculateLayout(currentRoot);
    renderTree(currentRoot);
    updateViewBox();
    updateJsonInput();
    
    closeModal();
}

// 更新列表项索引
function updateItemIndices() {
    const items = ELEMENTS.propertyList.querySelectorAll('.property-item');
    items.forEach((item, index) => {
        item.dataset.index = index;
        const keyInput = item.querySelector('input.property-key');
        if (currentEditingNode && currentEditingNode.type === '数组' && keyInput) {
            keyInput.value = `[${index}]`;
            if (currentEditingNode.children[index]) {
                currentEditingNode.children[index].key = `[${index}]`;
            }
        }
    });
}

// 保存编辑
function saveEdit() {
    if (currentEditingNode && (currentEditingNode.type === '对象' || currentEditingNode.type === '数组')) {
        saveListEdit();
    } else {
        saveSimpleEdit();
    }
}

// 绑定编辑器事件
function bindEditorEvents() {
    const menuEdit = document.getElementById('menuEdit');
    const menuAdd = document.getElementById('menuAdd');
    
    if (menuEdit) {
        menuEdit.addEventListener('click', () => {
            hideContextMenu();
            if (longPressNode) {
                openEditModal(longPressNode);
            }
        });
    }
    
    if (menuAdd) {
        menuAdd.addEventListener('click', () => {
            hideContextMenu();
            if (longPressNode) {
                openAddModal(longPressNode);
            }
        });
    }
    
    if (ELEMENTS.btnCancel) {
        ELEMENTS.btnCancel.addEventListener('click', closeModal);
    }
    
    if (ELEMENTS.btnConfirm) {
        ELEMENTS.btnConfirm.addEventListener('click', () => {
            if (currentEditingMode === 'edit') {
                saveEdit();
            } else if (currentEditingMode === 'add') {
                saveAdd();
            }
        });
    }
    
    if (ELEMENTS.btnDeleteCancel) {
        ELEMENTS.btnDeleteCancel.addEventListener('click', cancelDelete);
    }
    
    if (ELEMENTS.btnDeleteConfirm) {
        ELEMENTS.btnDeleteConfirm.addEventListener('click', confirmDelete);
    }
    
    if (ELEMENTS.editType) {
        ELEMENTS.editType.addEventListener('change', (e) => {
            updateValueInput(e.target.value);
        });
    }
    
    if (ELEMENTS.editModalOverlay) {
        ELEMENTS.editModalOverlay.addEventListener('click', (e) => {
            if (e.target === ELEMENTS.editModalOverlay) {
                closeModal();
            }
        });
    }
    
    if (ELEMENTS.deleteConfirmOverlay) {
        ELEMENTS.deleteConfirmOverlay.addEventListener('click', (e) => {
            if (e.target === ELEMENTS.deleteConfirmOverlay) {
                cancelDelete();
            }
        });
    }
}