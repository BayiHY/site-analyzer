// === Section: TTS 语音引擎 ===
// 基于 Blob URL + Cache API 的纯前端 TTS 集成
// 后端代理 /api/tts 返回 MP3 字节流，前端缓存到 Cache API

// ===== TTS 音色配置 =====
const TTS_VOICES = {
    // 普通话 - 女声
    'zh-CN-XiaoxiaoNeural': { name: '晓晓', gender: '女', style: '温暖', desc: '温柔型女主、治愈系' },
    'zh-CN-XiaoyiNeural':   { name: '晓伊', gender: '女', style: '活泼', desc: '元气少女、邻家妹妹' },
    // 普通话 - 男声
    'zh-CN-YunjianNeural':  { name: '云健', gender: '男', style: '激情', desc: '热血男主、运动系' },
    'zh-CN-YunxiNeural':    { name: '云希', gender: '男', style: '阳光', desc: '阳光少年、暖男' },
    'zh-CN-YunxiaNeural':   { name: '云夏', gender: '男', style: '可爱', desc: '正太、呆萌系' },
    'zh-CN-YunyangNeural':  { name: '云扬', gender: '男', style: '专业', desc: '医生、律师、上司' },
    // 方言
    'zh-CN-liaoning-XiaobeiNeural': { name: '晓北', gender: '女', style: '幽默', desc: '辽宁话' },
    'zh-CN-shaanxi-XiaoniNeural':   { name: '晓妮', gender: '女', style: '明亮', desc: '陕西话' },
    // 港台
    'zh-HK-HiuGaaiNeural':  { name: '希佳', gender: '女', style: '友善', desc: '粤语' },
    'zh-HK-HiuMaanNeural':  { name: '希曼', gender: '女', style: '友善', desc: '粤语' },
    'zh-HK-WanLungNeural':  { name: '万龙', gender: '男', style: '友善', desc: '粤语' },
    'zh-TW-HsiaoChenNeural':{ name: '小臻', gender: '女', style: '友善', desc: '国语' },
    'zh-TW-HsiaoYuNeural':  { name: '小雨', gender: '女', style: '友善', desc: '国语' },
    'zh-TW-YunJheNeural':   { name: '云哲', gender: '男', style: '友善', desc: '国语' }
};

// 默认音色（女角色默认晓晓，男角色默认云希）
const DEFAULT_VOICE_BY_GENDER = { '女': 'zh-CN-XiaoxiaoNeural', '男': 'zh-CN-YunxiNeural' };

// ===== Cache API 初始化 =====
const TTS_CACHE_NAME = 'roleplay-tts-v1';
let _ttsCachePromise = null;

App.getTtsCache = async function() {
    if (_ttsCachePromise) return _ttsCachePromise;
    _ttsCachePromise = caches.open(TTS_CACHE_NAME);
    return _ttsCachePromise;
}

// ===== 生成 TTS 缓存 key =====
App.ttsCacheKey = function(text, voice, rate, pitch, volume) {
    // 使用简单 hash 作为 key
    let hash = 0;
    const str = `${text}|${voice}|${rate}|${pitch}|${volume}`;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `tts/${Math.abs(hash).toString(16)}`;
}

// ===== TTS 结构化参数 =====
// Edge TTS 支持的范围和步长
const TTS_PARAMS = {
    rate: { min: '-50%', max: '+100%', step: 10, unit: '%' },
    pitch: { min: '-50Hz', max: '+100Hz', step: 10, unit: 'Hz' },
    volume: { min: '-100%', max: '+100%', step: 10, unit: '%' }
};

