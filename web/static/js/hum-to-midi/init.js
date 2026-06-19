// ========== 事件绑定和初始化 ==========
// 绑定按钮事件
startBtn.onclick = startRecording;
stopBtn.onclick = stopRecording;
clearBtn.onclick = clearRecording;
exportBtn.onclick = exportMIDI;
playBtn.onclick = playNotes;

// 检查MIDI支持状态
if (navigator.requestMIDIAccess) {
    document.getElementById('midiStatus').textContent = '可用';
    document.getElementById('midiStatus').style.color = 'var(--success)';
} else {
    document.getElementById('midiStatus').textContent = '仅虚拟键盘';
    document.getElementById('midiStatus').style.color = 'var(--warning)';
}

// 检查系统内录支持
if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
    document.getElementById('systemStatus').textContent = '不支持';
    document.getElementById('systemStatus').style.color = 'var(--text-dim)';
    document.getElementById('modeSystem').style.opacity = '0.5';
    document.getElementById('modeSystem').style.cursor = 'not-allowed';
}

// 初始化虚拟钢琴
initPiano();

console.log('✅ Hum-to-MIDI 初始化完成');

