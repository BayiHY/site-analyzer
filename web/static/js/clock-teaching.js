// 钟表教具 JavaScript
class ClockTeaching {
    constructor() {
        this.isRealTime = true;
        this.isRunning = true;
        this.currentTime = new Date();
        this.manualTime = new Date();
        this.animationId = null;
        
        // 拖拽状态
        this.isDragging = false;
        this.dragTarget = null; // 'hour', 'minute', 'second'
        this.dragStartAngle = 0;
        this.dragStartTime = null;
        
        this.init();
    }
    
    init() {
        clockLog('info', 'INIT', '钟表教具初始化开始');
        this.createClockMarks();
        this.createClockNumbers();
        this.setupEventListeners();
        this.debugLayout();
        this.startClock();
        clockLog('info', 'INIT', '钟表教具初始化完成');
    }
    
    debugLayout() {
        // 诊断：打印所有关键布局坐标
        const container = document.querySelector('.clock-container');
        const face = document.querySelector('.clock-face');
        if (!container || !face) return;
        
        const cRect = container.getBoundingClientRect();
        const cx = cRect.width / 2;
        const cy = cRect.height / 2;
        
        const hHand = document.getElementById('hourHand');
        const mHand = document.getElementById('minuteHand');
        const sHand = document.getElementById('secondHand');
        
        // 用 getBoundingClientRect 获取实际渲染位置（calc() 表达式 style.* 读不到）
        const hRect = hHand.getBoundingClientRect();
        const mRect = mHand.getBoundingClientRect();
        const sRect = sHand.getBoundingClientRect();
        const faceRect = face.getBoundingClientRect();
        
        const hGeoX = (hRect.left + hRect.right) / 2;
        const hGeoY = (hRect.top + hRect.bottom) / 2;
        const mGeoX = (mRect.left + mRect.right) / 2;
        const mGeoY = (mRect.top + mRect.bottom) / 2;
        const sGeoX = (sRect.left + sRect.right) / 2;
        const sGeoY = (sRect.top + sRect.bottom) / 2;
        
        // 相对于表盘中心的偏移
        const toRel = (v) => (v - faceRect.left - cx).toFixed(1);
        const toRelY = (v) => (v - faceRect.top - cy).toFixed(1);
        
        const hOffX = (toRel(hGeoX));
        const hOffY = (toRelY(hGeoY));
        const mOffX = (toRel(mGeoX));
        const mOffY = (toRelY(mGeoY));
        const sOffX = (toRel(sGeoX));
        const sOffY = (toRelY(sGeoY));
        
        const lines = [
            `=== 钟表教具布局诊断 ===`,
            `容器: ${cRect.width.toFixed(0)}x${cRect.height.toFixed(0)}, 表盘中心相对表盘: (${cx.toFixed(1)}, ${cy.toFixed(1)})`,
            ``,
            `时针几何中心(相对表盘): (${hOffX}, ${hOffY}) w=${hRect.width.toFixed(0)} h=${hRect.height.toFixed(0)}`,
            `  getComputedStyle.transformOrigin: ${getComputedStyle(hHand).transformOrigin}`,
            `分针几何中心(相对表盘): (${mOffX}, ${mOffY}) w=${mRect.width.toFixed(0)} h=${mRect.height.toFixed(0)}`,
            `  getComputedStyle.transformOrigin: ${getComputedStyle(mHand).transformOrigin}`,
            `秒针几何中心(相对表盘): (${sOffX}, ${sOffY}) w=${sRect.width.toFixed(0)} h=${sRect.height.toFixed(0)}`,
            `  getComputedStyle.transformOrigin: ${getComputedStyle(sHand).transformOrigin}`,
            ``,
            `updateHand 当前 transformOrigin: ${hHand.style.transformOrigin || '(未设置,使用CSS)'}`,
        ];
        
        lines.forEach(msg => console.log(msg));
        clockLog('info', 'DEBUG', lines.join('\n'));
    }
    