// 情绪 → 参数映射表（供 LLM 参考）
const EMOTION_PARAM_GUIDE = {
    // 愤怒/激动
    angry:       { rate: '+20%', pitch: '+20Hz', volume: '+30%' },
    excited:     { rate: '+30%', pitch: '+10Hz', volume: '+20%' },
    shouting:    { rate: '+20%', pitch: '+30Hz', volume: '+50%' },
    // 温柔/平静
    gentle:      { rate: '-10%', pitch: '0Hz', volume: '-10%' },
    calm:        { rate: '0%', pitch: '0Hz', volume: '0%' },
    whisper:     { rate: '-20%', pitch: '-10Hz', volume: '-50%' },
    // 悲伤/低沉
    sad:         { rate: '-20%', pitch: '-20Hz', volume: '-20%' },
    depressed:   { rate: '-30%', pitch: '-30Hz', volume: '-30%' },
    crying:      { rate: '-10%', pitch: '-10Hz', volume: '-10%' },
    // 犹豫/紧张
    hesitant:    { rate: '-20%', pitch: '0Hz', volume: '-20%' },
    nervous:     { rate: '+10%', pitch: '+10Hz', volume: '-10%' },
    scared:      { rate: '+20%', pitch: '+20Hz', volume: '-20%' },
    // 自信/威严
    confident:   { rate: '0%', pitch: '+10Hz', volume: '+10%' },
    serious:     { rate: '-10%', pitch: '-10Hz', volume: '0%' },
    commanding:  { rate: '0%', pitch: '-20Hz', volume: '+20%' },
    // 开心/轻松
    happy:       { rate: '+10%', pitch: '+10Hz', volume: '+10%' },
    cheerful:    { rate: '+20%', pitch: '+20Hz', volume: '+20%' },
    playful:     { rate: '+10%', pitch: '+10Hz', volume: '0%' }
};

// LLM 推理 TTS 参数的 prompt
function buildTTSPrompt(msg, character) {
    const action = msg.action || '';
    const dialogue = msg.dialogue || msg.content || '';
    const thought = msg.thought || '';
    const charName = character?.name || '';
    const charPersonality = character?.personality || '';
    const charSpeechStyle = character?.speechStyle || '';
    const charVoice = character?.voice || 'zh-CN-XiaoxiaoNeural';
    const charGender = character?.gender || '女';
    
    return `你是一个语音表演指导。根据角色的动作、内心独白和对话内容，推断最适合的 Edge TTS 参数。

【角色信息】
- 名字：${charName}
- 性别：${charGender}
- 性格：${charPersonality}
- 说话风格：${charSpeechStyle}
- 音色：${charVoice}

【当前消息】
- 动作：${action || '无'}
- 对话：${dialogue}
- 内心想法：${thought || '无'}

【Edge TTS 参数范围】
rate（语速）：-50% 到 +100%，步长 10%。正常 = 0%，快 = +10%~+50%，慢 = -10%~-50%
pitch（音高）：-50Hz 到 +100Hz，步长 10Hz。正常 = 0Hz，高 = +10Hz~+50Hz，低 = -10Hz~-50Hz
volume（音量）：-100% 到 +100%，步长 10%。正常 = 0%，大声 = +20%~+60%，小声 = -20%~-80%

【情绪参考映射】
愤怒/激动: rate +20%, pitch +20Hz, volume +30%
温柔/平静: rate -10%, pitch 0Hz, volume -10%
悲伤/低沉: rate -20%, pitch -20Hz, volume -20%
犹豫/紧张: rate -20%, pitch 0Hz, volume -20%
自信/威严: rate 0%, pitch +10Hz, volume +10%
开心/轻松: rate +10%, pitch +10Hz, volume +10%
耳语: rate -20%, pitch -10Hz, volume -50%

【推理要求】
1. 综合动作、内心想法、对话内容判断角色的情绪状态
2. 考虑角色性格和说话风格作为基准
3. 根据情绪微调三个参数
4. 参数值必须在上述范围内，且是步长的整数倍

请以 JSON 格式返回，只返回 JSON，不要其他文字：
{"emotion":"情绪标签","rate":"参数值","pitch":"参数值","volume":"参数值","reason":"一句话解释"}`;
}

