function exportMIDI() {
    if (recordedNotes.length === 0) {
        alert('没有可导出的音符');
        return;
    }
    
    const midi = new MIDIWriter();
    for (const note of recordedNotes) {
        midi.addNote(note.midiNote, note.startTime, note.duration);
    }
    
    const data = midi.generate();
    const blob = new Blob([data], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `hum_${new Date().toISOString().slice(0,10)}.mid`;
    a.click();
    
    URL.revokeObjectURL(url);
}

function playNotes() {
    if (recordedNotes.length === 0) return;
    
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let currentTime = ctx.currentTime + 0.1; // 稍微延迟开始
    
    // 遍历音符，和弦同时播放
    let i = 0;
    while (i < recordedNotes.length) {
        const note = recordedNotes[i];
        
        if (note.isChord) {
            // 收集和弦的所有音符
            const chordNotes = [];
            while (i < recordedNotes.length && recordedNotes[i].isChord) {
                chordNotes.push(recordedNotes[i]);
                i++;
            }
            
            // 同时播放和弦音符
            chordNotes.forEach(n => {
                playNoteAt(ctx, n.midiNote, currentTime, n.duration);
            });
            
            // 和弦时长取最长的音符
            const maxDuration = Math.max(...chordNotes.map(n => n.duration));
            currentTime += maxDuration;
        } else {
            // 播放单音
            playNoteAt(ctx, note.midiNote, currentTime, note.duration);
            currentTime += note.duration;
            i++;
        }
    }
}

// 在指定时间播放单个音符（使用钢琴音色）
function playNoteAt(ctx, midiNote, startTime, duration) {
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    
    // 等响度补偿
    const loudnessCompensation = Math.pow(2, (60 - midiNote) / 24);
    
    // 钢琴音色：加法合成
    const harmonics = [
        { ratio: 1.0,   gain: 1.0,   type: 'triangle' },
        { ratio: 2.0,   gain: 0.5,   type: 'sine' },
        { ratio: 3.0,   gain: 0.25,  type: 'sine' },
        { ratio: 4.0,   gain: 0.125, type: 'sine' },
        { ratio: 5.0,   gain: 0.0625, type: 'sine' },
    ];
    
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.setValueAtTime(0.3 * loudnessCompensation, startTime);
    masterGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    
    harmonics.forEach(h => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = h.type;
        osc.frequency.value = freq * h.ratio;
        gain.gain.value = h.gain;
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
    });
}

