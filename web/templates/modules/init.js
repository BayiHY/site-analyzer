// === Section: 故事初始化 ===
    // ===== 故事初始化 =====
    App.initializeStory = async function(userPrompt) {
        // 生成随机种子以确保每次调用都不同
        const randomSeed = Math.floor(Math.random() * 1000000);
        const timestamp = new Date().toISOString();
        
        // 随机选择艺术风格
        const artStyles = ['anime', 'watercolor', 'oil painting', 'digital realism', 'pencil sketch', 'comic book'];
        const randomArtStyle = artStyles[Math.floor(Math.random() * artStyles.length)];
        
        // 随机选择时代背景
        const timePeriods = ['古代', '近代', '现代', '未来', '奇幻', '科幻', '武侠', '玄幻'];
        const randomTimePeriod = timePeriods[Math.floor(Math.random() * timePeriods.length)];
        
        // 随机选择地点类型
        const locations = ['都市', '乡村', '校园', '职场', '江湖', '异世界', '太空', '海底'];
        const randomLocation = locations[Math.floor(Math.random() * locations.length)];
        
        // 随机选择角色数量 (2-4个角色)
        const characterCount = Math.floor(Math.random() * 3) + 2; // 2-4个角色
        
        // 随机选择角色类型
        const characterTypes = ['学生', '上班族', '医生', '老师', '警察', '商人', '艺术家', '运动员', '科学家', '冒险家', '作家', '厨师', '律师', '记者', '护士'];
        const selectedCharacterTypes = [];
        
        // 确保角色类型不重复
        for (let i = 0; i < characterCount; i++) {
            let randomType;
            do {
                randomType = characterTypes[Math.floor(Math.random() * characterTypes.length)];
            } while (selectedCharacterTypes.includes(randomType));
            selectedCharacterTypes.push(randomType);
        }
        
        // 随机选择角色性别
        const genders = ['男', '女'];
        
        // 随机选择角色年龄范围
        const ageRanges = {
            '学生': [18, 25],
            '上班族': [22, 35],
            '医生': [25, 45],
            '老师': [25, 50],
            '警察': [22, 40],
            '商人': [28, 55],
            '艺术家': [20, 45],
            '运动员': [18, 35],
            '科学家': [25, 50],
            '冒险家': [20, 40],
            '作家': [22, 45],
            '厨师': [20, 50],
            '律师': [25, 50],
            '记者': [22, 40],
            '护士': [22, 45]
        };
        
        // 构建角色列表
        const characterDescriptions = selectedCharacterTypes.map((type, index) => {
            const [minAge, maxAge] = ageRanges[type] || [20, 35];
            const age = Math.floor(Math.random() * (maxAge - minAge + 1)) + minAge;
            const gender = genders[Math.floor(Math.random() * genders.length)];
            const names = {
                '男': ['李明', '王强', '张伟', '刘洋', '陈杰', '杨帆', '赵磊', '黄勇', '周鹏', '吴斌'],
                '女': ['李娜', '王芳', '张敏', '刘艳', '陈静', '杨丽', '赵雪', '黄婷', '周琳', '吴娟']
            };
            const name = names[gender][Math.floor(Math.random() * names[gender].length)];
            
            return `角色${index + 1}：${name}，${age}岁${gender}性，${type}`;
        }).join('；');

        const prompt = `你是角色扮演故事设计师。请根据以下设定生成完整的故事世界：

${userPrompt || `完全随机生成一个${randomTimePeriod}背景下的${randomLocation}故事，包含${characterCount}个角色。${characterDescriptions}。随机种子：${randomSeed}，时间戳：${timestamp}。请确保每次生成的角色、世界观、关系都完全不同。`}

请生成：
1. 故事标题
2. ${characterCount}个角色的详细信息（姓名、年龄、性别、外貌、性格、背景、与主角的关系）
3. 世界观（时代、地点、社会环境）
4. 5阶段主线大纲
5. 序章场景描述（具体场景，包含所有角色的动作和对话）
6. 每个角色的形象描述（用于生图的英文提示词，详细描述外貌、穿着、发型、表情、环境光线）
7. 整体艺术风格（从以下选择一种：${artStyles.join(' / ')}，本次选择：${randomArtStyle}）

注意：故事内容为中文，角色名称、世界观、剧情等全部使用中文。
注意：artStyle 字段必须从上述风格中选择一种，后续所有生图都必须使用此风格。
注意：每次生成的内容都应该是独特的，避免重复。
注意：角色之间要有明确的关系和互动。

输出JSON格式：
{"storyTitle":"","characters":[
    {"name":"","age":0,"gender":"男/女","appearance":"","personality":"","background":"","relationship":"","imagePrompt":""},
    {"name":"","age":0,"gender":"男/女","appearance":"","personality":"","background":"","relationship":"","imagePrompt":""}
    // 根据角色数量生成对应数量的角色对象
],"imagePrompts":["角色1的英文描述","角色2的英文描述",...],"worldview":"","mainArc":[{"stage":1,"name":"","description":""}],"openingScene":"","artStyle":"${randomArtStyle}"}`;

        const resp = await agnesChat([
            { role: 'system', content: '你是角色扮演故事设计师。输出纯JSON。所有故事内容使用中文。每次生成的内容都要独特且不同。' },
            { role: 'user', content: prompt }
        ]);

        let data;
        try {
            const jsonMatch = resp.match(/\{[\s\S]*\}/);
            data = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
        } catch(e) {
            data = {};
        }

        // 解析多角色列表
        const charList = data.characters || [data.character];
        if (Array.isArray(charList)) {
            state.characters = charList.map(c => ({
                name: c.name || '未知角色',
                age: c.age || 20,
                gender: c.gender || '',
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
        await saveMessages();

        // 生成角色头像（如果有生图 API Key）
        if (state.story.imagePrompts && state.story.imagePrompts.length > 0 && state.apiKeys.image) {
            addSystemMessage('正在生成角色头像...');
            try {
                for (let i = 0; i < Math.min(state.story.imagePrompts.length, state.characters.length); i++) {
                    console.log(`生成第 ${i+1} 个角色头像:`, state.characters[i].name);
                    await generateCharacterFace(state.characters[i], state.story.imagePrompts[i]);
                }
                addSystemMessage('角色头像生成完成');
            } catch (imgErr) {
                console.error('头像生成失败:', imgErr);
                addSystemMessage(`头像生成失败: ${imgErr.message}`);
            }
        }
    }