    getFaceSize() {
        // 动态获取表盘实际渲染尺寸，适配响应式
        const container = document.querySelector('.clock-container');
        if (container) {
            const rect = container.getBoundingClientRect();
            return Math.round(rect.width);
        }
        return 300;
    }
    
    createClockMarks() {
        const clockMarks = document.getElementById('clockMarks');
        if (!clockMarks) return;
        const faceSize = this.getFaceSize();
        const centerX = faceSize / 2;
        const radius = faceSize * 0.467; // ~140 for 300
        
        for (let i = 0; i < 60; i++) {
            const mark = document.createElement('div');
            const isHour = i % 5 === 0;
            
            const markLen = isHour ? faceSize * 0.06 : faceSize * 0.033; // 18/10 for 300
            const markWid = isHour ? '3px' : '1px';
            
            const angleDeg = i * 6 - 90;
            const angleRad = angleDeg * Math.PI / 180;
            
            const outerR = radius;
            const innerR = radius - markLen;
            const x1 = centerX + outerR * Math.cos(angleRad);
            const y1 = centerX + outerR * Math.sin(angleRad);
            const x2 = centerX + innerR * Math.cos(angleRad);
            const y2 = centerX + innerR * Math.sin(angleRad);
            
            const length = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
            const rotation = Math.atan2(y2-y1, x2-x1) * 180 / Math.PI + 90;
            
            // 使用 translate 居中：x 方向 -50% 居中，y 方向从外圈向内地放
            mark.style.position = 'absolute';
            mark.style.left = x1 + 'px';
            mark.style.top = y1 + 'px';
            mark.style.width = markWid;
            mark.style.height = length + 'px';
            mark.style.transform = `translate(-50%, 0) rotate(${rotation}deg)`;
            mark.style.transformOrigin = 'center top';
            mark.style.background = isHour ? '#333' : '#999';
            mark.style.borderRadius = '1px';
            
            clockMarks.appendChild(mark);
        }
    }
    
    createClockNumbers() {
        const clockNumbers = document.getElementById('clockNumbers');
        if (!clockNumbers) return;
        const faceSize = this.getFaceSize();
        const centerX = faceSize / 2;
        const radius = faceSize * 0.35; // ~105 for 300
        
        for (let i = 1; i <= 12; i++) {
            const number = document.createElement('div');
            number.className = 'clock-number';
            number.textContent = i;
            
            const angle = (i * 30 - 90) * (Math.PI / 180);
            const x = centerX + radius * Math.cos(angle);
            const y = centerX + radius * Math.sin(angle);
            
            number.style.left = x + 'px';
            number.style.top = y + 'px';
            number.style.transform = 'translate(-50%, -50%)';
            
            clockNumbers.appendChild(number);
        }
    }
    
