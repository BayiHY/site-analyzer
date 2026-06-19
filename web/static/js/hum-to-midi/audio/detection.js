// ========== 音高检测循环 ==========
function detect() {
    if (!isRecording) return;
    
    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);
    
    // 绘制波形
    drawWaveform(buffer);
    
    // 检测音高
    const sensitivity = document.getElementById('sensitivity').value;
    
    // 计算RMS判断是否有声音
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) {
        rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / buffer.length);
    
    if (rms > 0.01) { // 有声音输入
        const freq = pitchDetector.detect(buffer);
        
        if (freq && freq > pitchDetector.MIN_FREQ && freq < pitchDetector.MAX_FREQ) {
            const midi = pitchDetector.freqToMidi(freq);
            const noteName = pitchDetector.midiToNote(midi);
            
            currentNoteEl.textContent = noteName;
            currentFreqEl.textContent = `${freq.toFixed(1)} Hz | MIDI ${midi}`;
            
            // 音符变化检测
            if (lastDetectedMidi !== midi) {
                // 取消上一个键的高亮
                if (lastDetectedMidi !== null) {
                    unhighlightKey(lastDetectedMidi);
                }
                
                // 保存上一个音符
                if (currentNoteStart !== null && lastDetectedMidi !== null) {
                    const duration = audioContext.currentTime - currentNoteStart;
                    if (duration >= parseFloat(document.getElementById('minDuration').value)) {
                        recordedNotes.push({
                            midiNote: lastDetectedMidi,
                            noteName: lastDetectedNote,
                            startTime: currentNoteStart,
                            duration: duration
                        });
                    }
                }
                // 开始新音符
                currentNoteStart = audioContext.currentTime;
                lastDetectedMidi = midi;
                lastDetectedNote = noteName;
                
                // 高亮虚拟键盘
                highlightKey(midi);
            }
        }
    } else {
        currentNoteEl.textContent = '--';
        currentFreqEl.textContent = '等待声音...';
        
        // 静音时结束当前音符
        if (currentNoteStart !== null && lastDetectedMidi !== null) {
            const duration = audioContext.currentTime - currentNoteStart;
            if (duration >= parseFloat(document.getElementById('minDuration').value)) {
                recordedNotes.push({
                    midiNote: lastDetectedMidi,
                    noteName: lastDetectedNote,
                    startTime: currentNoteStart,
                    duration: duration
                });
            }
            // 取消高亮
            unhighlightKey(lastDetectedMidi);
            currentNoteStart = null;
            lastDetectedMidi = null;
        }
    }
    
    animationId = requestAnimationFrame(detect);
}