// ===== LLM 推理 TTS 参数（带 IndexedDB 缓存）=====
const TTS_PARAMS_DB = 'tts-params-db';
const TTS_PARAMS_STORE = 'params';

App._getTtsParamsDb = async function() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(TTS_PARAMS_DB, 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(TTS_PARAMS_STORE, { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });
}

App.inferTTSParams = async function(msg, character) {
    // 1. 先查 IndexedDB 缓存
    const db = await App._getTtsParamsDb();
    if (db) {
        const cacheKey = App.ttsParamsCacheKey(msg, character);
        return new Promise((resolve) => {
            const tx = db.transaction(TTS_PARAMS_STORE, 'readonly');
            const req = tx.objectStore(TTS_PARAMS_STORE).get(cacheKey);
            req.onsuccess = () => {
                if (req.result) {
                    rpLog('TTS', 'PARAM-CACHE-HIT', `命中参数缓存: ${msg.dialogue?.substring(0, 20) || msg.content?.substring(0, 20)}`);
                    resolve(req.result.value);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    }
    
    // 2. 缓存未命中，调 LLM 推理
    try {
        const prompt = buildTTSPrompt(msg, character);
        const reply = await App.agnesChat([{ role: 'user', content: prompt }]);
        
        // 提取 JSON
        const jsonMatch = reply.match(/\{[^}]+\}/);
        if (!jsonMatch) return null;
        
        const params = JSON.parse(jsonMatch[0]);
        
        // 3. 存入 IndexedDB 缓存
        if (db) {
            const cacheKey = App.ttsParamsCacheKey(msg, character);
            const tx = db.transaction(TTS_PARAMS_STORE, 'readwrite');
            tx.objectStore(TTS_PARAMS_STORE).put({ key: cacheKey, value: params });
        }
        
        return params;
    } catch (e) {
        rpLog('TTS', 'WARN', `LLM 推理 TTS 参数失败: ${e.message}`);
        return null;
    }
}

App.ttsParamsCacheKey = function(msg, character) {
    // 用对话文本 + 角色名 + 音色作为缓存 key
    const dialogue = msg.dialogue || msg.content || '';
    const charName = character?.name || '';
    const voice = character?.voice || '';
    return `${charName}:${voice}:${dialogue.substring(0, 50)}`;
}

// ===== 生成语音（带情绪参数）=====
App.generateTTS = async function(text, voice, rate='+0%', volume='+0%', pitch='+0Hz') {
    if (!text || !voice) return null;

    const cacheKey = App.ttsCacheKey(text, voice, rate, pitch, volume);
    
    // 1. 先查精确缓存（text+voice+参数完全匹配）
    try {
        const cache = await App.getTtsCache();
        const cachedResp = await cache.match(cacheKey);
        if (cachedResp) {
            rpLog('TTS', 'CACHE-HIT', `命中缓存: ${text.substring(0, 30)}...`);
            const blob = await cachedResp.blob();
            return URL.createObjectURL(blob);
        }
    } catch (e) {
        rpLog('TTS', 'WARN', `Cache API 读取失败: ${e.message}`);
    }

    // 2. 调后端生成
    rpLog('TTS', 'GENERATING', `生成语音: ${text.substring(0, 30)}... voice=${voice} rate=${rate} pitch=${pitch} vol=${volume}`);
    try {
        const resp = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice, rate, volume, pitch })
        });
        
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }

        const blob = await resp.blob();
        
        // 3. 存入 Cache API（用精确 key）
        try {
            const cache = await App.getTtsCache();
            await cache.put(cacheKey, new Response(blob, {
                headers: { 'Content-Type': 'audio/mpeg' }
            }));
            rpLog('TTS', 'CACHED', `已缓存: ${text.substring(0, 30)}...`);
        } catch (e) {
            rpLog('TTS', 'WARN', `缓存写入失败（空间不足?）: ${e.message}`);
        }

        return URL.createObjectURL(blob);
    } catch (e) {
        rpLog('TTS', 'ERROR', `生成失败: ${e.message}`);
        return null;
    }
}

