// === 声线分配器 ===
// 角色定义中已包含 ttsPitch/ttsRate，此函数只做兜底校验

/**
 * 声线校验（确保同性别无重复 pitch）
 * @param {Array} characters - state.characters 数组
 */
export function allocateVoices(characters) {
    // 统一女声使用 Xiaoyi，男声使用 Yunxi（LLM 已按 prompt 输出）
    const DEFAULT_VOICE_BY_GENDER = { '女': 'zh-CN-XiaoyiNeural', '男': 'zh-CN-YunxiNeural' };

    // pitch 范围 ±8Hz
    const MIN_PITCH = -8;
    const MAX_PITCH = 8;

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

        // ttsPitch: 如果 LLM 没填，随机分配 -2~+2
        if (!char.ttsPitch) {
            const base = randInt(-2, 2);
            char.ttsPitch = fmtPitch(base);
        } else {
            // 超出 ±8 钳位
            const pp = parsePitch(char.ttsPitch);
            if (pp < MIN_PITCH || pp > MAX_PITCH) {
                char.ttsPitch = fmtPitch(Math.round(Math.max(MIN_PITCH, Math.min(MAX_PITCH, pp))));
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

        // 收集已有的 pitch 值
        const usedPitches = new Set(chars.map(c => parsePitch(c.ttsPitch)));

        for (const char of chars) {
            const pp = parsePitch(char.ttsPitch);
            // 如果这个 pitch 被其他人用了，重新随机分配
            if (usedPitches.has(pp) && chars.length > 1) {
                // 找一个没用过的值
                let newPitch;
                let attempts = 0;
                do {
                    newPitch = randInt(MIN_PITCH, MAX_PITCH);
                    attempts++;
                } while (usedPitches.has(newPitch) && attempts < 50);

                // 如果 ±8 范围内全用完了，就在 ±1 微调
                if (attempts >= 50) {
                    for (let delta = 1; delta <= 2; delta++) {
                        for (const sign of [-1, 1]) {
                            newPitch = pp + (delta * sign);
                            if (newPitch >= MIN_PITCH && newPitch <= MAX_PITCH && !usedPitches.has(newPitch)) {
                                break;
                            }
                        }
                        if (newPitch !== pp) break;
                    }
                }

                char.ttsPitch = fmtPitch(newPitch);
                usedPitches.delete(pp);
                usedPitches.add(newPitch);
            }
        }
    }
}
