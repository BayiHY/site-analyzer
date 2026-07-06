// === Section: TTS 语音引擎 ===
// 基于 Blob URL + Cache API 的纯前端 TTS 集成
// 后端代理 /api/tts 返回 MP3 字节流，前端缓存到 Cache API

// WAV 编码辅助函数
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// ===== 全局音频管理器 =====
let _currentAudio = null;       // 当前正在播放的 AudioBufferSourceNode
let _playingMsgId = null;       // 正在播放的消息 ID
let _activeSources = [];        // 所有活跃源节点（用于彻底清理）
let _audioContexts = {};        // msgId → AudioContext 映射
let _audioBuffers = {};         // msgId → AudioBuffer 映射
let _pendingBlobURLs = {};      // 防止 blob URL 被 GC 回收

// ===== 有序播放队列：按消息渲染顺序串行处理 =====
let _ttsQueue = [];             // 待处理的任务 [{msg, msgEl, resolve}]
let _ttsQueueActive = false;    // 队列是否正在处理

// ===== 自动播放队列：按消息渲染顺序，等待当前播放结束后串行播放 =====
let _autoPlayQueue = [];        // 待自动播放的 [{msgId, decodedBuffer}]
let _autoPlayPending = false;   // 是否有待处理的自动播放
let _lastPlayedMsgId = null;    // 最后一条已播放的消息 ID（用于顺序校验）

/**
 * enqueueTTS — 将一条消息的 TTS 生成+播放加入有序队列
 * 保证：先进先出，前一个处理完（生成/播放/失败）后才处理下一个
 */
function enqueueTTS(msg, msgEl) {
    return new Promise((resolve) => {
        _ttsQueue.push({ msg, msgEl, resolve });
        rpLog('info', 'TTS', `入队 msgId=${msg.id} char=${msg.charName || '?'} 队列长度=${_ttsQueue.length}`);
        if (!_ttsQueueActive) {
            _ttsQueueActive = true;
            processTTSQueue();
        }
    });
}

async function processTTSQueue() {
    if (_ttsQueue.length === 0) {
        _ttsQueueActive = false;
        return;
    }

    const task = _ttsQueue.shift();
    rpLog('info', 'TTS', `出队处理 msgId=${task.msg.id} 剩余=${_ttsQueue.length} isNarration=${task.isNarration || false}`);

    try {
        let audioUrl;
        if (task.isNarration) {
            // 环境旁白：使用 xiaoxiao 固定声线
            audioUrl = await App.generateNarrationTTS(task.msg.content || '');
        } else {
            // 角色对话：使用角色音色
            audioUrl = await generateTTSForMessage(task.msg);
        }
        if (!audioUrl) {
            rpLog('info', 'TTS', `msgId=${task.msg.id} 音频生成失败，跳过`);
            task.resolve(false);
            setTimeout(processTTSQueue, 50);
            return;
        }

        // 2. 插入气泡并播放
        const ok = insertAudioIntoBubble(task.msgEl, audioUrl, task.msg);
        task.resolve(ok);
    } catch (e) {
        rpLog('info', 'TTS', `msgId=${task.msg.id} 处理异常: ${e.message}`);
        task.resolve(false);
    }

    // 每个任务间隔 300ms，避免浏览器自动播放策略拦截
    setTimeout(processTTSQueue, 300);
}

/**
 * 为消息生成 TTS 音频 URL（内部方法）
 */
async function generateTTSForMessage(msg) {
    const charIdx = msg.charIndex;
    const char = charIdx != null ? state.characters[charIdx] : null;
    const voice = App.autoMatchVoice(char);

    // 只提取对话内容用于 TTS
    let text = '';
    if (msg.type === 'multi_char') {
        text = msg.dialogue || '';
    } else {
        text = msg.content || '';
    }
    if (!text || text.length < 2) return null;

    // 计算 TTS 参数
    let params = App.computeFinalParams(char, msg);
    let rate = params?.rate || '+0%';
    let pitch = params?.pitch || '+0Hz';
    let volume = params?.volume || '+0%';

    // 规范化格式
    if (rate && !rate.startsWith('+') && !rate.startsWith('-')) rate = '+' + rate.replace('%', '') + '%';
    if (pitch && !pitch.startsWith('+') && !pitch.startsWith('-')) pitch = '+' + pitch.replace('Hz', '') + 'Hz';
    if (volume && !volume.startsWith('+') && !volume.startsWith('-')) volume = '+' + volume.replace('%', '') + '%';

    rpLog('info', 'TTS', `GEN voice=${voice} pitch=${pitch} rate=${rate} text="${text.substring(0, 40)}..."`);

    return await App.generateTTS(text, voice, rate, volume, pitch);
}

/**
 * 在气泡中插入音频胶囊按钮
 * 状态：生成中 → 生成完成 → 播放中/暂停 → 播放完成
 * 点击可播放、暂停、重播
 */