// ===== 为角色消息自动匹配音色 =====
App.autoMatchVoice = function(character) {
    if (!character) return DEFAULT_VOICE_BY_GENDER['女'];
    
    const gender = character.gender || '';
    const voice = character.voice || '';
    
    // 如果角色已有音色，直接使用
    if (voice && TTS_VOICES[voice]) {
        return voice;
    }
    
    // 否则根据性别匹配默认音色
    return DEFAULT_VOICE_BY_GENDER[gender] || DEFAULT_VOICE_BY_GENDER['女'];
}

// ===== 在消息气泡中嵌入音频播放器 =====
App.attachAudioToBubble = async function(msgEl, msg) {
    if (msg.role !== 'char' || msg.type === 'image') return;
    if (!App.isTTSEnabled()) return;
    
    // 检查是否已经有音频（避免重复生成）
    if (msgEl.querySelector('.tts-audio-player')) return;
    
    // 只提取对话内容用于 TTS（动作和内心想法不转语音）
    let text = '';
    if (msg.type === 'multi_char') {
        // 多角色消息：只取 dialogue 字段
        text = msg.dialogue || '';
    } else {
        // 普通消息：取 content（本身就是纯对话文本）
        text = msg.content || '';
    }
    
    if (!text || text.length < 2) return;
    
    // 获取角色音色
    const charIdx = msg.charIndex;
    const char = charIdx != null ? state.characters[charIdx] : null;
    const voice = App.autoMatchVoice(char);
    
    // 异步 LLM 推理 TTS 参数（不阻塞 UI）
    setTimeout(async () => {
        // 1. 先插入"生成中"占位
        const bubble = msgEl.querySelector('.bubble');
        if (!bubble) return;
        if (bubble.querySelector('.tts-audio-player') || bubble.querySelector('.tts-loading')) return;
        
        const loading = document.createElement('div');
        loading.className = 'tts-loading';
        loading.innerHTML = '🔊 生成中...';
        loading.style.cssText = 'margin-top:8px;font-size:0.75rem;color:var(--text-dim);display:flex;align-items:center;gap:4px;';
        bubble.appendChild(loading);
        
        let params = null;
        try {
            params = await App.inferTTSParams(msg, char);
        } catch (e) {
            rpLog('TTS', 'WARN', `LLM 推理失败，使用默认参数: ${e.message}`);
        }
        
        let rate = params?.rate || '+0%';
        let pitch = params?.pitch || '+0Hz';
        let volume = params?.volume || '+0%';
        
        // 规范化格式：Edge TTS 要求带 +/- 前缀
        if (rate && !rate.startsWith('+') && !rate.startsWith('-')) rate = '+' + rate.replace('%', '') + '%';
        if (pitch && !pitch.startsWith('+') && !pitch.startsWith('-')) pitch = '+' + pitch.replace('Hz', '') + 'Hz';
        if (volume && !volume.startsWith('+') && !volume.startsWith('-')) volume = '+' + volume.replace('%', '') + '%';
        
        if (params?.reason) {
            rpLog('TTS', 'PARAMS', `情绪: ${params.emotion}, rate=${rate}, pitch=${pitch}, vol=${volume} (${params.reason})`);
        }
        
        try {
            const audioUrl = await App.generateTTS(text, voice, rate, volume, pitch);
            
            // 移除占位，插入音频控件
            loading.remove();
            
            if (audioUrl) {
                const audio = document.createElement('audio');
                audio.className = 'tts-audio-player';
                audio.src = audioUrl;
                audio.controls = true;
                audio.preload = 'auto';
                audio.style.cssText = 'margin-top:8px;width:100%;height:32px;border-radius:8px;';
                
                bubble.appendChild(audio);
                
                msg._audioUrl = audioUrl;
                msg._audioBlobUrl = audioUrl;
                
                rpLog('TTS', 'PLAYING', `气泡音频已嵌入: ${char?.name || '角色'}`);
            } else {
                // 生成失败：替换为错误提示
                loading.className = 'tts-error';
                loading.innerHTML = '🔇 语音生成失败';
                loading.style.cssText = 'margin-top:8px;font-size:0.75rem;color:var(--danger);display:inline-block;cursor:pointer;'
                    + 'opacity:0.7;transition:opacity 0.2s;';
                loading.title = '点击重试';
                loading.onclick = function() {
                    loading.remove();
                    App.attachAudioToBubble(msgEl, msg);
                };
                bubble.appendChild(loading);
                rpLog('TTS', 'ERROR', `气泡音频生成失败: ${char?.name || '角色'}`);
            }
        } catch (e) {
            // 异常：替换为错误提示
            loading.className = 'tts-error';
            loading.innerHTML = '🔇 语音生成失败';
            loading.style.cssText = 'margin-top:8px;font-size:0.75rem;color:var(--danger);display:inline-block;cursor:pointer;'
                + 'opacity:0.7;transition:opacity 0.2s;';
            loading.title = '点击重试';
            loading.onclick = function() {
                loading.remove();
                App.attachAudioToBubble(msgEl, msg);
            };
            bubble.appendChild(loading);
            rpLog('TTS', 'ERROR', `气泡音频嵌入失败: ${e.message}`);
        }
    }, 100);
}

