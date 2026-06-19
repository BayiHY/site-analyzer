// ========== 录音控制 ==========
async function startRecording() {
    try {
        recordStartTime = 0;
        recordedNotes = [];
        midiNotesOn.clear();
        
        if (inputMode === 'midi') {
            // MIDI键盘模式
            const selectedDeviceId = document.getElementById('midiDeviceSelect').value;
            if (!selectedDeviceId) {
                alert('请先选择MIDI设备或虚拟键盘');
                return;
            }
            
            // 初始化AudioContext（用于时间戳）
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            pitchDetector = new PitchDetector(audioContext.sampleRate);
            
            // 检查是否选择虚拟键盘
            if (selectedDeviceId === 'virtual-keyboard') {
                // 虚拟键盘模式：复用 pianoContext 作为 audioContext
                // 确保 pianoContext 存在且处于运行状态
                if (!pianoContext) {
                    pianoContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (pianoContext.state === 'suspended') {
                    await pianoContext.resume();
                }
                
                // 复用 pianoContext
                audioContext = pianoContext;
                pitchDetector = new PitchDetector(audioContext.sampleRate);
                
                isRecording = true;
                recordStartTime = audioContext.currentTime;
                
                startBtn.disabled = true;
                stopBtn.disabled = false;
                clearBtn.disabled = true;
                statusDot.classList.add('ready');
                statusText.textContent = '虚拟键盘录制中（点击钢琴键）...';
                
            } else {
                // 物理MIDI设备模式
                if (!midiAccess) {
                    alert('MIDI API 未初始化，请刷新页面重试');
                    return;
                }
                
                midiInput = midiAccess.inputs.get(selectedDeviceId);
                if (!midiInput) {
                    alert('无法连接MIDI设备');
                    return;
                }
                
                midiInput.onmidimessage = handleMIDIMessage;
                
                isRecording = true;
                recordStartTime = audioContext.currentTime;
                
                startBtn.disabled = true;
                stopBtn.disabled = false;
                clearBtn.disabled = true;
                statusDot.classList.add('ready');
                statusText.textContent = 'MIDI键盘录制中...';
            }
            
        } else if (inputMode === 'system') {
            // 系统内录模式
            // 检查浏览器支持
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                alert('您的浏览器不支持系统内录功能。\n\n请使用 Chrome 94+、Edge 94+ 或 Firefox 52+ 浏览器。\n\n注意：需要 HTTPS 或 localhost 环境。');
                return;
            }
            
            let displayStream;
            try {
                displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
            } catch (err) {
                if (err.name === 'NotAllowedError') {
                    alert('用户取消了屏幕共享选择。');
                } else if (err.name === 'NotSupportedError') {
                    alert('您的浏览器不支持音频捕获。\n\n请尝试更新浏览器或使用 Chrome/Edge。');
                } else {
                    alert('启动系统内录失败：' + err.message + '\n\n提示：系统内录需要 HTTPS 环境。');
                }
                console.error('getDisplayMedia error:', err);
                return;
            }
            
            // 检查是否有音频轨道
            const audioTracks = displayStream.getAudioTracks();
            if (audioTracks.length === 0) {
                displayStream.getTracks().forEach(t => t.stop());
                alert('未检测到系统音频轨道。\n\n请在选择共享窗口时：\n1. 勾选"共享音频"或"Share audio"选项\n2. Chrome: 点击"标签页"选项卡，勾选底部"共享此标签页的音频"\n3. Edge: 选择"浏览器标签页"后勾选"包含标签页音频"');
                return;
            }
            
            console.log('✅ 系统内录已启动，音频轨道:', audioTracks.map(t => t.label));
            
            // 创建音频上下文
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(displayStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            
            stream = displayStream;
            pitchDetector = new PitchDetector(audioContext.sampleRate);
            
            isRecording = true;
            currentNoteStart = null;
            lastDetectedMidi = null;
            
            startBtn.disabled = true;
            stopBtn.disabled = false;
            clearBtn.disabled = true;
            statusDot.classList.add('recording');
            statusText.textContent = '系统内录中...';
            
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            
            detect();
            
        } else {
            // 麦克风模式（原有逻辑）
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            
            pitchDetector = new PitchDetector(audioContext.sampleRate);
            
            isRecording = true;
            currentNoteStart = null;
            lastDetectedMidi = null;
            
            startBtn.disabled = true;
            stopBtn.disabled = false;
            clearBtn.disabled = true;
            statusDot.classList.add('recording');
            statusText.textContent = '正在录音...';
            
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            
            detect();
        }
        
    } catch (err) {
        alert('启动失败：' + err.message);
        console.error(err);
    }
}

function stopRecording() {
    isRecording = false;
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
    }
    
    if (midiInput) {
        midiInput.onmidimessage = null;
    }
    
    // 处理还在按着的MIDI键
    if (midiNotesOn.size > 0) {
        const now = audioContext.currentTime - recordStartTime;
        midiNotesOn.forEach((noteInfo, noteNumber) => {
            const duration = now - noteInfo.startTime;
            if (duration >= parseFloat(document.getElementById('minDuration').value)) {
                recordedNotes.push({
                    midiNote: noteNumber,
                    noteName: noteInfo.noteName,
                    startTime: noteInfo.startTime,
                    duration: duration,
                    fromKeyboard: true
                });
            }
        });
        midiNotesOn.clear();
    }
    
    if (audioContext) {
        // 麦克风/系统内录模式：保存最后一个音符
        if (inputMode !== 'midi' && currentNoteStart !== null && lastDetectedMidi !== null) {
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
    }
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    clearBtn.disabled = false;
    statusDot.classList.remove('recording', 'midi');
    statusDot.classList.add('ready');
    statusText.textContent = `录制完成，检测到 ${recordedNotes.length} 个音符`;
    
    displayNotes();
}

function clearRecording() {
    recordedNotes = [];
    midiNotesOn.clear();
    notesList.innerHTML = '';
    notesCard.style.display = 'none';
    currentNoteEl.textContent = '--';
    currentFreqEl.textContent = '等待输入...';
    statusDot.classList.remove('ready');
    statusText.textContent = '选择输入源后开始';
    clearBtn.disabled = true;
}

