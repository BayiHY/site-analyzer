// ========== 虚拟钢琴键盘 ==========
const PIANO_START_NOTE = 36; // C2
const PIANO_END_NOTE = 96;   // C7 (5个八度)
let pianoContext = null;
const activeOscillators = new Map(); // noteNumber -> {osc, gain, startTime}
const touchToNote = new Map(); // touchId -> noteNumber

// 触摸拖动相关
const touchStartState = new Map(); // touchId -> {x, y, startTime, noteNumber, triggered, isDragging}
const DRAG_THRESHOLD = 50; // 拖动阈值（像素）- 增大以避免多指触控误判
const DRAG_TIME_THRESHOLD = 300; // 拖动时间阈值（毫秒）- 按下多久后才允许判定为拖动

function initPiano() {
    const piano = document.getElementById('piano');
    piano.innerHTML = '';
    
    // 如果已有 pianoContext 则复用，否则创建
    if (!pianoContext) {
        pianoContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // 确保 AudioContext 处于运行状态
    if (pianoContext.state === 'suspended') {
        pianoContext.resume();
    }
    
    // 创建5个八度
    const numOctaves = Math.ceil((PIANO_END_NOTE - PIANO_START_NOTE) / 12);
    for (let octave = 0; octave < numOctaves; octave++) {
        const octaveDiv = document.createElement('div');
        octaveDiv.className = 'piano-octave';
        
        const baseNote = PIANO_START_NOTE + octave * 12;
        
        // 7个白键: C, D, E, F, G, A, B
        const whiteNotes = [0, 2, 4, 5, 7, 9, 11];
        whiteNotes.forEach((offset, i) => {
            const key = document.createElement('div');
            key.className = 'white-key';
            key.dataset.note = baseNote + offset;
            
            // 添加音符标签
            const label = document.createElement('span');
            label.className = 'key-label';
            const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
            label.textContent = noteNames[i] + (3 + octave);
            key.appendChild(label);
            
            // 鼠标事件
            key.addEventListener('mousedown', (e) => {
                e.preventDefault();
                startPianoKey(baseNote + offset);
            });
            key.addEventListener('mouseup', () => stopPianoKey(baseNote + offset));
            key.addEventListener('mouseleave', () => {
                if (activeOscillators.has(baseNote + offset)) {
                    stopPianoKey(baseNote + offset);
                }
            });
            
            // 触摸事件（支持多点触控和拖动）
            key.addEventListener('touchstart', (e) => {
                console.log(`[触摸] touchstart, changedTouches: ${e.changedTouches.length}, 键: ${baseNote + offset}`);
                
                // 处理所有新触摸点
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const noteNumber = baseNote + offset;
                    
                    console.log(`[触摸] 处理触摸点 ${i}, identifier: ${touch.identifier}, 音符: ${noteNumber}`);
                    
                    // 记录触摸起始状态
                    touchStartState.set(touch.identifier, {
                        x: touch.clientX,
                        y: touch.clientY,
                        startTime: Date.now(),
                        noteNumber: noteNumber,
                        triggered: true,  // 立即标记为触发
                        isDragging: false  // 是否变成拖动
                    });
                    
                    touchToNote.set(touch.identifier, noteNumber);
                    startPianoKey(noteNumber);
                }
                
                console.log(`[触摸] 当前活跃振荡器数量: ${activeOscillators.size}`);
            }, {passive: true});  // 改为 passive，允许滚动
            
            key.addEventListener('touchmove', (e) => {
                // 处理所有移动的触摸点
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const state = touchStartState.get(touch.identifier);
                    
                    if (state && !state.isDragging) {
                        // 检查是否超过时间阈值（按下 300ms 后才允许判定为拖动）
                        const elapsed = Date.now() - state.startTime;
                        if (elapsed < DRAG_TIME_THRESHOLD) {
                            continue;  // 时间未到，不判定为拖动
                        }
                        
                        const dx = touch.clientX - state.x;
                        const dy = touch.clientY - state.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        // 如果移动超过阈值，标记为拖动，停止音符
                        if (distance > DRAG_THRESHOLD) {
                            state.isDragging = true;
                            // 停止当前音符
                            stopPianoKey(state.noteNumber);
                            touchToNote.delete(touch.identifier);
                            activeOscillators.delete(state.noteNumber);
                            unhighlightKey(state.noteNumber);
                        }
                    }
                }
            }, {passive: true});
            
            key.addEventListener('touchend', (e) => {
                // 处理所有结束的触摸点
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const state = touchStartState.get(touch.identifier);
                    
                    if (state) {
                        // 如果不是拖动（即正常点击），停止音符
                        if (!state.isDragging && state.triggered) {
                            const note = touchToNote.get(touch.identifier);
                            if (note !== undefined) {
                                stopPianoKey(note);
                                touchToNote.delete(touch.identifier);
                            }
                        }
                        touchStartState.delete(touch.identifier);
                    }
                }
            }, {passive: true});
            
            // 触摸取消（例如手指滑出屏幕）
            key.addEventListener('touchcancel', (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const state = touchStartState.get(touch.identifier);
                    
                    if (state && !state.isDragging) {
                        const note = touchToNote.get(touch.identifier);
                        if (note !== undefined) {
                            stopPianoKey(note);
                            touchToNote.delete(touch.identifier);
                        }
                    }
                    touchStartState.delete(touch.identifier);
                }
            }, {passive: true});
            
            octaveDiv.appendChild(key);
        });
        
        // 5个黑键: C#, D#, F#, G#, A#
        const blackNotes = [1, 3, 6, 8, 10];
        blackNotes.forEach(offset => {
            const key = document.createElement('div');
            key.className = 'black-key';
            key.dataset.note = baseNote + offset;
            
            // 鼠标事件
            key.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startPianoKey(baseNote + offset);
            });
            key.addEventListener('mouseup', () => stopPianoKey(baseNote + offset));
            key.addEventListener('mouseleave', () => {
                if (activeOscillators.has(baseNote + offset)) {
                    stopPianoKey(baseNote + offset);
                }
            });
            
            // 触摸事件（支持多点触控和拖动）
            key.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                const touch = e.changedTouches[0];
                const noteNumber = baseNote + offset;
                
                // 记录触摸起始状态
                touchStartState.set(touch.identifier, {
                    x: touch.clientX,
                    y: touch.clientY,
                    startTime: Date.now(),
                    noteNumber: noteNumber,
                    triggered: true,
                    isDragging: false
                });
                
                touchToNote.set(touch.identifier, noteNumber);
                startPianoKey(noteNumber);
            }, {passive: true});
            
            key.addEventListener('touchmove', (e) => {
                e.stopPropagation();
                // 处理所有移动的触摸点
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const state = touchStartState.get(touch.identifier);
                    
                    if (state && !state.isDragging) {
                        // 检查是否超过时间阈值
                        const elapsed = Date.now() - state.startTime;
                        if (elapsed < DRAG_TIME_THRESHOLD) {
                            continue;
                        }
                        
                        const dx = touch.clientX - state.x;
                        const dy = touch.clientY - state.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance > DRAG_THRESHOLD) {
                            state.isDragging = true;
                            stopPianoKey(state.noteNumber);
                            touchToNote.delete(touch.identifier);
                            activeOscillators.delete(state.noteNumber);
                            unhighlightKey(state.noteNumber);
                        }
                    }
                }
            }, {passive: true});
            
            key.addEventListener('touchend', (e) => {
                e.stopPropagation();
                // 处理所有结束的触摸点
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const state = touchStartState.get(touch.identifier);
                    
                    if (state) {
                        if (!state.isDragging && state.triggered) {
                            const note = touchToNote.get(touch.identifier);
                            if (note !== undefined) {
                                stopPianoKey(note);
                                touchToNote.delete(touch.identifier);
                            }
                        }
                        touchStartState.delete(touch.identifier);
                    }
                }
            }, {passive: true});
            
            // 触摸取消
            key.addEventListener('touchcancel', (e) => {
                e.stopPropagation();
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const state = touchStartState.get(touch.identifier);
                    
                    if (state && !state.isDragging) {
                        const note = touchToNote.get(touch.identifier);
                        if (note !== undefined) {
                            stopPianoKey(note);
                            touchToNote.delete(touch.identifier);
                        }
                    }
                    touchStartState.delete(touch.identifier);
                }
            }, {passive: true});
            octaveDiv.appendChild(key);
        });
        
        piano.appendChild(octaveDiv);
    }
    
    // 滚动到中央C（C4）居中显示
    const scrollArea = document.getElementById('pianoScrollArea');
    if (scrollArea) {
        // 添加鼠标拖动滚动功能
        let isDragging = false;
        let startX = 0;
        let scrollLeft = 0;
        
        scrollArea.addEventListener('mousedown', (e) => {
            // 只在空白区域（非按键）启用拖动
            if (e.target === scrollArea || e.target.classList.contains('piano')) {
                isDragging = true;
                startX = e.pageX - scrollArea.offsetLeft;
                scrollLeft = scrollArea.scrollLeft;
                scrollArea.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });
        
        scrollArea.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - scrollArea.offsetLeft;
            const walk = (x - startX) * 1.5; // 拖动速度倍数
            scrollArea.scrollLeft = scrollLeft - walk;
        });
        
        scrollArea.addEventListener('mouseup', () => {
            isDragging = false;
            scrollArea.style.cursor = 'grab';
        });
        
        scrollArea.addEventListener('mouseleave', () => {
            isDragging = false;
            scrollArea.style.cursor = 'grab';
        });
        
        scrollArea.style.cursor = 'grab';
        
        // 计算C4的位置并滚动到居中
        // C4 是第几个八度：C2(0), C3(1), C4(2)
        const c4OctaveIndex = (60 - PIANO_START_NOTE) / 12; // 60 = MIDI C4
        const octaveWidth = 252; // 每个八度宽度 = 7白键 × 36px
        const c4Position = c4OctaveIndex * octaveWidth;
        
        // 延迟执行，等待DOM渲染完成
        setTimeout(() => {
            const containerWidth = scrollArea.clientWidth;
            // 让C4八度的中心对齐容器中心
            const scrollTo = c4Position + (octaveWidth / 2) - (containerWidth / 2);
            scrollArea.scrollLeft = Math.max(0, scrollTo);
        }, 100);
    }
}

