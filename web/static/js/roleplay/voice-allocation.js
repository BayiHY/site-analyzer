// === 声线分配器 ===
// 角色定义中已包含 ttsPitch/ttsRate，此函数只做兜底校验

/**
 * 声线校验（确保同性别无重复 pitch）
 * @param {Array} characters - state.characters 数组
 */
export function allocateVoices(characters) {
    // 统一女声使用 Xiaoyi，男声使用 Yunxi（LLM 已按 prompt 输出）
    const DEFAULT_VOICE_BY_GENDER = { '女': 'zh-CN-XiaoyiNeural', '男': 'zh-CN-YunxiNeural' };

    // pitch 范围 ±40Hz，步长 8Hz
    const MIN_PITCH = -40;
    const MAX_PITCH = 40;
    const PITCH_STEP = 8;

    // 随机整数 [min, max]
    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 格式化 pitch: -5 → "-5Hz", +3 → "+3Hz"
    function fmtPitch(v) {
        return (v >= 0 ? '+' : '') + v + 'Hz';
    }

    // 解析 pitch 数值
    function parsePitch(val) {
        if (!val) return 0;
        const n = parseFloat(val.replace('Hz', ''));
        return isNaN(n) ? 0 : n;
    }

    // 第一步：处理每个角色的 pitch
    for (const char of characters) {
        // voice: 兜底
        if (!char.voice) {
            char.voice = DEFAULT_VOICE_BY_GENDER[char.gender] || DEFAULT_VOICE_BY_GENDER['女'];
        }

        // ttsPitch: 如果 LLM 没填，随机分配 -32~+32（步长 8）
        if (!char.ttsPitch) {
            const base = PITCH_STEP * (randInt(-4, 4));
            char.ttsPitch = fmtPitch(base);
        } else {
            // 超出 ±40 钳位
            const pp = parsePitch(char.ttsPitch);
            if (pp < MIN_PITCH || pp > MAX_PITCH) {
                // 钳位到最近的步长值
                const snapped = Math.round(pp / PITCH_STEP) * PITCH_STEP;
                char.ttsPitch = fmtPitch(Math.max(MIN_PITCH, Math.min(MAX_PITCH, snapped)));
            }
        }

        // ttsRate: 兜底
        if (!char.ttsRate) {
            char.ttsRate = char.gender === '男' ? '-5%' : '+5%';
        }
    }

    // 第二步：确保同性别内没有重复的 pitch 值
    const byGender = {};
    for (const char of characters) {
        const g = char.gender || '女';
        if (!byGender[g]) byGender[g] = [];
        byGender[g].push(char);
    }

    for (const [gender, chars] of Object.entries(byGender)) {
        if (chars.length <= 1) continue;

        // 统计每个 pitch 值出现的次数
        const pitchCount = {};
        for (const char of chars) {
            const pp = parsePitch(char.ttsPitch);
            pitchCount[pp] = (pitchCount[pp] || 0) + 1;
        }

        // 只对重复的 pitch 值进行去重
        for (const char of chars) {
            const pp = parsePitch(char.ttsPitch);
            if (pitchCount[pp] > 1) {
                // 这个 pitch 值有重复，需要重新分配
                let newPitch;
                let attempts = 0;
                do {
                    newPitch = PITCH_STEP * randInt(-5, 5);
                    attempts++;
                } while (Object.values(pitchCount).some(c => c > 1) && attempts < 50);

                char.ttsPitch = fmtPitch(newPitch);
                pitchCount[pp]--;
                pitchCount[newPitch] = (pitchCount[newPitch] || 0) + 1;
            }
        }
    }
}
