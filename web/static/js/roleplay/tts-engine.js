// === Section: TTS 语音引擎 ===
// 基于 Blob URL + Cache API 的纯前端 TTS 集成
// 后端代理 /api/tts 返回 MP3 字节流，前端缓存到 Cache API

// ===== TTS 音色配置 =====
const TTS_VOICES = {
    // 普通话 - 女声（统一使用 Xiaoyi，通过 pitch/rate 区分角色）
    'zh-CN-XiaoyiNeural':   { name: '晓伊', gender: '女', style: '通用女声', desc: '唯一女声，参数区分角色' },
    // 普通话 - 男声（统一使用 Yunxi，通过 pitch/rate 区分角色）
    'zh-CN-YunxiNeural':    { name: '云希', gender: '男', style: '通用男声', desc: '唯一男声，参数区分角色' },
};

// 默认音色
const DEFAULT_VOICE_BY_GENDER = { '女': 'zh-CN-XiaoyiNeural', '男': 'zh-CN-YunxiNeural' };

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

// ===== TTS 数值解析辅助 =====
function parseParamValue(val, unit) {
    if (!val) return 0;
    const num = parseFloat(val.replace(unit, ''));
    return isNaN(num) ? 0 : num;
}

function formatParamValue(num, unit) {
    const prefix = num >= 0 ? '+' : '';
    return `${prefix}${num}${unit}`;
}

// ===== 角色基底参数读取 =====
function getCharacterBaseParams(character) {
    if (!character) {
        rpLog('TTS:', `DIAG 无角色数据 char=null → 默认基底 pitch=0 rate=0`);
        return { pitch: 0, rate: 0, volume: 0 };
    }
    const rawPitch = character.ttsPitch || '+0Hz';
    const rawRate = character.ttsRate || '+0%';
    const rawVol = character.ttsVolume || '+0%';
    const result = {
        pitch: parseParamValue(rawPitch, 'Hz'),
        rate: parseParamValue(rawRate, '%'),
        volume: parseParamValue(rawVol, '%')
    };
    rpLog('TTS:', `BASE ${character.name}: rawPitch=${rawPitch} rawRate=${rawRate} → parsed pitch=${result.pitch}Hz rate=${result.rate}%`);
    return result;
}

// ===== 情绪 → 参数偏移映射 =====
const EMOTION_OFFSETS = {
    angry:       { pitch: +8, rate: +15, volume: +20 },
    excited:     { pitch: +5, rate: +20, volume: +15 },
    shouting:    { pitch: +10, rate: +10, volume: +30 },
    gentle:      { pitch: -3, rate: -8, volume: -10 },
    calm:        { pitch: 0, rate: 0, volume: 0 },
    whisper:     { pitch: 0, rate: -10, volume: -30 },
    sad:         { pitch: -5, rate: -10, volume: -10 },
    depressed:   { pitch: -8, rate: -15, volume: -15 },
    crying:      { pitch: -3, rate: -5, volume: -15 },
    hesitant:    { pitch: 0, rate: -10, volume: -10 },
    nervous:     { pitch: +3, rate: +10, volume: -5 },
    scared:      { pitch: +5, rate: +15, volume: -10 },
    confident:   { pitch: +3, rate: 0, volume: +5 },
    serious:     { pitch: -3, rate: -5, volume: 0 },
    commanding:  { pitch: -5, rate: 0, volume: +15 },
    happy:       { pitch: +3, rate: +5, volume: +5 },
    cheerful:    { pitch: +5, rate: +10, volume: +10 },
    playful:     { pitch: +5, rate: +8, volume: 0 },
    anxious:     { pitch: +3, rate: +10, volume: -5 },
    threatening: { pitch: -8, rate: -5, volume: +10 },
    surprised:   { pitch: +8, rate: +15, volume: +15 },
    indifferent: { pitch: 0, rate: -5, volume: -10 },
};

