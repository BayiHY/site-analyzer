// === 声线分配器 ===
// 规则：
// 1. 每个性别组内，第一个角色锚定默认频率 +0Hz（不动）
// 2. 其他角色以锚点为参照，根据 LLM 输出的个人风格向上/下浮动，步长 8Hz，范围 ±40Hz
// 3. 同性别组内 pitch 严格去重（避免相同音色）
// 4. 若 LLM 未输出 pitch，则按序号分配递增偏移

/**
 * 声线校验与锚点分配
 * @param {Array} characters - state.characters 数组
 */
export function allocateVoices(characters) {
    // 统一女声使用 Xiaoyi，男声使用 Yunxi
    const DEFAULT_VOICE_BY_GENDER = { '女': 'zh-CN-XiaoyiNeural', '男': 'zh-CN-YunxiNeural' };

    // pitch 范围 ±40Hz，步长 8Hz
    const MIN_PITCH = -40;
    const MAX_PITCH = 40;
    const PITCH_STEP = 8;

    // 备选偏移序列（从近到远交替浮动，优先靠近锚点）
    const OFFSET_LADDER = [8, -8, 16, -16, 24, -24, 32, -32, 40, -40];

    // 格式化 pitch: -8 → "-8Hz", 0 → "+0Hz"
    function fmtPitch(v) {
        return (v >= 0 ? '+' : '') + v + 'Hz';
    }

    // 解析 pitch 数值
    function parsePitch(val) {
        if (!val) return 0;
        const n = parseFloat(String(val).replace('Hz', ''));
        return isNaN(n) ? 0 : n;
    }

    // 将任意 pitch 值吸附到最近的合法步长值 (±8 的倍数，钳位在 ±40)
    function snapPitch(v) {
        const snapped = Math.round(v / PITCH_STEP) * PITCH_STEP;
        return Math.max(MIN_PITCH, Math.min(MAX_PITCH, snapped));
    }

    // 第一步：voice / ttsRate 兜底 + pitch 吸附
    for (const char of characters) {
        if (!char.voice) {
            char.voice = DEFAULT_VOICE_BY_GENDER[char.gender] || DEFAULT_VOICE_BY_GENDER['女'];
        }
        if (!char.ttsRate) {
            char.ttsRate = char.gender === '男' ? '-5%' : '+5%';
        }
        // pitch 先吸附到合法步长（保留 LLM 意图的方向和强度）
        if (char.ttsPitch) {
            char.ttsPitch = fmtPitch(snapPitch(parsePitch(char.ttsPitch)));
        }
    }

    // 第二步：按性别分组，每组第一个角色锚定 +0Hz，其他角色相对浮动去重
    const byGender = {};
    for (const char of characters) {
        const g = char.gender || '女';
        if (!byGender[g]) byGender[g] = [];
        byGender[g].push(char);
    }

    for (const chars of Object.values(byGender)) {
        // 已占用的 pitch 值（用于去重）
        const used = new Set();

        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];

            // 第一个角色 → 锚定 +0Hz
            if (i === 0) {
                char.ttsPitch = fmtPitch(0);
                used.add(0);
                continue;
            }

            // 其他角色：优先使用 LLM 给出的偏移方向和大小
            const suggested = char.ttsPitch ? parsePitch(char.ttsPitch) : null;

            // 如果 LLM 建议值有效且未被占用，直接采用
            if (suggested !== null && suggested !== 0 && !used.has(suggested)) {
                char.ttsPitch = fmtPitch(suggested);
                used.add(suggested);
                continue;
            }

            // 否则按 OFFSET_LADDER 找第一个未使用的偏移
            // 若 LLM 建议了方向（比如 -8Hz 但被占），优先在同方向找更远的
            let pick = null;
            if (suggested !== null && suggested !== 0) {
                const sign = suggested < 0 ? -1 : 1;
                // 同方向递进
                for (let step = Math.abs(suggested); step <= MAX_PITCH; step += PITCH_STEP) {
                    const v = sign * step;
                    if (!used.has(v)) { pick = v; break; }
                }
                // 同方向找不到，退回反方向
                if (pick === null) {
                    for (let step = PITCH_STEP; step <= MAX_PITCH; step += PITCH_STEP) {
                        const v = -sign * step;
                        if (!used.has(v)) { pick = v; break; }
                    }
                }
            }

            // LLM 没建议：从 OFFSET_LADDER 按序取第一个未使用值
            if (pick === null) {
                for (const v of OFFSET_LADDER) {
                    if (!used.has(v)) { pick = v; break; }
                }
            }

            // 兜底：万一 82 个候选都用完（正常不会）
            if (pick === null) pick = 0;

            char.ttsPitch = fmtPitch(pick);
            used.add(pick);
        }
    }
}
