class MIDIWriter {
    constructor() {
        this.notes = [];
        this.tempo = 120; // BPM
    }
    
    addNote(midiNote, startTime, duration) {
        this.notes.push({ midiNote, startTime, duration });
    }
    
    generate() {
        const ticksPerBeat = 480;
        const ticksPerSecond = (ticksPerBeat * this.tempo) / 60;
        
        // MIDI文件头
        const header = [
            0x4D, 0x54, 0x68, 0x64, // "MThd"
            0x00, 0x00, 0x00, 0x06, // 头长度
            0x00, 0x00, // 格式0
            0x00, 0x01, // 音轨数
            (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF // ticks per beat
        ];
        
        // 音轨事件
        const events = [];
        events.push([0, 0xC0, 0]); // 程序变更：钢琴
        
        for (const note of this.notes) {
            const startTick = Math.floor(note.startTime * ticksPerSecond);
            const durationTicks = Math.floor(note.duration * ticksPerSecond);
            
            events.push([startTick, 0x90, note.midiNote, 80]); // Note On
            events.push([startTick + durationTicks, 0x80, note.midiNote, 0]); // Note Off
        }
        
        // 排序事件
        events.sort((a, b) => a[0] - b[0]);
        
        // 转换为Delta Time
        const trackData = [];
        let lastTick = 0;
        for (const event of events) {
            const delta = event[0] - lastTick;
            trackData.push(...this.toVariableLength(delta));
            trackData.push(event[1], event[2], event[3] || 0);
            lastTick = event[0];
        }
        
        // 结束事件
        trackData.push(0x00, 0xFF, 0x2F, 0x00);
        
        // 音轨头
        const trackHeader = [
            0x4D, 0x54, 0x72, 0x6B, // "MTrk"
            (trackData.length >> 24) & 0xFF,
            (trackData.length >> 16) & 0xFF,
            (trackData.length >> 8) & 0xFF,
            trackData.length & 0xFF
        ];
        
        return new Uint8Array([...header, ...trackHeader, ...trackData]);
    }
    
    toVariableLength(value) {
        const bytes = [];
        bytes.push(value & 0x7F);
        value >>= 7;
        while (value > 0) {
            bytes.unshift((value & 0x7F) | 0x80);
            value >>= 7;
        }
        return bytes;
    }
}

