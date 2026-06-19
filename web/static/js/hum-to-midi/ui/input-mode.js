// ========== 输入模式管理 ==========
function setInputMode(mode) {
    // 检查系统内录是否可用
    if (mode === 'system') {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
            alert('系统内录不可用\n\n可能原因：\n1. 浏览器不支持（需要 Chrome 94+/Edge 94+）\n2. 非 HTTPS 环境\n3. 某些企业安全策略限制\n\n建议：使用麦克风模式代替，或尝试更新浏览器。');
            return;
        }
    }
    
    inputMode = mode;
    
    // 更新按钮状态
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('mode' + mode.charAt(0).toUpperCase() + mode.slice(1)).classList.add('active');
    
    // 更新开始按钮文字
    const btnTexts = {
        mic: '🎤 开始录音',
        system: '🖥️ 开始内录',
        midi: '🎹 开始录制'
    };
    startBtn.textContent = btnTexts[mode];
    
    // 显示/隐藏MIDI设备选择
    document.getElementById('midiDevicePanel').style.display = mode === 'midi' ? 'block' : 'none';
    
    // 如果切换到MIDI模式，初始化Web MIDI
    if (mode === 'midi') {
        initMIDI();
    }
}

