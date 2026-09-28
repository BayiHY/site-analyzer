// === 场景位置系统 ===
// 管理场景中的空间位置和移动

App.ScenePosition = {
    // 场景布局定义（简化版：网格系统）
    // 实际可以使用更复杂的地图数据
    layouts: {
        'intro': {
            name: '序章场景',
            width: 10,
            height: 10,
            defaultPosition: { x: 5, y: 5 }
        },
        'tavern': {
            name: '酒馆',
            width: 12,
            height: 8,
            zones: {
                'bar': { x: 0, y: 0, w: 4, h: 8, name: '吧台' },
                'tables': { x: 4, y: 0, w: 8, h: 5, name: '餐桌区' },
                'stage': { x: 4, y: 5, w: 8, h: 3, name: '舞台' },
                'entrance': { x: 0, y: 6, w: 4, h: 2, name: '入口' }
            }
        },
        'market': {
            name: '市场',
            width: 15,
            height: 10,
            zones: {
                'north': { x: 0, y: 0, w: 15, h: 3, name: '北区摊位' },
                'south': { x: 0, y: 7, w: 15, h: 3, name: '南区摊位' },
                'center': { x: 3, y: 3, w: 9, h: 4, name: '广场' }
            }
        }
    },
    
    // 初始化场景位置
    init: function(sceneId) {
        const layout = this.layouts[sceneId] || this.layouts['intro'];
        
        if (!state.positions) {
            state.positions = {
                currentScene: sceneId,
                layout: layout,
                characters: {},
                player: { x: 5, y: 5 }
            };
        }
        
        // 为每个在场角色设置初始位置
        state.characters.forEach(char => {
            if (!state.positions.characters[char.name]) {
                state.positions.characters[char.name] = {
                    x: layout.defaultPosition?.x || 5,
                    y: layout.defaultPosition?.y || 5,
                    zone: null
                };
            }
        });
        
        // 更新在场状态
        state.characters.forEach(char => {
            if (App.PresenceManager) {
                App.PresenceManager.enterScene(char.name, {
                    x: state.positions.characters[char.name]?.x || 5,
                    y: state.positions.characters[char.name]?.y || 5
                }, '场景初始化');
            }
        });
    },
    
    // 获取玩家当前位置
    getPlayerPosition: function() {
        return state.positions?.player || { x: 5, y: 5 };
    },
    
    // 移动玩家
    movePlayer: function(dx, dy) {
        if (!state.positions) return;
        
        const layout = state.positions.layout;
        let newX = state.positions.player.x + dx;
        let newY = state.positions.player.y + dy;
        
        // 边界检查
        newX = Math.max(0, Math.min(newX, layout.width - 1));
        newY = Math.max(0, Math.min(newY, layout.height - 1));
        
        state.positions.player = { x: newX, y: newY };
        
        // 更新所有角色的距离
        this.updateDistances();
        
        console.log(`[Position] 玩家移动到 (${newX}, ${newY})`);
    },
    
    // 移动角色
    moveCharacter: function(charName, dx, dy) {
        if (!state.positions || !state.positions.characters[charName]) return;
        
        const layout = state.positions.layout;
        const charPos = state.positions.characters[charName];
        
        let newX = charPos.x + dx;
        let newY = charPos.y + dy;
        
        // 边界检查
        newX = Math.max(0, Math.min(newX, layout.width - 1));
        newY = Math.max(0, Math.min(newY, layout.height - 1));
        
        charPos.x = newX;
        charPos.y = newY;
        
        // 更新在场状态
        if (App.PresenceManager) {
            App.PresenceManager.moveCharacter(charName, { x: newX, y: newY });
        }
        
        // 更新距离
        this.updateDistances();
        
        console.log(`[Position] ${charName} 移动到 (${newX}, ${newY})`);
    },
    
    // 更新所有角色与玩家的距离
    updateDistances: function() {
        if (!state.positions || !App.PresenceManager) return;
        
        const playerPos = state.positions.player;
        
        state.characters.forEach(char => {
            const charPos = state.positions?.characters[char.name];
            if (!charPos) return;
            
            const dx = charPos.x - playerPos.x;
            const dy = charPos.y - playerPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (App.PresenceManager) {
                App.PresenceManager.moveCharacter(char.name, { x: charPos.x, y: charPos.y });
            }
        });
    },
    
    // 获取角色所在区域
    getZone: function(charName) {
        if (!state.positions || !state.positions.layout.zones) return null;
        
        const charPos = state.positions.characters[charName];
        if (!charPos) return null;
        
        const layout = state.positions.layout;
        
        for (const [zoneId, zone] of Object.entries(layout.zones)) {
            if (charPos.x >= zone.x && charPos.x < zone.x + zone.w &&
                charPos.y >= zone.y && charPos.y < zone.y + zone.h) {
                return { id: zoneId, name: zone.name };
            }
        }
        
        return null;
    },
    
    // 获取场景描述
    getSceneDescription: function() {
        if (!state.positions) return '未知场景';
        
        const layout = state.positions.layout;
        const playerPos = state.positions.player;
        const zone = this.getZone(state.characters[0]?.name);
        
        let desc = `【当前场景】${layout.name}`;
        
        if (zone) {
            desc += `（${zone.name}）`;
        }
        
        desc += `，玩家位置 (${playerPos.x}, ${playerPos.y})`;
        
        // 添加附近角色信息
        const nearbyChars = state.characters.filter(char => {
            const charPos = state.positions?.characters[char.name];
            if (!charPos) return false;
            
            const dx = charPos.x - playerPos.x;
            const dy = charPos.y - playerPos.y;
            return Math.sqrt(dx * dx + dy * dy) <= 3; // 3格内
        });
        
        if (nearbyChars.length > 0) {
            desc += `，附近有：${nearbyChars.map(c => c.name).join('、')}`;
        }
        
        return desc;
    }
};