    setupEventListeners() {
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.isRealTime = btn.dataset.mode === 'realtime';
                this.toggleMode();
            });
        });
    }
    
    toggleMode() {
        clockLog('info', 'MODE', '切换到' + (this.isRealTime ? '实时模式' : '手动模式'));
        const realtimeControls = document.getElementById('realtimeControls');
        const manualControls = document.getElementById('manualControls');
        
        if (this.isRealTime) {
            realtimeControls.style.display = 'block';
            manualControls.style.display = 'none';
            this.startRealTime();
        } else {
            realtimeControls.style.display = 'none';
            manualControls.style.display = 'block';
            this.startManualMode();
        }
    }
    
    startClock() {
        if (this.isRealTime) {
            this.startRealTime();
        } else {
            this.startManualMode();
        }
    }
    
    startRealTime() {
        this.currentTime = new Date();
        this.updateClock();
        this.updateTimeInfo();
        
        if (this.isRunning) {
            this.animationId = requestAnimationFrame(() => this.startRealTime());
        }
    }
    
    startManualMode() {
        this.updateClock();
        this.updateTimeInfo();
        
        if (this.isRunning) {
            this.animationId = requestAnimationFrame(() => this.startManualMode());
        }
    }
    
    getCenter() {
        const container = document.querySelector('.clock-container');
        if (!container) return { x: 150, y: 150 };
        const rect = container.getBoundingClientRect();
        return { x: rect.width / 2, y: rect.height / 2 };
    }
    
    updateClock() {
        const time = this.isRealTime ? this.currentTime : this.manualTime;
        
        const hours = time.getHours();
        const minutes = time.getMinutes();
        const seconds = time.getSeconds();
        const milliseconds = time.getMilliseconds();
        
        const secondAngle = (seconds + milliseconds / 1000) * 6;
        const minuteAngle = (minutes + seconds / 60) * 6;
        const hourAngle = (hours % 12 + minutes / 60) * 30;
        
        this.updateHand('hourHand', hourAngle);
        this.updateHand('minuteHand', minuteAngle);
        this.updateHand('secondHand', secondAngle);
        
        this.updateDigitalTime(hours, minutes, seconds);
    }
    
    updateHand(handId, angle) {
        const hand = document.getElementById(handId);
        hand.style.transform = `rotate(${angle}deg)`;
    }
    
    updateDigitalTime(hours, minutes, seconds) {
        let h = hours % 12;
        if (h === 0) h = 12;
        const ampm = hours < 12 ? '上午' : '下午';
        const timeString = `${ampm} ${this.padZero(h)}:${this.padZero(minutes)}:${this.padZero(seconds)}`;
        document.getElementById('digitalTime').textContent = timeString;
    }
    
    padZero(num) {
        return num.toString().padStart(2, '0');
    }
    
    updateTimeInfo() {
        const time = this.isRealTime ? this.currentTime : this.manualTime;
        const hours = time.getHours();
        const minutes = time.getMinutes();
        
        let timeInfo = '';
        let h = hours % 12;
        if (h === 0) h = 12;
        const ampm = hours < 12 ? '上午' : '下午';
        
        if (this.isRealTime) {
            timeInfo = `当前时间：${ampm} ${this.padZero(h)}:${this.padZero(minutes)}<br>`;
        } else {
            timeInfo = `设置时间：${ampm} ${this.padZero(h)}:${this.padZero(minutes)}<br>`;
        }
        
        document.getElementById('timeInfo').innerHTML = timeInfo;
    }
    
    setManualTime() {
        const timeInput = document.getElementById('timeInput');
        const timeValue = timeInput.value;
        
        if (timeValue) {
            const [hours, minutes, seconds] = timeValue.split(':').map(Number);
            this.manualTime = new Date();
            this.manualTime.setHours(hours, minutes, seconds || 0);
            this.updateClock();
            this.updateTimeInfo();
            clockLog('info', 'TIME', '手动设置时间: ' + timeValue);
        }
    }
    
    resetToCurrent() {
        this.manualTime = new Date();
        this.updateClock();
        this.updateTimeInfo();
        
        let h = this.manualTime.getHours() % 12;
        if (h === 0) h = 12;
        const ampm = this.manualTime.getHours() < 12 ? '上午' : '下午';
        const minutes = this.padZero(this.manualTime.getMinutes());
        const seconds = this.padZero(this.manualTime.getSeconds());
        document.getElementById('timeInput').placeholder = `例：${this.padZero(h)}:${minutes} (${ampm})`;
        document.getElementById('timeInput').value = `${this.padZero(h)}:${minutes}`;
        clockLog('info', 'TIME', '重置为当前时间');
    }
    
    toggleAnimation() {
        this.isRunning = !this.isRunning;
        clockLog('info', 'MODE', this.isRunning ? '启动动画' : '暂停动画');
        
        if (this.isRunning) {
            this.startClock();
        } else {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
        }
    }
    
    resetClock() {
        this.manualTime = new Date();
        this.updateClock();
        this.updateTimeInfo();
        this.resetToCurrent();
        clockLog('info', 'MODE', '重置钟表');
    }
}