// ===== 根据消息内容推断情绪偏移 =====
function inferEmotionOffset(msg) {
    const dialogue = (msg.dialogue || msg.content || '').toLowerCase();
    const action = (msg.action || '').toLowerCase();
    const combined = dialogue + ' ' + action;
    
    // 关键词匹配情绪
    const emotionKeywords = {
        angry: ['怒', '恨', '杀', '滚', '该死', '可恶', '愤怒', '生气', '咬牙', '怒吼'],
        shouting: ['吼', '喊', '咆哮', '大叫', '嘶吼', '怒吼'],
        scared: ['怕', '恐惧', '害怕', '颤抖', '惊恐', '冷汗', '后退', '逃跑'],
        sad: ['哭', '泪', '悲', '痛', '绝望', '心碎', '哽咽', '低头'],
        happy: ['笑', '开心', '高兴', '喜悦', '欢呼', '灿烂'],
        whisper: ['轻声', '耳语', '低语', '悄悄', '喃喃'],
        nervous: ['紧张', '不安', '犹豫', '手心出汗', '结巴', '吞吞吐吐'],
        confident: ['自信', '傲慢', '不屑', '冷笑', '挑眉', '嘴角上扬'],
        gentle: ['温柔', '轻声', '抚慰', '安慰', '抚摸', '拥抱'],
        serious: ['严肃', '认真', '正色', '郑重', '沉声'],
        commanding: ['命令', '下令', '不容置疑', '立刻', '马上'],
        surprised: ['惊', '愣', '诧异', '没想到', '瞪大', '瞳孔收缩'],
        playful: ['调皮', '坏笑', '眨眼', '嬉闹', '逗弄'],
        depressed: ['消沉', '颓废', '麻木', '空洞', '失去希望'],
        hesitant: ['迟疑', '犹豫', '欲言又止', '停顿'],
    };
    
    let bestEmotion = 'calm';
    let bestScore = 0;
    
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        const score = keywords.filter(kw => combined.includes(kw)).length;
        if (score > bestScore) {
            bestScore = score;
            bestEmotion = emotion;
        }
    }
    
    const offset = EMOTION_OFFSETS[bestEmotion] || { pitch: 0, rate: 0, volume: 0 };
    rpLog('TTS:', `EMOTION "${combined.substring(0, 40)}..." → ${bestEmotion} offset=pitch+${offset.pitch} rate+${offset.rate}`);
    return offset;
}

// ===== 计算最终 TTS 参数（基底 + 情绪偏移）=====
App.computeFinalParams = function(character, msg) {
    const base = getCharacterBaseParams(character);
    const offset = inferEmotionOffset(msg);
    
    // 合并并限制范围（pitch ±15Hz，rate ±35%）
    let finalPitch = Math.max(-15, Math.min(15, base.pitch + offset.pitch));
    let finalRate = Math.max(-35, Math.min(35, base.rate + offset.rate));
    let finalVolume = Math.max(-100, Math.min(100, base.volume + offset.volume));
    
    const result = {
        pitch: formatParamValue(Math.round(finalPitch / 5) * 5, 'Hz'),
        rate: formatParamValue(Math.round(finalRate / 5) * 5, '%'),
        volume: formatParamValue(Math.round(finalVolume / 5) * 5, '%')
    };
    rpLog('TTS:', `FINAL ${character?.name || '?'}: base[${base.pitch}Hz/${base.rate}%] + offset[${offset.pitch}/${offset.rate}%] → pitch=${result.pitch} rate=${result.rate} vol=${result.volume}`);
    return result;
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
    rpLog('TTS:', `GEN text="${text.substring(0, 30)}..." voice=${voice} pitch=${pitch} rate=${rate} vol=${volume}`);
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
    rpLog('TTS:', `CHAR charIndex=${charIdx} charName=${char ? char.name : 'NULL'} keys=${char ? Object.keys(char).join(',') : 'N/A'}`);
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
        
        // 直接用角色基底参数 + 情绪偏移计算 TTS 参数
        let params = App.computeFinalParams(char, msg);
        
        let rate = params?.rate || '+0%';
        let pitch = params?.pitch || '+0Hz';
        let volume = params?.volume || '+0%';
        
        // 规范化格式：Edge TTS 要求带 +/- 前缀
        if (rate && !rate.startsWith('+') && !rate.startsWith('-')) rate = '+' + rate.replace('%', '') + '%';
        if (pitch && !pitch.startsWith('+') && !pitch.startsWith('-')) pitch = '+' + pitch.replace('Hz', '') + 'Hz';
        if (volume && !volume.startsWith('+') && !volume.startsWith('-')) volume = '+' + volume.replace('%', '') + '%';
        
        rpLog('TTS:', `SEND voice=${voice} pitch=${pitch} rate=${rate} vol=${volume} text="${text.substring(0, 40)}..."`);
        
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
                
                // 注意：不持久化 blob URL，仅保存在内存中
                // msg._audioUrl 和 msg._audioBlobUrl 不会被 saveMessages() 持久化
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
    
    // 音色选择器 UI — 只保留 Xiaoyi 和 Yunxi
    const groups = {
        '女声': ['zh-CN-XiaoyiNeural'],
        '男声': ['zh-CN-YunxiNeural'],
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
