// === 声线分配器 ===
// 角色定义中已包含 ttsPitch/ttsRate，此函数只做兜底校验

/**
 * 声线校验（不再做轮询分配）
 * @param {Array} characters - state.characters 数组
 */
export function allocateVoices(characters) {
    // 统一女声使用 Xiaoyi，男声使用 Yunxi（LLM 已按 prompt 输出）
    const DEFAULT_VOICE_BY_GENDER = { '女': 'zh-CN-XiaoyiNeural', '男': 'zh-CN-YunxiNeural' };
    
    // 合法 pitch 值集合
    const VALID_PITCHES = ['-15Hz','-10Hz','-8Hz','-5Hz','0Hz','+5Hz','+10Hz','+12Hz','+15Hz'];
    // 合法 rate 值集合
    const VALID_RATES = ['-15%','-10%','-5%','0%','+5%','+10%','+15%'];

    for (const char of characters) {
        // voice: 兜底
        if (!char.voice) {
            char.voice = DEFAULT_VOICE_BY_GENDER[char.gender] || DEFAULT_VOICE_BY_GENDER['女'];
        }
        
        // ttsPitch: 兜底 + 校验
        if (!char.ttsPitch || !VALID_PITCHES.includes(char.ttsPitch)) {
            // 根据性别给默认 pitch
            char.ttsPitch = char.gender === '男' ? '-10Hz' : '0Hz';
        }
        
        // ttsRate: 兜底 + 校验
        if (!char.ttsRate || !VALID_RATES.includes(char.ttsRate)) {
            char.ttsRate = char.gender === '男' ? '-5%' : '+5%';
        }
    }
}
