// === 声线去重分配器 ===
// 为角色分配 Edge TTS 语音，确保不重复

/**
 * 声线去重分配
 * @param {Array} characters - state.characters 数组
 * @param {object} TTS_VOICES - TTS 语音映射表
 */
export function allocateVoices(characters, TTS_VOICES) {
    const allVoicesByGender = {
        '女': ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural'],
        '男': ['zh-CN-YunxiNeural', 'zh-CN-YunjianNeural', 'zh-CN-YunxiaNeural', 'zh-CN-YunyangNeural']
    };
    const usedVoices = new Set();
    const voiceIndexByGender = { '女': 0, '男': 0 };

    // 第一轮：保留 LLM 已分配的声线
    for (const char of characters) {
        if (char.voice && TTS_VOICES[char.voice]) {
            usedVoices.add(char.voice);
        }
    }

    // 第二轮：为未分配声线的角色轮询选取
    for (const char of characters) {
        if (!char.voice || !TTS_VOICES[char.voice]) {
            const gender = char.gender === '男' ? '男' : '女';
            const pool = allVoicesByGender[gender] || allVoicesByGender['女'];
            const idx = voiceIndexByGender[gender] || 0;
            let assigned = false;
            for (let i = 0; i < pool.length; i++) {
                const candidate = pool[(idx + i) % pool.length];
                if (!usedVoices.has(candidate)) {
                    char.voice = candidate;
                    usedVoices.add(candidate);
                    voiceIndexByGender[gender] = ((idx + i) % pool.length) + 1;
                    assigned = true;
                    break;
                }
            }
            // 如果所有声线都已用尽，允许重复
            if (!assigned) {
                char.voice = pool[idx % pool.length];
                voiceIndexByGender[gender] = (idx + 1) % pool.length;
            }
        }
    }
}