// ===== 音色选择器 UI =====
App.renderVoiceSelector = function(selectEl, selectedVoice, onChange) {
    if (!selectEl) return;
    
    // 清空现有选项
    selectEl.innerHTML = '';
    
    // 分组添加选项
    const groups = {
        '普通话 - 女声': ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural'],
        '普通话 - 男声': ['zh-CN-YunjianNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunxiaNeural', 'zh-CN-YunyangNeural'],
        '方言': ['zh-CN-liaoning-XiaobeiNeural', 'zh-CN-shaanxi-XiaoniNeural'],
        '港台': ['zh-HK-HiuGaaiNeural', 'zh-HK-HiuMaanNeural', 'zh-HK-WanLungNeural', 'zh-TW-HsiaoChenNeural', 'zh-TW-HsiaoYuNeural', 'zh-TW-YunJheNeural']
    };
    
    for (const [groupName, voices] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        
        for (const v of voices) {
            const info = TTS_VOICES[v];
            const option = document.createElement('option');
            option.value = v;
            option.textContent = `${info.name} (${v.split('-')[2]}) - ${info.desc}`;
            if (v === selectedVoice) option.selected = true;
            optgroup.appendChild(option);
        }
        
        selectEl.appendChild(optgroup);
    }
    
    if (onChange) onChange(selectedVoice);
}

// ===== TTS 全局开关 =====
let ttsEnabled = true;

App.toggleTTS = function() {
    ttsEnabled = !ttsEnabled;
    const btn = document.getElementById('tts-toggle-btn');
    if (btn) {
        btn.textContent = ttsEnabled ? '🔊' : '🔇';
        btn.title = ttsEnabled ? '语音已开启' : '语音已关闭';
    }
    rpLog('TTS', 'TOGGLE', ttsEnabled ? 'TTS 已开启' : 'TTS 已关闭');
    return ttsEnabled;
}

App.isTTSEnabled = function() {
    return ttsEnabled;
}

// ===== 清理所有 TTS blob URL（防止内存泄漏）=====
App.clearTTSBlobUrls = function() {
    // 遍历所有消息，释放旧的 blob URL
    state.messages.forEach(msg => {
        if (msg._audioBlobUrl) {
            URL.revokeObjectURL(msg._audioBlobUrl);
            msg._audioBlobUrl = null;
        }
    });
}
