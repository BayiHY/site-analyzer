// JSON 树编辑器 - 支持收起展开 + 完整编辑（键名、值、新增、删除）

class JsonTreeEditor {
    constructor(container, textarea) {
        this.container = container;
        this.textarea = textarea;
        this.data = null;
        this.collapsedPaths = new Set();
        this.onChange = null; // 回调：数据变更时触发
    }

    setData(data) {
        this.data = data;
        this.collapsedPaths.clear();
        this.render();
    }

    getValue() { return this.textarea.value; }

    collapseAll() {
        this._collectAllPaths(this.data, '');
        this.render();
    }

    expandAll() {
        this.collapsedPaths.clear();
        this.render();
    }

    _collectAllPaths(data, path) {
        if (data && typeof data === 'object') {
            this.collapsedPaths.add(path);
            if (Array.isArray(data)) {
                data.forEach((item, i) => this._collectAllPaths(item, path + '[' + i + ']'));
            } else {
                Object.keys(data).forEach(k => this._collectAllPaths(data[k], path + '.' + k));
            }
        }
    }

    render() {
        this.container.innerHTML = '';

        const toolbar = document.createElement('div');
        toolbar.className = 'je-toolbar';
        toolbar.innerHTML = '<button class="je-tool-btn" id="jeExpandAll">全部展开</button>' +
            '<button class="je-tool-btn" id="jeCollapseAll">全部收起</button>';
        toolbar.querySelector('#jeExpandAll').addEventListener('click', () => this.expandAll());
        toolbar.querySelector('#jeCollapseAll').addEventListener('click', () => this.collapseAll());
        this.container.appendChild(toolbar);

        const tree = document.createElement('div');
        tree.className = 'je-tree';

        if (this.data === null || typeof this.data !== 'object') {
            tree.appendChild(this._leafLine(this.data, null, '', 0));
        } else if (Array.isArray(this.data)) {
            this._renderArray(this.data, tree, '', 0, true);
        } else {
            this._renderObject(this.data, tree, '', 0, true);
        }

        this.container.appendChild(tree);
    }

    // ---- 对象渲染 ----
    _renderObject(obj, parent, path, indent, isLast) {
        const keys = Object.keys(obj);
        const collapsed = this.collapsedPaths.has(path);
        const { line, children, closeLine, toggle, countSpan, ellipsis } = this._createBlock(path, indent, isLast, '{', '}', keys.length + ' 个属性');
        parent.appendChild(line);

        if (keys.length > 0) {
            this._setupToggle(toggle, path, children, countSpan, line, '... }', ellipsis);
            keys.forEach((k, i) => this._renderChild(k, obj[k], children, path + '.' + k, indent + 1, i === keys.length - 1));
            parent.appendChild(children);
            if (!collapsed) parent.appendChild(closeLine);
        } else {
            parent.appendChild(closeLine);
        }

    }

    _renderArray(arr, parent, path, indent, isLast) {
        const collapsed = this.collapsedPaths.has(path);
        const { line, children, closeLine, toggle, countSpan, ellipsis } = this._createBlock(path, indent, isLast, '[', ']', arr.length + ' 项');
        parent.appendChild(line);

        if (arr.length > 0) {
            this._setupToggle(toggle, path, children, countSpan, line, '... ]', ellipsis);
            arr.forEach((item, i) => this._renderChild(i, item, children, path + '[' + i + ']', indent + 1, i === arr.length - 1));
            parent.appendChild(children);
            if (!collapsed) parent.appendChild(closeLine);
        } else {
            parent.appendChild(closeLine);
        }

    }

    // ---- 带键名的对象/数组（在对象属性内） ----
    _renderObjectInKey(key, obj, parent, path, indent, isLast) {
        const keys = Object.keys(obj);
        const collapsed = this.collapsedPaths.has(path);

        // 构造前缀：键名 + 冒号
        const prefixEl = document.createElement('span');
        const keySpan = this._makeKeySpan(key);
        this._makeEditableKey(keySpan, path, obj);
        prefixEl.appendChild(keySpan);
        prefixEl.appendChild(this._colonSpan());

        const { line, children, closeLine, toggle, countSpan, ellipsis } = this._createBlock(path, indent, isLast, '{', '}', keys.length + ' 个属性', prefixEl);

        parent.appendChild(line);
        if (keys.length > 0) {
            this._setupToggle(toggle, path, children, countSpan, line, '... }', ellipsis);
            keys.forEach((k, i) => this._renderChild(k, obj[k], children, path + '.' + k, indent + 1, i === keys.length - 1));
            parent.appendChild(children);
            if (!collapsed) parent.appendChild(closeLine);
        } else {
            parent.appendChild(closeLine);
        }
    }