function startPianoKey(noteNumber) {
    // 如果已经在发声，先停止
    if (activeOscillators.has(noteNumber)) {
        stopPianoKey(noteNumber);
    }
    
    const freq = 440 * Math.pow(2, (noteNumber - 69) / 12);
    const now = pianoContext.currentTime;
    
    // 钢琴音色：加法合成 + ADSR 包络
    const harmonics = [
        { ratio: 1.0,  gain: 1.0,   type: 'triangle' },  // 基频
        { ratio: 2.0,  gain: 0.6,   type: 'sine' },      // 2次谐波（较强）
        { ratio: 3.0,  gain: 0.3,   type: 'sine' },      // 3次谐波
        { ratio: 4.0,  gain: 0.15,  type: 'sine' },      // 4次谐波
        { ratio: 5.0,  gain: 0.08,  type: 'sine' },      // 5次谐波
        { ratio: 6.0,  gain: 0.05,  type: 'sine' },      // 6次谐波
    ];
    
    // ADSR 包络参数
    const attack = 0.005;   // 音头（5ms）
    const decay = 0.3;      // 衰减（300ms）
    const sustain = 0.4;    // 保持电平
    const peakGain = 0.5;   // 峰值音量
    
    const masterGain = pianoContext.createGain();
    masterGain.connect(pianoContext.destination);
    masterGain.gain.setValueAtTime(0, now);
    
    // ADSR 包络
    masterGain.gain.linearRampToValueAtTime(peakGain, now + attack);
    masterGain.gain.exponentialRampToValueAtTime(peakGain * sustain, now + attack + decay);
    
    const oscillators = [];
    
    // 创建每个谐波
    harmonics.forEach(h => {
        const osc = pianoContext.createOscillator();
        const gain = pianoContext.createGain();
        
        osc.type = h.type;
        osc.frequency.value = freq * h.ratio;
        
        // 添加轻微的频率抖动，模拟真实钢琴的不完美性
        osc.detune.value = (Math.random() - 0.5) * 2; // ±1 cent
        
        gain.gain.value = h.gain;
        
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        
        oscillators.push({ osc, gain });
    });
    
    // 记录活跃的振荡器（使用 audioContext 时间或 performance.now）
    const startTime = (audioContext && isRecording) 
        ? audioContext.currentTime - recordStartTime 
        : performance.now() / 1000;
    
    activeOscillators.set(noteNumber, {
        oscillators: oscillators,
        masterGain: masterGain,
        startTime: startTime
    });
    
    // 如果正在录制，记录按下时间
    if (isRecording && pitchDetector) {
        const noteName = pitchDetector.midiToNote(noteNumber);
        keyboardNotesOn.set(noteNumber, {
            startTime: startTime,
            noteName: noteName
        });
        
        // 显示录制状态
        statusDot.classList.add('midi');
        
        console.log('[虚拟键盘] 按下:', noteName, 'startTime:', startTime.toFixed(3), 'recordStartTime:', recordStartTime.toFixed(3));
    } else {
        console.log('[虚拟键盘] 未录制或无pitchDetector', {isRecording, pitchDetector: !!pitchDetector});
    }
    
    // 高亮按键
    highlightKey(noteNumber);
    
    // 更新显示
    if (pitchDetector) {
        currentNoteEl.textContent = pitchDetector.midiToNote(noteNumber);
    } else {
        currentNoteEl.textContent = `Note ${noteNumber}`;
    }
    currentFreqEl.textContent = `MIDI ${noteNumber} | 虚拟键盘`;
}