function insertAudioIntoBubble(msgEl, audioResult, msg) {
    const bubble = msgEl.querySelector('.bubble');
    if (!bubble) return false;

    // 是否来自刷新后的恢复流程
    const isRestoring = msg._isRestoring;
    // 移除旧的生成中占位（可能是 .tts-loading 或 .tts-capsule[data-status="generating"]）
    const oldLoading = bubble.querySelector('.tts-loading');
    if (oldLoading) oldLoading.remove();
    const oldCapsule = bubble.querySelector('.tts-capsule[data-status="generating"]');
    if (oldCapsule) oldCapsule.remove();

    // 避免重复插入（已有完整音频胶囊则跳过）
    if (bubble.querySelector('.tts-capsule')) return false;

    if (!audioResult || audioResult.type !== 'arraybuffer') {
        rpLog('error', 'TTS', `无效音频结果: ${JSON.stringify(audioResult)?.substring(0, 60)} (msgId=${msg.id})`);
        return false;
    }

    const arrayBuffer = audioResult.data;
    const msgId = msg.id;

    // 创建胶囊按钮 — 复用 thought-btn 样式
    const capsule = document.createElement('button');
    capsule.className = 'tts-capsule thought-btn';
    capsule.dataset.msgId = msgId;
    capsule.type = 'button';
    
    // 状态图标（flex 居中，和文字并排）
    const icon = document.createElement('span');
    icon.className = 'tts-icon';
    icon.textContent = '⏳';
    icon.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        line-height: 1;
        pointer-events: none;
        margin-right: 6px;
    `;
    
    // 状态文字
    const label = document.createElement('span');
    label.className = 'tts-label';
    label.textContent = '生成中...';
    
    // 进度环（生成中时旋转）
    const spinner = document.createElement('span');
    spinner.className = 'tts-spinner';
    spinner.style.cssText = `
        display: none;
        width: 10px; height: 10px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        animation: tts-spin 0.8s linear infinite;
        vertical-align: middle;
        margin-right: 4px;
    `;
    
    capsule.appendChild(spinner);
    capsule.appendChild(icon);
    capsule.appendChild(label);
    bubble.appendChild(capsule);
    
    // 初始状态：生成中
    capsule.dataset.status = 'generating';
    icon.textContent = '⏳';
    label.textContent = '生成中...';
    
    // 只添加 spinner 动画，其余全部复用 thought-btn 的样式
    if (!document.getElementById('tts-capsule-style')) {
        const style = document.createElement('style');
        style.id = 'tts-capsule-style';
        style.textContent = `
            @keyframes tts-spin { to { transform: rotate(360deg); } }
            .tts-spinner { display: none; }
            .tts-capsule[data-status="generating"] .tts-spinner { display: inline-block; }
        `;
        document.head.appendChild(style);
    }

    // 设置状态
    function setCapsuleStatus(status, iconText, labelText) {
        capsule.dataset.status = status;
        icon.textContent = iconText || '';
        label.textContent = labelText || '';
    }

    // 用 Web Audio API 解码
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _audioContexts[msgId] = audioCtx;

    audioCtx.decodeAudioData(arrayBuffer.slice(0), function(decodedBuffer) {
        _audioBuffers[msgId] = decodedBuffer;
        setCapsuleStatus('ready', '▶️', '点击播放');
        rpLog('info', 'TTS', `WEB-AUDIO decoded: ${decodedBuffer.sampleRate}Hz ${decodedBuffer.duration.toFixed(2)}s (msgId=${msgId})`);
        
        // 自动播放（仅非恢复模式）— 加入自动播放队列，按消息渲染顺序串行
        if (!isRestoring) {
            _lastPlayedMsgId = msgId;
            enqueueAutoPlay(msgId, decodedBuffer);
        }
    }, function(error) {
        setCapsuleStatus('error', '❌', '解码失败');
        rpLog('error', 'TTS', `WEB-AUDIO decode error: ${error.message} (msgId=${msgId})`);
    });

    // 点击事件：播放/停止/重播
    capsule.addEventListener('click', function() {
        const buffer = _audioBuffers[msgId];
        if (!buffer) return;
        
        const currentStatus = capsule.dataset.status;
        
        if (currentStatus === 'playing') {
            // 播放中 → 停止
            togglePlayTTS(msgId);
        } else {
            // 其他状态 → 播放
            togglePlayTTS(msgId);
        }
    });

    // 获取角色信息并持久化
    const charIdx = msg.charIndex;
    const char = charIdx != null ? state.characters[charIdx] : null;
    const voice = App.autoMatchVoice(char);
    // 场景旁白不使用情绪变频变速，固定 +0Hz/+0%
    if (msg.isScene) {
        rpLog('info', 'TTS', `场景消息跳过情绪检测，使用固定参数 pitch=+0Hz rate=+0%`);
    }
    const params = msg.isScene ? { rate: '+0%', pitch: '+0Hz', volume: '+0%' } : App.computeFinalParams(char, msg);
    const rate = params?.rate || '+0%';
    const pitch = params?.pitch || '+0Hz';
    const volume = params?.volume || '+0%';

    msg._ttsText = msg.dialogue || msg.content || '';
    msg._ttsVoice = voice;
    msg._ttsRate = rate;
    msg._ttsPitch = pitch;
    msg._ttsVolume = volume;

    try {
        const ttsMeta = JSON.parse(sessionStorage.getItem('rp_tts_meta') || '{}');
        ttsMeta[msg.id] = { text: msg._ttsText, voice: msg._ttsVoice, rate, pitch, volume };
        sessionStorage.setItem('rp_tts_meta', JSON.stringify(ttsMeta));
    } catch(e) {}

    msg._played = true;

    try {
        const playedIds = JSON.parse(sessionStorage.getItem('rp_played_msg_ids') || '[]');
        if (!playedIds.includes(msg.id)) {
            playedIds.push(msg.id);
            sessionStorage.setItem('rp_played_msg_ids', JSON.stringify(playedIds));
        }
    } catch(e) {}

    return true;
}

/**
 * 将自动播放任务加入队列（按消息渲染顺序）
 * 如果当前没有音频在播放，立即播放；否则等待当前播放结束后按序播放
 */
function enqueueAutoPlay(msgId, decodedBuffer) {
    _autoPlayQueue.push({ msgId, buffer: decodedBuffer });
    rpLog('info', 'TTS', `自动播放入队 msgId=${msgId} 队列长度=${_autoPlayQueue.length}`);
    
    // 如果没有正在播放且队列没有待处理，立即开始
    if (!_playingMsgId && !_autoPlayPending) {
        drainAutoPlayQueue();
    }
}

/**
 *  draining 自动播放队列：按序播放，等待当前音频结束后取下一个
 */
function drainAutoPlayQueue() {
    if (_autoPlayQueue.length === 0) {
        _autoPlayPending = false;
        return;
    }
    
    _autoPlayPending = true;
    const task = _autoPlayQueue.shift();
    rpLog('info', 'TTS', `自动播放出队 msgId=${task.msgId} 剩余=${_autoPlayQueue.length}`);
    
    // 立即播放（如果当前无播放）或等待当前播放结束
    if (!_playingMsgId) {
        playAutoPlayTask(task);
    }
    // 如果当前有播放，playTTSFromBuffer 的 onended 会触发 drainAutoPlayQueue
}

function playAutoPlayTask(task) {
    const msgId = task.msgId;
    const buffer = task.buffer;
    const audioCtx = _audioContexts[msgId];
    if (!audioCtx || !buffer) {
        rpLog('warn', 'TTS', `自动播放跳过: msgId=${msgId} 上下文或buffer不存在`);
        _autoPlayPending = false;
        // 延迟一点继续处理下一个
        setTimeout(drainAutoPlayQueue, 100);
        return;
    }
    
    // 创建播放源
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    
    // 直接使用 edge-tts 生成的原始音频，不做额外 pitch/rate/volume 处理
    source.connect(audioCtx.destination);
    
    _playingMsgId = msgId;
    
    // 更新胶囊状态为播放中
    const capsule = document.querySelector(`.tts-capsule[data-msg-id="${msgId}"]`);
    if (capsule) {
        capsule.dataset.status = 'playing';
        const icon = capsule.querySelector('.tts-icon');
        const label = capsule.querySelector('.tts-label');
        if (icon) icon.textContent = '🔊';
        if (label) label.textContent = '播放中...';
    }
    
    rpLog('info', 'TTS', `自动播放 (msgId=${msgId})`);
    
    // 确保 AudioContext 处于运行状态，避免 suspended 导致开头被截断
    // resume 是异步的，必须 await 后再 start
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            rpLog('info', 'TTS', `audioCtx resumed for msgId=${msgId}`);
            source.start(audioCtx.currentTime);
        }).catch(e => rpLog('warn', 'TTS', `audioCtx.resume failed: ${e.message}`));
    } else {
        source.start(audioCtx.currentTime);
    }
    _activeSources.push(source);
    _currentAudio = source;
    
    // 播放结束后：处理队列中的下一个
    source.onended = function() {
        const idx = _activeSources.indexOf(source);
        if (idx !== -1) _activeSources.splice(idx, 1);
        
        if (_playingMsgId === msgId) {
            rpLog('info', 'TTS', `自动播放 msgId=${msgId} 结束`);
            _currentAudio = null;
            _playingMsgId = null;
            
            if (capsule) {
                capsule.dataset.status = 'done';
                const icon = capsule.querySelector('.tts-icon');
                const label = capsule.querySelector('.tts-label');
                if (icon) icon.textContent = '✅';
                if (label) label.textContent = '播放完成';
            }
            
            // 继续播放队列中的下一个
            _autoPlayPending = false;
            setTimeout(drainAutoPlayQueue, 200);
        }
    };
}

/**
 * 从 AudioBuffer 播放音频（手动点击时使用，会中断当前播放）
 */
function playTTSFromBuffer(msgId, decodedBuffer) {
    const audioCtx = _audioContexts[msgId];
    if (!audioCtx) return;

    // 创建播放源
    const source = audioCtx.createBufferSource();
    source.buffer = decodedBuffer;
    
    // 直接使用 edge-tts 生成的原始音频，不做额外 pitch/rate/volume 处理
    source.connect(audioCtx.destination);
    
    // 播放 — 使用 audioCtx.currentTime 代替 0，确保 ctx 已运行
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            source.start(audioCtx.currentTime);
        }).catch(e => rpLog('warn', 'TTS', `playTTSFromBuffer resume failed: ${e.message}`));
    } else {
        source.start(audioCtx.currentTime);
    }
    _activeSources.push(source);
    _currentAudio = source;
    _playingMsgId = msgId;
    
    // 更新胶囊状态
    const capsule = document.querySelector(`.tts-capsule[data-msg-id="${msgId}"]`);
    if (capsule) {
        capsule.dataset.status = 'playing';
        const icon = capsule.querySelector('.tts-icon');
        const label = capsule.querySelector('.tts-label');
        if (icon) icon.textContent = '🔊';
        if (label) label.textContent = '播放中...';
    }
    
    rpLog('info', 'TTS', `WEB-AUDIO playing (msgId=${msgId})`);
    
    source.onended = function() {
        // 从活跃列表中移除
        const idx = _activeSources.indexOf(source);
        if (idx !== -1) _activeSources.splice(idx, 1);
        
        // 只有当这个是当前播放的才清理全局状态
        if (_playingMsgId === msgId) {
            rpLog('info', 'TTS', `msgId=${msgId} 播放结束`);
            _currentAudio = null;
            _playingMsgId = null;
            
            if (capsule) {
                capsule.dataset.status = 'done';
                const icon = capsule.querySelector('.tts-icon');
                const label = capsule.querySelector('.tts-label');
                if (icon) icon.textContent = '✅';
                if (label) label.textContent = '播放完成';
            }
        }
    };
}

/**
 * 停止音频 — 停止所有活跃源，彻底清场，清空自动播放队列
 */
function stopTTS() {
    // 停止所有活跃源
    for (const source of _activeSources) {
        try { source.stop(); } catch(e) {}
    }
    _activeSources = [];
    _currentAudio = null;
    // 清除正在播放的胶囊状态
    if (_playingMsgId) {
        const prevCapsule = document.querySelector(`.tts-capsule[data-msg-id="${_playingMsgId}"]`);
        if (prevCapsule) {
            prevCapsule.dataset.status = 'ready';
            const icon = prevCapsule.querySelector('.tts-icon');
            const label = prevCapsule.querySelector('.tts-label');
            if (icon) icon.textContent = '▶️';
            if (label) label.textContent = '点击播放';
        }
    }
    _playingMsgId = null;
    
    // 清空自动播放队列（手动中断时放弃排队）
    _autoPlayQueue = [];
    _autoPlayPending = false;
}

/**
 * 停止/播放音频
 */
function togglePlayTTS(msgId) {
    const buffer = _audioBuffers[msgId];
    if (!buffer) return;
    
    const capsule = document.querySelector(`.tts-capsule[data-msg-id="${msgId}"]`);
    
    if (_playingMsgId === msgId && _currentAudio) {
        // 正在播放自己 → 停止
        stopTTS();
    } else {
        // 停止旧的，播放新的
        stopTTS();
        // 先确保 AudioContext 运行，再播放
        const audioCtx = _audioContexts[msgId];
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                playTTSFromBuffer(msgId, buffer);
            }).catch(e => rpLog('warn', 'TTS', `togglePlayTTS resume failed: ${e.message}`));
        } else {
            playTTSFromBuffer(msgId, buffer);
        }
    }
}

/**
 * 播放音频
 */
function playAudio(audioEl, msgId) {
    App.stopAllAudio();
    _playingMsgId = msgId;
    _currentAudio = audioEl;

    audioEl.addEventListener('ended', function() {
        _currentAudio = null;
        _playingMsgId = null;
        rpLog('info', 'TTS', `msgId=${msgId} 播放结束`);
    }, { once: true });

    audioEl.play().catch(e => {
        rpLog('warn', 'TTS', `AUTO-PLAY blocked: ${e.message} (msgId=${msgId})`);
        // 浏览器阻止自动播放，控件保持可见让用户手动播放
        if (_currentAudio === audioEl) {
            audioEl.controls = true;
        }
        _currentAudio = null;
        _playingMsgId = null;
    });
}

App.stopAllAudio = function() {
    // 停止当前播放
    if (_currentAudio) {
        try { _currentAudio.stop(); } catch(e) {}
        _currentAudio = null;
    }
    
    // 清理所有 AudioContext
    for (const msgId in _audioContexts) {
        try { _audioContexts[msgId].close(); } catch(e) {}
    }
    _audioContexts = {};
    _audioBuffers = {};
    
    _playingMsgId = null;
    
    // 清空自动播放队列
    _autoPlayQueue = [];
    _autoPlayPending = false;
};

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
    let hash = 0;
    const str = `${text}|${voice}|${rate}|${pitch}|${volume}`;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `tts/${Math.abs(hash).toString(16)}`;
}

// ===== TTS 结构化参数 =====
// 注意：实际运行时 rate 钳位到 ±8%，pitch 钳位到 ±4Hz（由 computeFinalParams 和 voice-allocation.js 控制）
const TTS_PARAMS = {
    rate: { min: '-8%', max: '+8%', step: 1, unit: '%' },
    pitch: { min: '-4Hz', max: '+4Hz', step: 1, unit: 'Hz' },
    volume: { min: '-100%', max: '+100%', step: 10, unit: '%' }
};

// 情绪 → 参数映射表（供 LLM 参考）
const EMOTION_PARAM_GUIDE = {
    angry:       { rate: '+20%', pitch: '+20Hz', volume: '+30%' },
    excited:     { rate: '+30%', pitch: '+10Hz', volume: '+20%' },
    shouting:    { rate: '+20%', pitch: '+30Hz', volume: '+50%' },
    gentle:      { rate: '-10%', pitch: '0Hz', volume: '-10%' },
    calm:        { rate: '0%', pitch: '0Hz', volume: '0%' },
    whisper:     { rate: '-20%', pitch: '-10Hz', volume: '-50%' },
    sad:         { rate: '-20%', pitch: '-20Hz', volume: '-20%' },
    depressed:   { rate: '-30%', pitch: '-30Hz', volume: '-30%' },
    crying:      { rate: '-10%', pitch: '-10Hz', volume: '-10%' },
    hesitant:    { rate: '-20%', pitch: '0Hz', volume: '-20%' },
    nervous:     { rate: '+10%', pitch: '+10Hz', volume: '-10%' },
    scared:      { rate: '+20%', pitch: '+20Hz', volume: '-20%' },
    confident:   { rate: '0%', pitch: '+10Hz', volume: '+10%' },
    serious:     { rate: '-10%', pitch: '-10Hz', volume: '0%' },
    commanding:  { rate: '0%', pitch: '-20Hz', volume: '+20%' },
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
        rpLog('info', 'TTS', `DIAG 无角色数据 char=null → 默认基底 pitch=0 rate=0`);
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
    rpLog('info', 'TTS', `BASE ${character.name}: rawPitch=${rawPitch} rawRate=${rawRate} → parsed pitch=${result.pitch}Hz rate=${result.rate}%`);
    return result;
}

// ===== 情绪 → 参数偏移映射 =====
// 注意：pitch 偏移已被 computeFinalParams 忽略（pitch 只用基底值，不受情绪影响）
// 保留 pitch 字段仅为向后兼容，未来可移除
const EMOTION_OFFSETS = {
    angry:       { pitch: 0, rate: +15, volume: +20 },
    excited:     { pitch: 0, rate: +20, volume: +15 },
    shouting:    { pitch: 0, rate: +10, volume: +30 },
    gentle:      { pitch: 0, rate: -8, volume: -10 },
    calm:        { pitch: 0, rate: 0, volume: 0 },
    whisper:     { pitch: 0, rate: -10, volume: -30 },
    sad:         { pitch: 0, rate: -10, volume: -10 },
    depressed:   { pitch: 0, rate: -15, volume: -15 },
    crying:      { pitch: 0, rate: -5, volume: -15 },
    hesitant:    { pitch: 0, rate: -10, volume: -10 },
    nervous:     { pitch: 0, rate: +10, volume: -5 },
    scared:      { pitch: 0, rate: +15, volume: -10 },
    confident:   { pitch: 0, rate: 0, volume: +5 },
    serious:     { pitch: 0, rate: -5, volume: 0 },
    commanding:  { pitch: 0, rate: 0, volume: +15 },
    happy:       { pitch: 0, rate: +5, volume: +5 },
    cheerful:    { pitch: 0, rate: +10, volume: +10 },
    playful:     { pitch: 0, rate: +8, volume: 0 },
    anxious:     { pitch: 0, rate: +10, volume: -5 },
    threatening: { pitch: 0, rate: -5, volume: +10 },
    surprised:   { pitch: 0, rate: +15, volume: +15 },
    indifferent: { pitch: 0, rate: -5, volume: -10 },
};

// ===== 根据消息内容推断情绪偏移 =====
function inferEmotionOffset(msg) {
    const dialogue = (msg.dialogue || msg.content || '').toLowerCase();
    const action = (msg.action || '').toLowerCase();
    const combined = dialogue + ' ' + action;

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
    rpLog('info', 'TTS', `EMOTION "${combined.substring(0, 40)}..." → ${bestEmotion} offset=pitch+${offset.pitch} rate+${offset.rate}`);
    return offset;
}

// ===== 计算最终 TTS 参数（基底 pitch + 情绪偏移 rate/volume）=====
App.computeFinalParams = function(character, msg) {
    const base = getCharacterBaseParams(character);
    const offset = inferEmotionOffset(msg);

    // pitch 只用基底，不受情绪影响（voice-allocation.js 已钳位到 ±4Hz）
    let finalPitch = base.pitch;
    // rate 基底 + 情绪偏移后钳位到 ±8%（step 1%）
    let finalRate = Math.max(-8, Math.min(8, base.rate + offset.rate));
    let finalVolume = Math.max(-100, Math.min(100, base.volume + offset.volume));

    const result = {
        pitch: formatParamValue(Math.round(finalPitch), 'Hz'),
        rate: formatParamValue(Math.round(finalRate), '%'),
        volume: formatParamValue(Math.round(finalVolume), '%')
    };
    rpLog('info', 'TTS', `FINAL ${character?.name || '?'}: base[${base.pitch}Hz/${base.rate}%] + offset[${offset.pitch}/${offset.rate}%] → pitch=${result.pitch} rate=${result.rate} vol=${result.volume}`);
    return result;
}

// ===== 生成语音（带情绪参数）=====
App.generateTTS = async function(text, voice, rate='+0%', volume='+0%', pitch='+0Hz') {
    if (!text || !voice) return null;

    const cacheKey = App.ttsCacheKey(text, voice, rate, pitch, volume);

    // 1. 先查精确缓存
    try {
        const cache = await App.getTtsCache();
        const cachedResp = await cache.match(cacheKey);
        if (cachedResp) {
            rpLog('info', 'TTS', `命中缓存: ${text.substring(0, 30)}...`);
            const cachedArrayBuffer = await cachedResp.arrayBuffer();
            // 返回 ArrayBuffer + 原始 blob type，供前端解码
            return {
                type: 'arraybuffer',
                data: cachedArrayBuffer,
                mimeType: cachedResp.headers?.get('content-type') || 'audio/mpeg'
            };
        }
    } catch (e) {
        rpLog('info', 'TTS', `Cache API 读取失败: ${e.message}`);
    }

    // 2. 调后端生成
    rpLog('info', 'TTS', `GEN text="${text.substring(0, 30)}..." voice=${voice} pitch=${pitch} rate=${rate} vol=${volume}`);
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

        const arrayBuffer = await resp.arrayBuffer();
        rpLog('info', 'TTS', `FETCH resp ok=${resp.ok} status=${resp.status} arrayBuffer.byteLength=${arrayBuffer.byteLength}`);
        
        // 存入 Cache API（存原始 ArrayBuffer）
        try {
            const cache = await App.getTtsCache();
            const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
            await cache.put(cacheKey, new Response(blob, {
                headers: { 'Content-Type': 'audio/mpeg' }
            }));
            rpLog('info', 'TTS', `已缓存: ${text.substring(0, 30)}...`);
        } catch (e) {
            rpLog('info', 'TTS', `缓存写入失败: ${e.message}`);
        }

        return {
            type: 'arraybuffer',
            data: arrayBuffer,
            mimeType: 'audio/mpeg'
        };
    } catch (e) {
        rpLog('info', 'TTS', `生成失败: ${e.message}`);
        return null;
    }
}

// ===== 为角色消息自动匹配音色 =====
App.autoMatchVoice = function(character) {
    if (!character) return DEFAULT_VOICE_BY_GENDER['女'];

    const gender = character.gender || '';
    const voice = character.voice || '';

    if (voice && TTS_VOICES[voice]) {
        return voice;
    }

    return DEFAULT_VOICE_BY_GENDER[gender] || DEFAULT_VOICE_BY_GENDER['女'];
}

// ===== 环境旁白 TTS 专用 =====
// 固定声线: zh-CN-XiaoxiaoNeural, 固定 pitch=0Hz rate=+0% volume=+0%, 语速可通过设置调整

const NARRATION_VOICE = 'zh-CN-XiaoxiaoNeural';

/**
 * 生成环境旁白 TTS 音频
 * 使用固定的 xiaoxiao 声线，语速由 state.narrationSettings.rate 控制
 */
App.generateNarrationTTS = async function(text) {
    if (!text || text.length < 2) return null;

    // 防御性：确保 rate 带 + 前缀（edge-tts 要求）
    let rate = state.narrationSettings?.rate || '+0%';
    if (rate && !rate.startsWith('+') && !rate.startsWith('-')) rate = '+' + rate;
    const pitch = '+0Hz';
    const volume = '+0%';

    const cacheKey = App.ttsCacheKey(text, NARRATION_VOICE, rate, pitch, volume);

    // 1. 先查精确缓存
    try {
        const cache = await App.getTtsCache();
        const cachedResp = await cache.match(cacheKey);
        if (cachedResp) {
            rpLog('info', 'TTS', `旁白命中缓存: ${text.substring(0, 30)}...`);
            const cachedArrayBuffer = await cachedResp.arrayBuffer();
            return {
                type: 'arraybuffer',
                data: cachedArrayBuffer,
                mimeType: cachedResp.headers?.get('content-type') || 'audio/mpeg'
            };
        }
    } catch (e) {
        rpLog('info', 'TTS', `旁白 Cache API 读取失败: ${e.message}`);
    }

    // 2. 调后端生成
    rpLog('info', 'TTS', `旁白生成 text="${text.substring(0, 30)}..." voice=${NARRATION_VOICE} rate=${rate}`);
    try {
        const resp = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: NARRATION_VOICE, rate, volume, pitch })
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }

        const arrayBuffer = await resp.arrayBuffer();

        // 存入 Cache API
        try {
            const cache = await App.getTtsCache();
            const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
            await cache.put(cacheKey, new Response(blob, {
                headers: { 'Content-Type': 'audio/mpeg' }
            }));
        } catch (e) {
            rpLog('info', 'TTS', `旁白缓存写入失败: ${e.message}`);
        }

        return {
            type: 'arraybuffer',
            data: arrayBuffer,
            mimeType: 'audio/mpeg'
        };
    } catch (e) {
        rpLog('info', 'TTS', `旁白生成失败: ${e.message}`);
        return null;
    }
}

/**
 * 为场景消息（环境旁白）嵌入音频胶囊
 * 复用 TTS 队列机制，保证串行处理
 */
App.attachNarrationTTS = function(msgEl, msg) {
    if (!App.isTTSEnabled()) return;
    if (msgEl.querySelector('.tts-capsule')) return;

    const text = msg.content || '';
    if (!text || text.length < 2) return;

    // 获取角色信息用于持久化 meta
    const charIdx = msg.charIndex;
    const char = charIdx != null ? state.characters[charIdx] : null;
    const voice = NARRATION_VOICE;
    // 防御性：确保 rate 带 + 前缀（edge-tts 要求）
    let rate = state.narrationSettings?.rate || '+0%';
    if (rate && !rate.startsWith('+') && !rate.startsWith('-')) rate = '+' + rate;
    const pitch = '+0Hz';
    const volume = '+0%';

    // 先插入"生成中"占位
    setTimeout(() => {
        const bubble = msgEl.querySelector('.bubble');
        if (!bubble) return;
        if (bubble.querySelector('.tts-capsule')) return;

        const capsule = document.createElement('button');
        capsule.className = 'tts-capsule thought-btn';
        capsule.dataset.msgId = msg.id;
        capsule.dataset.status = 'generating';
        capsule.disabled = true;
        capsule.style.cursor = 'default';

        const spinner = document.createElement('span');
        spinner.className = 'tts-spinner';
        spinner.style.cssText = `
            display: none; width: 10px; height: 10px;
            border: 2px solid currentColor; border-top-color: transparent;
            border-radius: 50%; animation: tts-spin 0.8s linear infinite;
        `;
        const icon = document.createElement('span');
        icon.className = 'tts-icon';
        icon.textContent = '🎙️';
        icon.style.cssText = `
            display: inline-flex; align-items: center; justify-content: center;
            font-size: 0.7rem; line-height: 1; pointer-events: none; margin-right: 6px;
        `;
        const label = document.createElement('span');
        label.className = 'tts-label';
        label.textContent = '生成中...';

        capsule.appendChild(spinner);
        capsule.appendChild(icon);
        capsule.appendChild(label);
        bubble.appendChild(capsule);
    }, 50);

    // 使用独立的 TTS 队列处理旁白（与角色消息共享队列）
    enqueueNarrationTTS(msg, msgEl).then(success => {
        if (!success) {
            setTimeout(() => {
                const bubble = msgEl.querySelector('.bubble');
                if (!bubble) return;
                const capsule = bubble.querySelector('.tts-capsule');
                if (capsule && capsule.dataset.status === 'generating') {
                    capsule.dataset.status = 'error';
                    const icon = capsule.querySelector('.tts-icon');
                    const label = capsule.querySelector('.tts-label');
                    const spinner = capsule.querySelector('.tts-spinner');
                    if (spinner) spinner.style.display = 'none';
                    if (icon) icon.textContent = '🔇';
                    if (label) label.textContent = '语音生成失败 · 点击重试';
                    capsule.disabled = false;
                    capsule.style.cursor = 'pointer';
                    capsule.onclick = function() {
                        capsule.remove();
                        App.attachNarrationTTS(msgEl, msg);
                    };
                }
            }, 100);
        }
    });
}

/**
 * 旁白 TTS 入队 — 复用有序队列机制
 */
function enqueueNarrationTTS(msg, msgEl) {
    return new Promise((resolve) => {
        _ttsQueue.push({ msg, msgEl, resolve, isNarration: true });
        rpLog('info', 'TTS', `旁白入队 msgId=${msg.id} 队列长度=${_ttsQueue.length}`);
        if (!_ttsQueueActive) {
            _ttsQueueActive = true;
            processTTSQueue();
        }
    });
}

// ===== 在消息气泡中嵌入音频播放器（新版：走队列）=====
App.attachAudioToBubble = function(msgEl, msg) {
    if (msg.role !== 'char' || msg.type === 'image') return;
    if (!App.isTTSEnabled()) return;

    // 检查是否已经有音频（避免重复）
    if (msgEl.querySelector('.tts-capsule')) return;

    // 只提取对话内容用于 TTS
    let text = '';
    if (msg.type === 'multi_char') {
        text = msg.dialogue || '';
    } else {
        text = msg.content || '';
    }
    if (!text || text.length < 2) return;

    // 获取角色音色
    const charIdx = msg.charIndex;
    const char = charIdx != null ? state.characters[charIdx] : null;
    rpLog('info', 'TTS', `CHAR charIndex=${charIdx} charName=${char ? char.name : 'NULL'}`);

    // 先插入"生成中"占位 — 复用音频胶囊结构
    setTimeout(() => {
        const bubble = msgEl.querySelector('.bubble');
        if (!bubble) return;
        if (bubble.querySelector('.tts-capsule')) return;

        const capsule = document.createElement('button');
        capsule.className = 'tts-capsule thought-btn';
        capsule.dataset.msgId = msg.id;
        capsule.dataset.status = 'generating';
        capsule.disabled = true;
        capsule.style.cursor = 'default';

        const spinner = document.createElement('span');
        spinner.className = 'tts-spinner';
        spinner.style.cssText = `
            display: none; width: 10px; height: 10px;
            border: 2px solid currentColor; border-top-color: transparent;
            border-radius: 50%; animation: tts-spin 0.8s linear infinite;
        `;
        const icon = document.createElement('span');
        icon.className = 'tts-icon';
        icon.textContent = '⏳';
        icon.style.cssText = `
            display: inline-flex; align-items: center; justify-content: center;
            font-size: 0.7rem; line-height: 1; pointer-events: none; margin-right: 6px;
        `;
        const label = document.createElement('span');
        label.className = 'tts-label';
        label.textContent = '生成中...';

        capsule.appendChild(spinner);
        capsule.appendChild(icon);
        capsule.appendChild(label);
        bubble.appendChild(capsule);
    }, 50);

    // 加入有序队列（串行处理）
    enqueueTTS(msg, msgEl).then(success => {
        if (!success) {
            // 生成失败：更新为错误胶囊，可点击重试
            setTimeout(() => {
                const bubble = msgEl.querySelector('.bubble');
                if (!bubble) return;
                const capsule = bubble.querySelector('.tts-capsule');
                if (capsule && capsule.dataset.status === 'generating') {
                    capsule.dataset.status = 'error';
                    const icon = capsule.querySelector('.tts-icon');
                    const label = capsule.querySelector('.tts-label');
                    const spinner = capsule.querySelector('.tts-spinner');
                    if (spinner) spinner.style.display = 'none';
                    if (icon) icon.textContent = '🔇';
                    if (label) label.textContent = '语音生成失败 · 点击重试';
                    capsule.disabled = false;
                    capsule.style.cursor = 'pointer';
                    capsule.onclick = function() {
                        capsule.remove();
                        App.attachAudioToBubble(msgEl, msg);
                    };
                }
            }, 100);
        }
    });
}

// ===== 刷新后重建音频控件（从 Cache API 恢复）=====
App.restoreAudioControls = function() {
    rpLog('info', 'TTS', `开始重建音频控件，共 ${state.messages.length} 条消息`);

    // 收集需要重建的消息（角色消息 + 场景旁白）
    const msgsToRestore = [];
    for (const msg of state.messages) {
        if (msg.role !== 'char' || msg.type === 'image') continue;
        if (msg._played !== true) continue;

        // 查找对应的 DOM 元素
        const msgEl = document.querySelector(`[data-msg-id="${msg.id}"]`);
        if (!msgEl) continue;

        // 跳过已有音频胶囊的
        if (msgEl.querySelector('.tts-capsule')) continue;

        // 场景旁白：即使没有持久化 meta 也尝试重建（用当前 narrationSettings）
        if (msg.isScene) {
            if (!msg.content || msg.content.length < 2) continue;
            msgsToRestore.push({ msg, msgEl, isNarration: true });
            continue;
        }

        // 角色消息：检查是否有持久化的 TTS 参数
        if (!msg._ttsText || !msg._ttsVoice) continue;
        msgsToRestore.push({ msg, msgEl, isNarration: false });
    }

    rpLog('info', 'TTS', `找到 ${msgsToRestore.length} 条需要重建的音频控件`);

    // 用队列串行重建，避免并发请求过多
    let idx = 0;
    function restoreNext() {
        if (idx >= msgsToRestore.length) {
            rpLog('info', 'TTS', `全部重建完成`);
            return;
        }
        const { msg, msgEl, isNarration } = msgsToRestore[idx++];
        msg._isRestoring = true;

        if (isNarration) {
            // 旁白重建：使用当前 narrationSettings 的 rate
            App.generateNarrationTTS(msg.content || '')
                .then(audioResult => {
                    if (!audioResult || audioResult.type !== 'arraybuffer') {
                        rpLog('info', 'TTS', `旁白重建失败 msgId=${msg.id} (无音频)`);
                        return;
                    }
                    const bubble = msgEl.querySelector('.bubble');
                    if (!bubble || bubble.querySelector('.tts-capsule')) return;
                    insertAudioIntoBubble(msgEl, audioResult, msg);
                })
                .catch(e => {
                    rpLog('info', 'TTS', `旁白重建异常 msgId=${msg.id}: ${e.message}`);
                })
                .finally(() => {
                    setTimeout(restoreNext, 200);
                });
        } else {
            const params = {
                text: msg._ttsText,
                voice: msg._ttsVoice,
                rate: msg._ttsRate || '+0%',
                pitch: msg._ttsPitch || '+0Hz',
                volume: msg._ttsVolume || '+0%'
            };

            App.generateTTS(params.text, params.voice, params.rate, params.volume, params.pitch)
                .then(audioResult => {
                    if (!audioResult || audioResult.type !== 'arraybuffer') {
                        rpLog('info', 'TTS', `重建失败 msgId=${msg.id} (无音频)`);
                        return;
                    }
                    const bubble = msgEl.querySelector('.bubble');
                    if (!bubble || bubble.querySelector('.tts-capsule')) return;

                    // 复用 insertAudioIntoBubble 创建胶囊按钮
                    insertAudioIntoBubble(msgEl, audioResult, msg);
                })
                .catch(e => {
                    rpLog('info', 'TTS', `重建异常 msgId=${msg.id}: ${e.message}`);
                })
                .finally(() => {
                    // 间隔 200ms 后重建下一条
                    setTimeout(restoreNext, 200);
                });
        }
    }
    restoreNext();
}

// ===== 音色选择器 UI =====
App.renderVoiceSelector = function(selectEl, selectedVoice, onChange) {
    if (!selectEl) return;

    selectEl.innerHTML = '';

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
    rpLog('info', 'TTS', ttsEnabled ? 'TTS 已开启' : 'TTS 已关闭');
    return ttsEnabled;
}

App.isTTSEnabled = function() {
    return ttsEnabled;
}

// ===== 清理所有 TTS blob URL（防止内存泄漏）=====
App.clearTTSBlobUrls = function() {
    state.messages.forEach(msg => {
        if (msg._audioBlobUrl) {
            URL.revokeObjectURL(msg._audioBlobUrl);
            msg._audioBlobUrl = null;
        }
    });
}