    _renderArrayInKey(key, arr, parent, path, indent, isLast) {
        const collapsed = this.collapsedPaths.has(path);

        const prefixEl = document.createElement('span');
        const keySpan = this._makeKeySpan(key);
        this._makeEditableKey(keySpan, path, arr);
        prefixEl.appendChild(keySpan);
        prefixEl.appendChild(this._colonSpan());

        const { line, children, closeLine, toggle, countSpan, ellipsis } = this._createBlock(path, indent, isLast, '[', ']', arr.length + ' 项', prefixEl);

        parent.appendChild(line);
        if (arr.length > 0) {
            this._setupToggle(toggle, path, children, countSpan, line, '... ]', ellipsis);
            arr.forEach((item, i) => this._renderChild(i, item, children, path + '[' + i + ']', indent + 1, i === arr.length - 1));
            parent.appendChild(children);
            if (!collapsed) parent.appendChild(closeLine);
        } else {
            parent.appendChild(closeLine);
        }
    }

    // ---- 带索引的元素 ----
    _renderObjectInIndex(index, obj, parent, path, indent, isLast) {
        const keys = Object.keys(obj);
        const collapsed = this.collapsedPaths.has(path);
        const { line, children, closeLine, toggle, countSpan, ellipsis } = this._createBlock(path, indent, isLast, '{', '}', keys.length + ' 个属性', this._indexSpan(index));

        parent.appendChild(line);
        if (keys.length > 0) {
            this._setupToggle(toggle, path, children, countSpan, line, '... }', ellipsis);
            keys.forEach((k, i) => this._renderChild(k, obj[k], children, path + '.' + k, indent + 1, i === keys.length - 1));
            parent.appendChild(children);
            if (!collapsed) parent.appendChild(closeLine);
        } else {
            parent.appendChild(closeLine);
        }
    }

    _renderArrayInIndex(index, arr, parent, path, indent, isLast) {
        const collapsed = this.collapsedPaths.has(path);
        const { line, children, closeLine, toggle, countSpan, ellipsis } = this._createBlock(path, indent, isLast, '[', ']', arr.length + ' 项', this._indexSpan(index));

        parent.appendChild(line);
        if (arr.length > 0) {
            this._setupToggle(toggle, path, children, countSpan, line, '... ]', ellipsis);
            arr.forEach((item, i) => this._renderChild(i, item, children, path + '[' + i + ']', indent + 1, i === arr.length - 1));
            parent.appendChild(children);
            if (!collapsed) parent.appendChild(closeLine);
        } else {
            parent.appendChild(closeLine);
        }
    }

    // ---- 子节点渲染入口 ----
    _renderChild(keyOrIndex, value, container, path, indent, isLast) {
        const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
        const isArray = Array.isArray(value);

        if (isObject || isArray) {
            if (typeof keyOrIndex === 'string') {
                isArray ? this._renderArrayInKey(keyOrIndex, value, container, path, indent, isLast)
                        : this._renderObjectInKey(keyOrIndex, value, container, path, indent, isLast);
            } else {
                isArray ? this._renderArrayInIndex(keyOrIndex, value, container, path, indent, isLast)
                        : this._renderObjectInIndex(keyOrIndex, value, container, path, indent, isLast);
            }
        } else {
            if (typeof keyOrIndex === 'string') {
                container.appendChild(this._leafLineInKey(keyOrIndex, value, indent, isLast, path));
            } else {
                container.appendChild(this._leafLineInIndex(keyOrIndex, value, indent, isLast, path));
            }
        }
    }

