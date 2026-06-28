// === Section: localStorage 快捷存取 ===
// === Section: IndexedDB 存储 ===
// === Section: 状态管理 ===
    // ===== 全局 App 对象（必须在第一个模块赋值前定义）=====
    const App = window.App = window.App || {};

    // ===== 状态管理 =====
    let state = {
        characters: [],
        activeCharIndex: 0,
        story: null,
        messages: [],
        emotions: {},
        apiKeys: { chat: '', image: '' },
        currentPanel: null,
        // 渐进式披露：每个角色的已发现信息
        // revealed[charName] = { appearance: bool, personality: bool, background: bool, relationship: bool }
        revealed: {},
        // 场景历史记录：用于判断是否需要生场景图
        // sceneHistory = [{ charName, sceneDesc, imageUrl }]
        sceneHistory: []
    };

    // ===== IndexedDB 存储（带 localStorage 回退）=====
    const DB_NAME = 'RolePlayDB';
    const DB_VERSION = 1;
    let _dbReady = false;

    App.openDB = function() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('state')) {
                    db.createObjectStore('state', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('messages')) {
                    const store = db.createObjectStore('messages', { keyPath: 'id' });
                    store.createIndex('charId', 'charId', { unique: false });
                }
            };
            req.onsuccess = () => {
                _dbReady = true;
                resolve(req.result);
            };
            req.onerror = () => {
                _dbReady = false;
                reject(new Error('IndexedDB unavailable'));
            };
            req.onblocked = () => {
                _dbReady = false;
                reject(new Error('IndexedDB blocked'));
            };
        });
    }

    // ===== IndexedDB 不可用时回退到 localStorage =====
    App._isDBReady = function() {
        return _dbReady;
    }

    App.saveState = async function() {
        if (!_dbReady) {
            localStorage.setItem('rp_state_fallback', JSON.stringify(state));
            return;
        }
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('state', 'readwrite');
            tx.objectStore('state').put({ key: 'main', data: state });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    App.loadState = async function() {
        if (!_dbReady) {
            const saved = localStorage.getItem('rp_state_fallback');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    Object.assign(state, parsed);
                    // 兼容旧数据：迁移单角色到多角色
                    if (state.character && !state.characters?.length) {
                        state.characters = [{
                            name: state.character.name || '未知角色',
                            age: state.character.age || 20,
                            appearance: state.character.appearance || '',
                            personality: state.character.personality || '',
                            background: state.character.background || '',
                            relationship: state.character.relationship || '',
                            faceImageUrl: state.character.faceImageUrl || ''
                        }];
                        state.activeCharIndex = 0;
                        if (!state.emotions[state.characters[0].name]) {
                            state.emotions[state.characters[0].name] = {
                                好感度: { current: 50, initial: 50 },
                                亲密感: { current: 20, initial: 20 },
                                信任度: { current: 50, initial: 50 },
                                吸引力: { current: 30, initial: 30 },
                                依赖感: { current: 30, initial: 30 }
                            };
                        }
                        if (!state.revealed) state.revealed = {};
                        state.characters.forEach(c => {
                            if (!state.revealed[c.name]) {
                                state.revealed[c.name] = {
                                    appearance: false,
                                    personality: false,
                                    background: false,
                                    relationship: false
                                };
                            }
                        });
                    }
                    if (!state.characters) state.characters = [];
                    if (state.activeCharIndex == null) state.activeCharIndex = 0;
                    if (!state.emotions) state.emotions = {};
                    return Promise.resolve(true);
                } catch(e) {
                    return Promise.resolve(false);
                }
            }
            return Promise.resolve(false);
        }
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('state', 'readonly');
            const req = tx.objectStore('state').get('main');
            req.onsuccess = () => {
                if (req.result && req.result.data) {
                    Object.assign(state, req.result.data);
                    if (state.character && !state.characters?.length) {
                        state.characters = [{
                            name: state.character.name || '未知角色',
                            age: state.character.age || 20,
                            appearance: state.character.appearance || '',
                            personality: state.character.personality || '',
                            background: state.character.background || '',
                            relationship: state.character.relationship || '',
                            faceImageUrl: state.character.faceImageUrl || ''
                        }];
                        state.activeCharIndex = 0;
                        if (!state.emotions[state.characters[0].name]) {
                            state.emotions[state.characters[0].name] = {
                                好感度: { current: 50, initial: 50 },
                                亲密感: { current: 20, initial: 20 },
                                信任度: { current: 50, initial: 50 },
                                吸引力: { current: 30, initial: 30 },
                                依赖感: { current: 30, initial: 30 }
                            };
                        }
                        if (!state.revealed) state.revealed = {};
                        state.characters.forEach(c => {
                            if (!state.revealed[c.name]) {
                                state.revealed[c.name] = {
                                    appearance: false,
                                    personality: false,
                                    background: false,
                                    relationship: false
                                };
                            }
                        });
                    }
                    if (!state.characters) state.characters = [];
                    if (state.activeCharIndex == null) state.activeCharIndex = 0;
                    if (!state.emotions) state.emotions = {};
                    resolve(true);
                } else {
                    resolve(false);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    App.saveMessages = async function() {
        if (!_dbReady) {
            localStorage.setItem('rp_messages_fallback', JSON.stringify(state.messages));
            return;
        }
        const db = await openDB();
        const tx = db.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        store.clear();
        state.messages.forEach(msg => store.add(msg));
    }

    App.loadMessages = async function() {
        if (!_dbReady) {
            const saved = localStorage.getItem('rp_messages_fallback');
            if (saved) {
                try { state.messages = JSON.parse(saved); } catch(e) {}
            }
            return;
        }
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction('messages', 'readonly');
            const req = tx.objectStore('messages').getAll();
            req.onsuccess = () => {
                state.messages = req.result || [];
                resolve();
            };
        });
    }

    // ===== localStorage 快捷存取 =====
    App.saveSettings = function() {
        localStorage.setItem('rp_apiKeys', JSON.stringify(state.apiKeys));
    }
    App.loadSettings = function() {
        const saved = localStorage.getItem('rp_apiKeys');
        if (saved) {
            try { Object.assign(state.apiKeys, JSON.parse(saved)); } catch(e) {}
        }
    }
