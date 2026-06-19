function displayNotes() {
    if (recordedNotes.length === 0) {
        notesCard.style.display = 'none';
        return;
    }
    
    notesCard.style.display = 'block';
    
    // 智能显示：和弦用方括号包裹，显示时长
    let html = '';
    let i = 0;
    while (i < recordedNotes.length) {
        const note = recordedNotes[i];
        if (note.isChord) {
            // 找到这个和弦的所有音符（连续的 isChord=true）
            const chordNotes = [];
            while (i < recordedNotes.length && recordedNotes[i].isChord) {
                chordNotes.push(recordedNotes[i]);
                i++;
            }
            // 和弦显示：[C4·E4·G4] 0.3s（使用最长时长）
            const maxDuration = Math.max(...chordNotes.map(n => n.duration));
            html += `<span class="midi-note chord" title="时长: ${maxDuration.toFixed(2)}s">${chordNotes.map(n => n.noteName).join('·')}</span>`;
            html += `<span class="note-duration">${maxDuration.toFixed(2)}s</span>`;
        } else {
            // 单音显示：C4 0.25s
            html += `<span class="midi-note ${note.fromKeyboard ? 'from-keyboard' : ''}" title="时长: ${note.duration.toFixed(2)}s">${note.noteName}</span>`;
            html += `<span class="note-duration">${note.duration.toFixed(2)}s</span>`;
            i++;
        }
    }
    notesList.innerHTML = html;
}