// 获取表盘中心坐标（保留给诊断代码使用）
function getClockCenter() {
    const container = document.querySelector('.clock-container');
    if (!container) return { x: 150, y: 150 };
    const rect = container.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

// 根据拖动的指针计算新时间
let _prevAngle = null; // 用于去抖：上次处理的指针角度
let prevFrameAngle = -1; // 记录上一帧分针的实际角度
let lastMinuteValue = -1; // 记录上一帧的分钟数（0~59）
let minuteCrossedZero = false; // 标记本圈是否已处理过跨12点事件
let lastProcessTime = 0; // 上次处理的时间戳
const DEBOUNCE_MS = 30; // 去抖间隔，30ms过滤微抖但不丢正常拖动帧

function setTimeByPointer(pointerType, newAngleDeg) {
    const now = Date.now();
    
    // 时间戳去抖：同指针80ms内不重复处理
    if (pointerType === 'minute' && lastProcessTime > 0 && now - lastProcessTime < DEBOUNCE_MS) {
        return;
    }
    if (pointerType === 'hour' && lastProcessTime > 0 && now - lastProcessTime < DEBOUNCE_MS) {
        return;
    }
    lastProcessTime = now;
    
    let time = new Date(clock.manualTime);
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();
    
    if (pointerType === 'second') {
        const newSeconds = Math.round(newAngleDeg / 6);
        time.setSeconds(((newSeconds % 60) + 60) % 60);
    } else if (pointerType === 'minute') {
        const totalMinutes = Math.round(newAngleDeg / 6);
        const m = totalMinutes % 60;
        
        let newHours = hours;
        
        // 分针过12点时，根据分钟数变化判断小时加减
        // 59→0（顺时针）：+1小时
        // 0→59（逆时针）：-1小时
        if (!minuteCrossedZero && lastMinuteValue >= 0) {
            if (lastMinuteValue === 59 && m === 0) {
                // 顺时针过12点
                newHours = hours + 1;
                clockLog('info', 'TIME', `⏰ 小时+1: ${hours}→${newHours}`);
                minuteCrossedZero = true;
            } else if (lastMinuteValue === 0 && m === 59) {
                // 逆时针过12点
                newHours = hours - 1;
                clockLog('info', 'TIME', `⏰ 小时-1: ${hours}→${newHours}`);
                minuteCrossedZero = true;
            }
        }
        
        time.setHours(newHours, m, 0);
        
        // 离开边界区域后重置标记
        if (minuteCrossedZero && m > 10 && m < 55) {
            minuteCrossedZero = false;
        }
        
        // 每帧更新 prevFrameAngle
        prevFrameAngle = newAngleDeg;
        
        // 记录上一帧的分钟数
        lastMinuteValue = m;
    } else if (pointerType === 'hour') {
        const totalHours = Math.round(newAngleDeg / 30);
        const h = (totalHours % 12 + 12) % 12;
        const newH = h === 0 ? 12 : h;
        if (newH !== hours && newH !== (hours % 12 === 0 ? 12 : hours % 12)) {
            clockLog('info', 'TIME', `⏰ 小时变化: ${hours}→${newH} (时针拖动)`);
        }
        time.setHours(newH, minutes, seconds);
    }
    
    clock.manualTime = time;
    clock.updateClock();
    clock.updateTimeInfo();
}

// 去抖辅助函数
function _getPrevAngle() { return window._prevAngleVal || 0; }
function _setPrevAngle(type, angle) { window._prevAngleVal = angle; _prevAngle = type; }

// 获取指针在某个时间的初始角度
function getPointerStartAngle(pointerType, time) {
    const h = time.getHours();
    const m = time.getMinutes();
    const s = time.getSeconds();
    
    if (pointerType === 'hour') {
        return ((h % 12) + m / 60) * 30;
    } else if (pointerType === 'minute') {
        return (m + s / 60) * 6;
    } else {
        return s * 6;
    }
}

// 全局函数
let clock;
let selectedPointer = 'hour'; // 当前选中的指针（默认时针）
let lastMinuteAngle = -1; // 记录上一帧分针角度（用于判断过12点的方向）

// 选择要拖动的指针
function selectPointer(type) {
    selectedPointer = type;
    // 更新按钮样式
    document.querySelectorAll('.pointer-btn').forEach(btn => {
        btn.classList.toggle('active-pointer', btn.dataset.pointer === type);
    });
    clockLog('info', 'DRAG', `选择指针: ${type === 'hour' ? '时针' : type === 'minute' ? '分针' : '秒针'}`);
}

function setManualTime() {
    clock.setManualTime();
}

function resetToCurrent() {
    clock.resetToCurrent();
}

function toggleAnimation() {
    clock.toggleAnimation();
}

function resetClock() {
    clock.resetClock();
}

// 初始化钟表
document.addEventListener('DOMContentLoaded', () => {
    clock = new ClockTeaching();
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case ' ':
                e.preventDefault();
                toggleAnimation();
                break;
            case 'r':
            case 'R':
                resetClock();
                break;
            case 'm':
            case 'M':
                const manualBtn = document.querySelector('[data-mode="manual"]');
                if (manualBtn) manualBtn.click();
                break;
            case 't':
            case 'T':
                const realtimeBtn = document.querySelector('[data-mode="realtime"]');
                if (realtimeBtn) realtimeBtn.click();
                break;
        }
    });
    
    // 切换模式时显示/隐藏指针选择器
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(() => {
                const selector = document.getElementById('pointerSelector');
                selector.style.display = clock.isRealTime ? 'none' : 'flex';
            }, 0);
        });
    });
    
    // === 手机友好的拖动系统 ===
    // 逻辑：先点按钮选指针 → 在表盘上按住拖动 → 指针实时跟随手指角度
    let isDragging = false;
    let dragTarget = null;
    
    const clockFace = document.querySelector('.clock-face');
    if (!clockFace) return;
    
    function getAngleFromCenter(clientX, clientY) {
        const rect = clockFace.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let angle = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
        // atan2 返回 -180~180，需要转到 0~360
        // 且 -90 是上方(12点方向)，需要偏移
        angle = angle + 90;
        if (angle < 0) angle += 360;
        return angle;
    }
    
    function handleDragMove(clientX, clientY) {
        if (!isDragging || clock.isRealTime) return;
        
        const angle = getAngleFromCenter(clientX, clientY);
        setTimeByPointer(dragTarget, angle);
    }
    
    // 鼠标事件
    clockFace.addEventListener('mousedown', (e) => {
        if (clock.isRealTime) return;
        isDragging = true;
        dragTarget = selectedPointer;
        handleDragMove(e.clientX, e.clientY);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            e.preventDefault();
            handleDragMove(e.clientX, e.clientY);
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            clockLog('info', 'DRAG', '停止拖动');
        }
        isDragging = false;
        dragTarget = null;
    });
    
    // 触摸事件（防止浏览器手势滚动）
    clockFace.addEventListener('touchstart', (e) => {
        if (clock.isRealTime) return;
        e.preventDefault();
        isDragging = true;
        dragTarget = selectedPointer;
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
        clockLog('info', 'TOUCH', `开始拖动${dragTarget === 'hour' ? '时针' : dragTarget === 'minute' ? '分针' : '秒针'}`);
    }, { passive: false });
    
    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            handleDragMove(touch.clientX, touch.clientY);
        }
    }, { passive: false });
    
    document.addEventListener('touchend', () => {
        if (isDragging) {
            clockLog('info', 'TOUCH', '停止拖动');
        }
        isDragging = false;
        dragTarget = null;
    });
});

// 窗口大小调整
window.addEventListener('resize', () => {
    if (clock) {
        clock.updateClock();
    }
});
