// === 玩家意图识别 ===
// 分析玩家输入，判断是向特定角色说话还是对大家说话

App.IntentAnalyzer = {
    /**
     * 分析玩家消息的意图
     * @param {string} message - 玩家消息
     * @param {Array} characters - 当前场景中的角色列表
     * @returns {Object} 意图分析结果
     */
    analyze: function(message, characters) {
        const result = {
            targetChar: null,      // 目标角色（如果有）
            targetType: 'none',     // 'specific' | 'group' | 'narrator' | 'none'
            confidence: 0,         // 置信度 0-1
            keywords: [],          // 提取的关键词
            isDirectAddress: false // 是否直接呼唤
        };
        
        if (!message || !characters?.length) return result;
        
        const charNames = characters.map(c => c.name);
        const allNames = [...charNames, '大家', '各位', '你们'];
        
        // 1. 检查是否呼唤特定角色
        for (const name of charNames) {
            // 匹配 "XXX"、"叫XXX"、"XXX你" 等模式
            const patterns = [
                new RegExp(`["「『${name}"]`, 'i'),  // 直接呼唤名字
                new RegExp(`${name}[，,、\\s]`, 'i'),   // 名字后跟标点或空格
                new RegExp(`叫[${name}]`, 'i'),        // 叫XXX
                new RegExp(`${name}[你]*`, 'i'),        // XXX(你)
            ];
            
            for (const pattern of patterns) {
                if (pattern.test(message)) {
                    result.targetChar = name;
                    result.targetType = 'specific';
                    result.confidence = 0.85;
                    result.isDirectAddress = true;
                    result.keywords.push(name);
                    break;
                }
            }
            if (result.targetChar) break;
        }
        
        // 2. 检查是否对大家说话
        if (!result.targetChar) {
            const groupPatterns = [
                /大家|各位|你们|众人|在座|所有人/i,
                /^\s*[ hey]+/i,  // 简单的招呼
                /听着|听好了|注意/i,  // 引起注意
            ];
            
            for (const pattern of groupPatterns) {
                if (pattern.test(message)) {
                    result.targetType = 'group';
                    result.confidence = 0.7;
                    break;
                }
            }
        }
        
        // 3. 检查是否有动作描写（可能是对场景/旁白说话）
        const actionPatterns = [
            /《[^》]+》/,  // 《动作》
            /\（[^）]+）/, // （动作）
            /\[([^\]]+)\]/, // [动作]
        ];
        
        for (const pattern of actionPatterns) {
            if (pattern.test(message)) {
                result.targetType = 'narrator';
                result.confidence = 0.6;
                break;
            }
        }
        
        // 4. 无明确意图
        if (result.targetType === 'none') {
            // 根据上下文判断：如果上一条消息是对特定角色的，这条可能是继续
            const lastMsg = state.messages[state.messages.length - 1];
            if (lastMsg?.role === 'char' && lastMsg?.charIndex != null) {
                const lastChar = state.characters[lastMsg.charIndex];
                if (lastChar && message.length < 30) {
                    // 简短回复，可能是在回应上一角色
                    result.targetChar = lastChar.name;
                    result.targetType = 'specific';
                    result.confidence = 0.5;
                }
            }
        }
        
        return result;
    },
    
    /**
     * 根据意图过滤应该响应的角色
     * @param {string} message - 玩家消息
     * @param {Array} presentChars - 在场角色列表
     * @returns {Array} 应该响应的角色名称列表
     */
    filterRespondingCharacters: function(message, presentChars) {
        const intent = this.analyze(message, presentChars);
        const responding = [];
        
        for (const char of presentChars) {
            const charState = state.presence?.characters[char.name];
            
            // 如果角色不在场，不响应
            if (!charState?.present) continue;
            
            // 直接呼唤的角色一定响应
            if (intent.targetChar === char.name) {
                responding.push(char.name);
                continue;
            }
            
            // 对大家说话，所有在场角色都响应
            if (intent.targetType === 'group') {
                // 但只响应距离在 10 米内的
                if (charState.distance <= 10) {
                    responding.push(char.name);
                }
                continue;
            }
            
            // 普通对话：检查距离和能否听到
            if (App.PresenceManager.canHear(char.name, message)) {
                // 根据角色性格和关系决定是否参与对话
                if (this.shouldParticipate(char, intent, message)) {
                    responding.push(char.name);
                }
            }
        }
        
        return responding;
    },
    
    /**
     * 判断角色是否应该参与对话
     * @param {Object} char - 角色对象
     * @param {Object} intent - 意图分析结果
     * @param {string} message - 玩家消息
     * @returns {boolean}
     */
    shouldParticipate: function(char, intent, message) {
        // 外冷内热型角色可能不主动参与
        if (char.personality?.includes('冷漠') || char.personality?.includes('内向')) {
            // 除非被直接呼唤
            if (!intent.isDirectAddress) {
                return Math.random() > 0.7; // 30% 概率参与
            }
        }
        
        // 害羞型角色不太会主动插话
        if (char.personality?.includes('害羞') || char.personality?.includes('腼腆')) {
            if (!intent.isDirectAddress && !intent.targetType === 'group') {
                return Math.random() > 0.8; // 20% 概率参与
            }
        }
        
        // 关系好的角色更可能参与
        const emotion = state.emotions[char.name];
        if (emotion) {
            const好感 = emotion['好感度']?.current || 50;
            if (好感 > 70 && !intent.isDirectAddress) {
                return Math.random() > 0.3; // 70% 概率参与
            }
        }
        
        // 默认参与
        return true;
    }
};