// 处理待处理的音符队列（分组和弦）
function processPendingNotes() {
    if (pendingNotes.length === 0) return;
    
    // 按 startTime 排序
    pendingNotes.sort((a, b) => a.startTime - b.startTime);
    
    // 分组和弦：startTime 相差 < 50ms 的音符为一组
    const groups = [];
    let currentGroup = [pendingNotes[0]];
    
    for (let i = 1; i < pendingNotes.length; i++) {
        const note = pendingNotes[i];
        const prevNote = pendingNotes[i - 1];  // ✅ 与前一个音符比较
        
        // 如果 startTime 与前一个音符相差 < 50ms，加入当前组
        if (note.startTime - prevNote.startTime < 0.05) {
            currentGroup.push(note);
        } else {
            // 否则开始新组
            groups.push(currentGroup);
            currentGroup = [note];
        }
    }
    groups.push(currentGroup);
    
    // 标记并添加到 recordedNotes
    groups.forEach(group => {
        const isChord = group.length > 1;
        group.forEach(note => {
            note.isChord = isChord;
            recordedNotes.push(note);
        });
    });
    
    pendingNotes = [];
    displayNotes();
}

function stopPianoKey(noteNumber) {
    const active = activeOscillators.get(noteNumber);
    if (!active) return;
    
    // 渐出效果（避免爆音）
    const stopTime = pianoContext.currentTime + 0.15;
    active.masterGain.gain.exponentialRampToValueAtTime(0.001, stopTime);
    
    // 停止所有振荡器
    active.oscillators.forEach(({ osc }) => {
        osc.stop(stopTime);
    });
    
    activeOscillators.delete(noteNumber);
    
    // 取消高亮
    unhighlightKey(noteNumber);
    
    // 如果正在录制，加入待处理队列
    const keyNote = keyboardNotesOn.get(noteNumber);
    console.log('[虚拟键盘] 松开:', noteNumber, {isRecording, pitchDetector: !!pitchDetector, keyNote: keyNote ? 'found' : 'not found'});
    
    if (isRecording && pitchDetector && keyNote) {
        // 使用相同的时间基准
        const now = (audioContext && isRecording) 
            ? audioContext.currentTime - recordStartTime 
            : performance.now() / 1000;
        const duration = now - keyNote.startTime;
        
        const minDur = parseFloat(document.getElementById('minDuration').value);
        
        console.log('[虚拟键盘] 时长:', duration.toFixed(3), '最小:', minDur, '通过:', duration >= minDur);
        
        if (duration >= minDur) {
            pendingNotes.push({
                midiNote: noteNumber,
                noteName: keyNote.noteName,
                startTime: keyNote.startTime,
                duration: duration,
                fromKeyboard: true
            });
            
            keyboardNotesOn.delete(noteNumber);
            
            console.log('[虚拟键盘] 添加到 pendingNotes, 当前队列:', pendingNotes.length);
            
            // 如果没有其他按键正在播放，立即处理队列
            if (activeOscillators.size === 0) {
                processPendingNotes();
            }
        }
    }
    
    // 更新显示
    if (activeOscillators.size === 0) {
        currentNoteEl.textContent = '--';
        currentFreqEl.textContent = '等待输入...';
        statusDot.classList.remove('midi');
    } else {
        // 显示最后一个按下的键
        const lastKey = Array.from(activeOscillators.keys()).pop();
        if (pitchDetector) {
            currentNoteEl.textContent = pitchDetector.midiToNote(lastKey);
        }
        currentFreqEl.textContent = `MIDI ${lastKey} | ${activeOscillators.size} 键同时按`;
    }
}

function highlightKey(noteNumber, duration = 0) {
    const key = document.querySelector(`[data-note="${noteNumber}"]`);
    if (key) {
        key.classList.add('active');
        if (duration > 0) {
            setTimeout(() => key.classList.remove('active'), duration);
        }
    }
}

function unhighlightKey(noteNumber) {
    const key = document.querySelector(`[data-note="${noteNumber}"]`);
    if (key) {
        key.classList.remove('active');
    }
}

