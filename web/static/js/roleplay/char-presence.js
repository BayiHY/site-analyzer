// === 角色在场状态管理 ===
// 管理角色是否在场、位置、距离等空间信息
// 直接使用全局对象 App.PresenceManager

App.PresenceManager = {
    // 初始化角色在场状态
    init: function() {
        if (!state.presence) {
            state.presence = {
                sceneId: 'intro',
                characters: {},
                history: []
            };
        }
        
        // 为每个角色初始化在场状态
        state.characters.forEach(char => {
            if (!state.presence.characters[char.name]) {
                state.presence.characters[char.name] = {
                    present: false,           // 是否在场
                    position: { x: 0, y: 0 }, // 位置坐标
                    distance: Infinity,       // 与玩家的距离
                    lastSeen: null,           // 最后出场时间
                    exitReason: ''            // 离场原因
                };
            }
        });
    },
    
    // 让角色登场（加入场景）
    enterScene: function(charName, position, reason) {
        if (!state.presence) this.init();
        
        const charState = state.presence.characters[charName];
        if (!charState) return;
        
        charState.present = true;
        charState.position = position || { x: 0, y: 0 };
        charState.lastSeen = Date.now();
        charState.exitReason = '';
        
        // 计算与玩家的距离（默认靠近）
        charState.distance = this.calculateDistance(charState.position);
        
        // 记录入场历史
        state.presence.history.push({
            type: 'enter',
            charName: charName,
            position: position,
            reason: reason || '',
            timestamp: Date.now()
        });
        
        console.log(`[Presence] ${charName} 登场，位置=${JSON.stringify(position)}, 距离=${charState.distance}`);
    },
    
    // 让角色离场
    exitScene: function(charName, reason) {
        if (!state.presence) return;
        
        const charState = state.presence.characters[charName];
        if (!charState) return;
        
        charState.present = false;
        charState.exitReason = reason || '';
        
        state.presence.history.push({
            type: 'exit',
            charName: charName,
            reason: reason,
            timestamp: Date.now()
        });
        
        console.log(`[Presence] ${charName} 离场: ${reason}`);
    },
    
    // 移动角色位置
    moveCharacter: function(charName, newPosition) {
        if (!state.presence) return;
        
        const charState = state.presence.characters[charName];
        if (!charState || !charState.present) return;
        
        charState.position = newPosition;
        charState.distance = this.calculateDistance(newPosition);
        
        state.presence.history.push({
            type: 'move',
            charName: charName,
            from: charState.position,
            to: newPosition,
            timestamp: Date.now()
        });
    },
    
    // 计算角色与玩家的距离
    calculateDistance: function(position) {
        // 简化版：使用欧几里得距离
        const dx = position.x - 0;
        const dy = position.y - 0;
        return Math.sqrt(dx * dx + dy * dy);
    },
    
    // 获取所有在场角色
    getPresentCharacters: function() {
        if (!state.presence) return [];
        
        return state.characters
            .filter(char => state.presence.characters[char.name]?.present)
            .map(char => ({
                ...char,
                distance: state.presence.characters[char.name]?.distance || Infinity
            }))
            .sort((a, b) => a.distance - b.distance);
    },
    
    // 检查角色是否在可听范围内（默认 5 米）
    canHear: function(charName, message) {
        if (!state.presence) return true;
        
        const charState = state.presence.characters[charName];
        if (!charState || !charState.present) return false;
        
        // 如果消息中有明确呼唤该角色，无视距离
        if (message.includes(charName) || message.includes(`叫${charName}`)) {
            return true;
        }
        
        // 默认听距 5 米
        const hearingRange = 5;
        return charState.distance <= hearingRange;
    },
    
    // 获取当前场景信息
    getCurrentScene: function() {
        return state.presence?.sceneId || 'intro';
    },
    
    // 切换场景
    switchScene: function(sceneId, sceneDesc) {
        if (!state.presence) this.init();
        
        state.presence.sceneId = sceneId;
        
        // 所有角色离场
        state.characters.forEach(char => {
            if (state.presence.characters[char.name]?.present) {
                this.exitScene(char.name, '场景切换');
            }
        });
        
        state.presence.history.push({
            type: 'scene_switch',
            from: state.presence.history.length > 0 ? state.presence.sceneId : null,
            to: sceneId,
            description: sceneDesc,
            timestamp: Date.now()
        });
        
        console.log(`[Presence] 场景切换到: ${sceneId}`);
    },
    
    // 保存到场次状态
    save: function() {
        return state.presence;
    },
    
    // 从存档加载场次状态
    load: function(savedPresence) {
        if (savedPresence) {
            state.presence = savedPresence;
            console.log(`[Presence] 从存档加载场次状态: ${state.presence.history.length} 条记录`);
        }
    }
};

// 在 state 加载时初始化
if (typeof state !== 'undefined' && state.presence) {
    App.PresenceManager.load(state.presence);
}
