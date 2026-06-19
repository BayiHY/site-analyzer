function handleMIDIMessage(event) {
    if (!isRecording || inputMode !== 'midi') return;
    
    const [status, noteNumber, velocity] = event.data;
    const command = status >> 4;
    
    // Note On (0x9) with velocity > 0
    if (command === 9 && velocity > 0) {
        const noteName = pitchDetector ? pitchDetector.midiToNote(noteNumber) : `Note ${noteNumber}`;
        
        // 显示当前音符
        currentNoteEl.textContent = noteName;
        currentFreqEl.textContent = `MIDI ${noteNumber} | Vel ${velocity}`;
        
        // 记录开始时间
        midiNotesOn.set(noteNumber, {
            startTime: audioContext.currentTime - recordStartTime,
            noteName: noteName
        });
        
        // 高亮状态和虚拟键盘
        statusDot.classList.add('midi');
        highlightKey(noteNumber);
        
    // Note Off (0x8) or Note On with velocity 0
    } else if (command === 8 || (command === 9 && velocity === 0)) {
        const noteInfo = midiNotesOn.get(noteNumber);
        if (noteInfo) {
            const duration = (audioContext.currentTime - recordStartTime) - noteInfo.startTime;
            const minDur = parseFloat(document.getElementById('minDuration').value);
            
            if (duration >= minDur) {
                recordedNotes.push({
                    midiNote: noteNumber,
                    noteName: noteInfo.noteName,
                    startTime: noteInfo.startTime,
                    duration: duration,
                    fromKeyboard: true
                });
                displayNotes();
            }
            
            midiNotesOn.delete(noteNumber);
        }
        
        // 取消虚拟键盘高亮
        unhighlightKey(noteNumber);
        
        // 如果没有按着的键，取消高亮
        if (midiNotesOn.size === 0) {
            statusDot.classList.remove('midi');
            currentNoteEl.textContent = '--';
            currentFreqEl.textContent = '等待按键...';
        }
    }
}

