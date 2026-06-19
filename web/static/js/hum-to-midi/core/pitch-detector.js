// ========== 音高检测核心 ==========
class PitchDetector {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.MIN_FREQ = 60;   // 低音C2
        this.MAX_FREQ = 1200; // 高音D6
    }
    
    // 自相关算法检测音高
    detect(float32Buffer) {
        const SIZE = float32Buffer.length;
        const MAX_PERIOD = Math.floor(this.sampleRate / this.MIN_FREQ);
        const MIN_PERIOD = Math.floor(this.sampleRate / this.MAX_FREQ);
        
        // 计算自相关
        const correlations = new Float32Array(MAX_PERIOD + 1);
        for (let lag = MIN_PERIOD; lag <= MAX_PERIOD; lag++) {
            let sum = 0;
            for (let i = 0; i < SIZE - lag; i++) {
                sum += float32Buffer[i] * float32Buffer[i + lag];
            }
            correlations[lag] = sum;
        }
        
        // 找最大相关峰值
        let maxCorr = -1;
        let maxLag = -1;
        for (let lag = MIN_PERIOD; lag <= MAX_PERIOD; lag++) {
            if (correlations[lag] > maxCorr) {
                maxCorr = correlations[lag];
                maxLag = lag;
            }
        }
        
        if (maxLag < 0) return null;
        
        const freq = this.sampleRate / maxLag;
        
        // 验证相关性足够强
        const threshold = 0.01;
        if (maxCorr < threshold) return null;
        
        return freq;
    }
    
    // 频率转MIDI音符编号
    freqToMidi(freq) {
        return Math.round(12 * Math.log2(freq / 440) + 69);
    }
    
    // MIDI编号转音符名
    midiToNote(midi) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const note = notes[midi % 12];
        return `${note}${octave}`;
    }
}