    // ---- 叶子节点行 ----
    _leafLineInKey(key, value, indent, isLast, path) {
        const line = this._makeLine(indent);
        const keySpan = this._makeKeySpan(key);
        this._makeEditableKey(keySpan, path, value);
        const valSpan = this._makeValueSpan(value, path);
        const comma = isLast ? '' : ',';

        line.appendChild(keySpan);
        line.appendChild(this._colonSpan());
        line.appendChild(valSpan);
        if (comma) line.appendChild(this._commaSpan());
        return line;
    }

    _leafLineInIndex(index, value, indent, isLast, path) {
        const line = this._makeLine(indent);
        line.appendChild(this._indexSpan(index));
        const valSpan = this._makeValueSpan(value, path);
        line.appendChild(valSpan);
        if (!isLast) line.appendChild(this._commaSpan());
        return line;
    }

    _leafLine(value, key, indent) {
        const line = this._makeLine(indent);
        if (key !== null) {
            const keySpan = this._makeKeySpan(String(key));
            line.appendChild(keySpan);
            line.appendChild(this._colonSpan());
        }
        line.appendChild(this._makeValueSpan(value, ''));
        return line;
    }

    // ---- UI 构建辅助 ----
    _makeLine(indent) {
        const line = document.createElement('div');
        line.className = 'je-line';
        line.style.paddingLeft = (indent * 20 + 4) + 'px';
        return line;
    }

    _makeKeySpan(key) {
        const span = document.createElement('span');
        span.className = 'je-key';
        span.textContent = '"' + key + '"';
        return span;
    }

    _colonSpan() {
        const span = document.createElement('span');
        span.className = 'je-colon';
        span.textContent = ': ';
        return span;
    }

    _commaSpan() {
        const span = document.createElement('span');
        span.className = 'je-comma';
        span.textContent = ',';
        return span;
    }

    _indexSpan(index) {
        const span = document.createElement('span');
        span.className = 'je-index';
        span.textContent = '[' + index + ']';
        return span;
    }

    _makeValueSpan(value, path) {
        const span = document.createElement('span');
        span.className = 'je-value ' + this._valCls(value);
        span.textContent = this._fmtVal(value);
        if (path) {
            span.addEventListener('click', (e) => { e.stopPropagation(); this._editValue(span, path, value); });
        }
        return span;
    }

    _createBlock(path, indent, isLast, open, close, countText, prefixEl) {
        const line = this._makeLine(indent);

        const collapsed = this.collapsedPaths.has(path);

        // 收起/展开按钮
        const toggle = document.createElement('span');
        toggle.className = 'je-toggle';
        toggle.textContent = collapsed ? '▶' : '▼';
        toggle.style.display = (countText === '0 个属性' || countText === '0 项') ? 'none' : '';
        line.appendChild(toggle);

        // 键名/索引前缀
        if (prefixEl) line.appendChild(prefixEl);

        // 括号
        line.appendChild(document.createTextNode(open === '{' ? '{' : '['));

        // 计数
        const countSpan = document.createElement('span');
        countSpan.className = 'je-count';
        countSpan.textContent = countText;
        line.appendChild(countSpan);

        // 省略号（收起时显示）
        const ellipsis = document.createElement('span');
        ellipsis.className = 'je-ellipsis';
        ellipsis.textContent = '... ' + close;
        ellipsis.style.display = collapsed ? 'inline' : 'none';
        line.appendChild(ellipsis);

        // 子节点容器
        const children = document.createElement('div');
        children.className = 'je-children';
        children.style.display = collapsed ? 'none' : 'block';

        // 闭合括号行
        const closeLine = this._makeLine(indent);
        closeLine.innerHTML = close + (isLast ? '' : '<span class="je-comma">,</span>');

        return { line, children, closeLine, toggle, countSpan, ellipsis };
    }

