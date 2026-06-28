    App.initializeStory = async function(storyPrompt) {
        // 构建包含世界观设定的提示词
        const fullPrompt = storyPrompt + `

请在以下世界观设定下创作故事：
世界名称：灵源大陆
时代背景：修真文明与科技高度融合的未来世界
核心设定：
- 灵气复苏：天地灵气浓度在百年间提升了1000倍，催生了全新的修炼体系
- 科技修真：传统功法与现代科技结合，诞生了"灵能芯片"、"飞剑导航系统"等创新产物
- 势力格局：三大修真宗门、两大科技财团、一个自由联盟鼎足而立
- 社会形态：修炼者与普通人在同一社会中共存，形成独特的"灵能阶级"
- 文化特色：修仙文化与现代娱乐产业融合，产生"灵网直播"、"修仙综艺"等新形式
- 经济体系：灵石、信用点、灵能币三种货币并行流通
- 修炼体系：炼气→筑基→金丹→元婴→化神→渡劫→大乘→飞升，共八个大境界
- 特殊设定：灵脉节点、洞天福地、古修士遗迹遍布大陆
- 禁忌：禁止私自研究古代禁术，违者将被逐出修真联盟

请根据以上设定创作一个引人入胜的故事，包含至少2个主要角色，每个角色都要有独特的外形、性格和背景。

输出JSON格式：
{"storyTitle":"","characters":[
    {"name":"","age":0,"gender":"男/女","appearance":"","personality":"","background":"","relationship":"","imagePrompt":""},
    {"name":"","age":0,"gender":"男/女","appearance":"","personality":"","background":"","relationship":"","imagePrompt":""}
],"imagePrompts":["角色1的AI绘画提示词，详细的外貌和服装描述","角色2的AI绘画提示词，详细的外貌和服装描述"],"worldview":"用2句话概括这个世界观的核心冲突","mainArc":[{"phase":"第一阶段","description":"故事起始阶段，主角面临初始挑战"},{"phase":"第二阶段","description":"故事发展，冲突升级"},{"phase":"第三阶段","description":"故事高潮，关键抉择"},{"phase":"第四阶段","description":"故事转折，真相揭露"},{"phase":"第五阶段","description":"故事结局，新的开始"}],"openingScene":"简短的场景描写，作为故事的开场白","artStyle":"anime"}

注意：
- 角色必须有鲜明个性，避免脸谱化
- 故事要有悬念和转折
- 世界观要自洽且有创意
- JSON格式必须严格合法，不要任何注释或额外文本`;

        rpLog('info', 'INIT', '开始生成角色和故事');

        // 调用 API 获取角色和故事
        const resp = await App.agnesChat([{
            role: 'user',
            content: fullPrompt
        }]);

        // 解析 JSON 响应
        let data;
        try {
            rpLog('info', 'API', 'response length: ' + resp.length);
            // 找到最外层的大括号对
            const firstBrace = resp.indexOf('{');
            const lastBrace = resp.lastIndexOf('}');
            if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
                rpLog('error', 'JSON', 'No valid JSON braces found');
                data = {};
            } else {
                let candidate = resp.slice(firstBrace, lastBrace + 1);
                rpLog('info', 'JSON', 'candidate length: ' + candidate.length);
                try {
                    data = JSON.parse(candidate);
                    rpLog('info', 'JSON', 'parsed OK, keys: ' + Object.keys(data).join(', '));
                    rpLog('info', 'JSON', 'characters count: ' + (data.characters ? data.characters.length : 'none'));
                } catch(e2) {
                    rpLog('error', 'JSON', 'direct parse failed: ' + e2.message);
                    // 打印错误位置附近的上下文帮助调试
                    const errMatch = e2.message.match(/position (\d+)/);
                    if (errMatch) {
                        const errPos = parseInt(errMatch[1]);
                        const ctxStart = Math.max(0, errPos - 100);
                        const ctxEnd = Math.min(candidate.length, errPos + 100);
                        rpLog('error', 'JSON', 'context around error: ...' + candidate.slice(ctxStart, ctxEnd) + '...');
                    }
                    // LLM 经常输出不规范的 JSON（字符串值内混用中文引号）
                    // 用手动解析器处理各种中文引号和格式问题
                    try {
                        data = App.manualJsonParse(candidate);
                        rpLog('info', 'JSON', 'manual parse OK');
                    } catch(e4) {
                        rpLog('error', 'JSON', 'manual parse failed: ' + e4.message);
                        // 最后手段：尝试找到所有 JSON 对象，选最大的
                        const allObjs = resp.match(/\{(?:[^{}]|(?<obj>\{)|(?<obj2>\}))*\}/g);
                        if (allObjs) {
                            rpLog('info', 'JSON', 'found ' + allObjs.length + ' potential JSON objects');
                            for (let i = allObjs.length - 1; i >= 0; i--) {
                                try {
                                    data = JSON.parse(allObjs[i]);
                                    rpLog('info', 'JSON', 'matched object #' + (i+1) + ', parsed OK');
                                    break;
                                } catch(e5) { continue; }
                            }
                        }
                        if (!data || typeof data !== 'object') data = {};
                    }
                }
            }
        } catch(e) {
            rpLog('error', 'JSON', 'unexpected error: ' + e.message);
            data = {};
        }

        // 手动 JSON 解析器 — 处理中文引号、单引号字符串等不规范输入
        App.manualJsonParse = function(str) {
            // 第一步：将所有中文/全角/弯引号替换为英文双引号
            let normalized = str
                .replace(/\u2018/g, "'").replace(/\u2019/g, "'")  // 弯单引号
                .replace(/\u201c/g, '"').replace(/\u201d/g, '"')  // 弯双引号
                .replace(/\uFF07/g, "'").replace(/\uFF02/g, '"')  // 全角引号
                .replace(/\u300C/g, '"').replace(/\u300D/g, '"')  // 直角引号
                .replace(/\u300E/g, '"').replace(/\u300F/g, '"'); // 双直角引号
            
            // 第二步：移除尾随逗号（JSON5 特性）
            normalized = normalized.replace(/,\s*([\]}])/g, '$1');
            
            // 第三步：处理单引号字符串 — 将 'value' 替换为 "value"
            // 匹配键名后的单引号字符串值
            normalized = normalized.replace(/:\s*'([^']*)'/g, function(m, val) {
                return ': "' + val.replace(/'/g, "\\'").replace(/"/g, '\\"') + '"';
            });
            
            // 第四步：尝试解析
            return JSON.parse(normalized);
        };

        // 解析多角色列表
        const charList = Array.isArray(data.characters) ? data.characters : (data.character ? [data.character] : []);
        if (Array.isArray(charList) && charList.length > 0) {
            state.characters = charList.filter(c => c && typeof c === 'object').map(c => ({
                name: c.name || '未知角色',
                age: c.age || 20,
                gender: c.gender || '未知',
                appearance: c.appearance || '',
                personality: c.personality || '',
                background: c.background || '',
                relationship: c.relationship || '',
                faceImageUrl: '',
                imagePrompt: c.imagePrompt || '',
                perception: '',
                secret: '',
                currentMood: ''
            }));
            state.activeCharIndex = 0;
        }

        // 防御：如果角色列表为空，抛出明确错误
        if (!state.characters || state.characters.length === 0) {
            throw new Error('角色生成失败：API 未返回有效角色数据');
        }

        // 初始化每个角色的情感指标（隐性，不向玩家展示）
        state.characters.forEach(c => {
            state.emotions[c.name] = {
                好感度: { current: 50, initial: 50 },
                亲密感: { current: 20, initial: 20 },
                信任度: { current: 50, initial: 50 },
                吸引力: { current: 30, initial: 30 },
                依赖感: { current: 30, initial: 30 }
            };
            // 初始化渐进式披露状态
            if (!state.revealed) state.revealed = {};
            state.revealed[c.name] = {
                appearance: false,
                personality: false,
                background: false,
                relationship: false
            };
        });

        // 合并故事信息
        const primaryName = state.characters[0]?.name || '无名';
        state.story.title = data.storyTitle || `${primaryName}的故事`;
        state.story.worldview = data.worldview || '';
        state.story.mainArc = data.mainArc || [];
        state.story.openingScene = data.openingScene || '一个普通的午后，阳光透过窗户洒进来...';
        state.story.imagePrompts = data.imagePrompts || (data.imagePrompt ? [data.imagePrompt] : []);
        state.story.artStyle = data.artStyle || 'anime';

        await saveState();

        // 更新头部显示故事信息
        updateStoryHeader();

        // 发送序章消息
        const openingMsg = `【${state.story.openingScene}】`;
        state.messages.push({
            id: 'msg_' + Date.now(),
            role: 'char',
            type: 'text',
            content: openingMsg,
            timestamp: new Date().toISOString(),
            charIndex: 0
        });
        renderMessage(state.messages[state.messages.length - 1]);
        saveMessages().catch(() => {});

        // 生成角色头像（如果有生图 API Key）
        if (state.story.imagePrompts && state.story.imagePrompts.length > 0 && state.apiKeys.image) {
            rpLog('info', 'IMG', '开始生成角色头像');
            addSystemMessage('正在生成角色头像...');
            try {
                for (let i = 0; i < Math.min(state.story.imagePrompts.length, state.characters.length); i++) {
                    const char = state.characters[i];
                    if (!char || !char.name) { rpLog('warn', 'IMG', '角色 #' + i + ' 无效，跳过'); continue; }
                    rpLog('info', 'IMG', '生成第 ' + (i+1) + ' 个角色头像: ' + char.name);
                    await App.generateCharacterFace(char, state.story.imagePrompts[i]);
                }
                addSystemMessage('角色头像生成完成');
                rpLog('info', 'IMG', '头像生成完成');
            } catch (imgErr) {
                rpLog('error', 'IMG', '头像生成失败: ' + imgErr.message);
                addSystemMessage(`头像生成失败: ${imgErr.message}`);
            }
        }
    }