    _setupToggle(toggle, path, children, countSpan, line, ellipsisText, ellipsis) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const nowCollapsed = children.style.display === 'none';
            children.style.display = nowCollapsed ? 'block' : 'none';
            toggle.textContent = nowCollapsed ? '▼' : '▶';
            nowCollapsed ? this.collapsedPaths.delete(path) : this.collapsedPaths.add(path);
            if (countSpan) countSpan.style.display = nowCollapsed ? 'none' : 'inline';
            if (ellipsis) ellipsis.style.display = nowCollapsed ? 'none' : 'inline';
        });
    }

    // ---- 编辑键名 ----
    _makeEditableKey(keySpan, path, value) {
        keySpan.style.cursor = 'pointer';
        keySpan.title = '点击修改键名';
        keySpan.addEventListener('click', (e) => {
            e.stopPropagation();
            this._editKey(keySpan, path, value);
        });
    }

    _editKey(keySpan, path, value) {
        if (keySpan.querySelector('input')) return;
        const oldKey = keySpan.textContent.replace(/^"|"$/g, '');
        const input = document.createElement('input');
        input.className = 'je-edit-input';
        input.type = 'text';
        input.value = oldKey;
        keySpan.textContent = '';
        keySpan.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
            const newKey = input.value.trim();
            if (!newKey || newKey === oldKey) {
                keySpan.textContent = '"' + oldKey + '"';
                return;
            }
            // 重命名键
            const parentPath = path.substring(0, path.lastIndexOf('.')) || '';
            const obj = parentPath ? this._getValByPath(parentPath) : this.data;
            if (obj && typeof obj === 'object' && !Array.isArray(obj) && newKey in obj) {
                keySpan.textContent = '"' + oldKey + '"';
                return;
            }
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                const newObj = {};
                for (const k of Object.keys(obj)) {
                    newObj[k === newKey ? newKey : k] = obj[k];
                    if (k === oldKey && k !== newKey) newObj[newKey] = obj[k];
                    if (k === oldKey) continue;
                    newObj[k] = obj[k];
                }
                // rebuild properly
                const rebuilt = {};
                for (const k of Object.keys(obj)) {
                    if (k === oldKey) {
                        rebuilt[newKey] = obj[oldKey];
                    } else {
                        rebuilt[k] = obj[k];
                    }
                }
                if (parentPath) this._setValByPath(parentPath, rebuilt);
                else this.data = rebuilt;
                this._sync();
                this.render();
            }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { keySpan.textContent = '"' + oldKey + '"'; e.stopPropagation(); }
        });
    }

    // ---- 编辑值 ----
    _editValue(valSpan, path, currentValue) {
        if (valSpan.querySelector('input')) return;
        const input = document.createElement('input');
        input.className = 'je-edit-input';
        input.type = 'text';
        input.value = currentValue === null ? 'null' : typeof currentValue === 'string' ? currentValue : String(currentValue);

        const origText = valSpan.textContent;
        valSpan.textContent = '';
        valSpan.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
            const raw = input.value.trim();
            let nv;
            if (raw === 'null') nv = null;
            else if (raw === 'true') nv = true;
            else if (raw === 'false') nv = false;
            else if (raw === '') nv = '';
            else if (raw !== '' && !isNaN(raw)) nv = Number(raw);
            else nv = raw;

            this._setValByPath(path, nv);
            this._sync();
            this.render();
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { valSpan.textContent = origText; e.stopPropagation(); }
        });
    }

    // ---- 路径读写 ----
    _getValByPath(path) {
        if (!path) return this.data;
        const parts = this._parsePath(path);
        let cur = this.data;
        for (const p of parts) cur = cur[p];
        return cur;
    }

    _setValByPath(path, value) {
        if (!path) { this.data = value; return; }
        const parts = this._parsePath(path);
        let cur = this.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = value;
    }

    _parsePath(path) {
        const parts = [];
        const segs = path.split(/\.|(\[\d+\])/).filter(Boolean);
        for (const s of segs) {
            const m = s.match(/^\[(\d+)\]$/);
            parts.push(m ? parseInt(m[1]) : s);
        }
        return parts;
    }

    // ---- 工具方法 ----
    _sync() {
        if (this.textarea) this.textarea.value = JSON.stringify(this.data, null, 2);
        if (this.onChange) this.onChange();
    }

    _valCls(v) {
        if (v === null) return 'je-val-null';
        if (typeof v === 'string') return 'je-val-string';
        if (typeof v === 'number') return 'je-val-number';
        if (typeof v === 'boolean') return 'je-val-boolean';
        return '';
    }

    _fmtVal(v) {
        if (v === null) return 'null';
        if (typeof v === 'string') return '"' + this._escHtml(v) + '"';
        return this._escHtml(String(v));
    }

    _escHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
