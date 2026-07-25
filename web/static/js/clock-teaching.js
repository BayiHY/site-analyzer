// 钟表教具 JavaScript
class ClockTeaching {
    constructor() {
        this.isRealTime = true;
        this.isRunning = true;
        this.currentTime = new Date();
        this.manualTime = new Date();
        this.animationId = null;
        
        this.init();
    }
    
    init() {
        this.createClockMarks();
        this.createClockNumbers();
        this.setupEventListeners();
        this.startClock();
    }
    
    createClockMarks() {
        const clockMarks = document.getElementById('clockMarks');
        
        // 创建12个小时刻度
        for (let i = 0; i < 12; i++) {
            const mark = document.createElement('div');
            mark.className = 'clock-mark hour-mark';
            mark.style.transform = `rotate(${i * 30}deg)`;
            clockMarks.appendChild(mark);
        }
        
        // 创建60个分钟刻度
        for (let i = 0; i < 60; i++) {
            if (i % 5 !== 0) { // 跳过小时刻度位置
                const mark = document.createElement('div');
                mark.className = 'clock-mark minute-mark';
                mark.style.transform = `rotate(${i * 6}deg)`;
                clockMarks.appendChild(mark);
            }
        }
    }
    
    createClockNumbers() {
        const clockNumbers = document.getElementById('clockNumbers');
        
        // 创建12个数字
        for (let i = 1; i <= 12; i++) {
            const number = document.createElement('div');
            number.className = 'clock-number';
            number.textContent = i;
            
            // 计算数字位置
            const angle = (i * 30 - 90) * (Math.PI / 180);
            const radius = 120;
            const x = 150 + radius * Math.cos(angle);
            const y = 150 + radius * Math.sin(angle);
            
            number.style.left = x + 'px';
            number.style.top = y + 'px';
            
            clockNumbers.appendChild(number);
        }
    }
    
    setupEventListeners() {
        // 模式切换
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
    
    updateClock() {
        const time = this.isRealTime ? this.currentTime : this.manualTime;
        
        const hours = time.getHours();
        const minutes = time.getMinutes();
        const seconds = time.getSeconds();
        const milliseconds = time.getMilliseconds();
        
        // 计算角度
        const secondAngle = (seconds + milliseconds / 1000) * 6; // 每秒6度
        const minuteAngle = (minutes + seconds / 60) * 6; // 每分钟6度
        const hourAngle = (hours % 12 + minutes / 60) * 30; // 每小时30度
        
        // 更新指针位置
        this.updateHand('hourHand', hourAngle);
        this.updateHand('minuteHand', minuteAngle);
        this.updateHand('secondHand', secondAngle);
        
        // 更新数字显示
        this.updateDigitalTime(hours, minutes, seconds);
    }
    
    updateHand(handId, angle) {
        const hand = document.getElementById(handId);
        hand.style.transform = `rotate(${angle}deg)`;
    }
    
    updateDigitalTime(hours, minutes, seconds) {
        const timeString = `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(seconds)}`;
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
        
        if (this.isRealTime) {
            timeInfo = `当前时间：${this.padZero(hours)}:${this.padZero(minutes)}<br>`;
            timeInfo += `上午/下午：${hours < 12 ? '上午' : '下午'}<br>`;
            timeInfo += `24小时制：${this.padZero(hours)}:${this.padZero(minutes)}`;
        } else {
            timeInfo = `设置时间：${this.padZero(hours)}:${this.padZero(minutes)}<br>`;
            timeInfo += `上午/下午：${hours < 12 ? '上午' : '下午'}<br>`;
            timeInfo += `24小时制：${this.padZero(hours)}:${this.padZero(minutes)}`;
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
        }
    }
    
    resetToCurrent() {
        this.manualTime = new Date();
        this.updateClock();
        this.updateTimeInfo();
        
        // 更新输入框
        const hours = this.padZero(this.manualTime.getHours());
        const minutes = this.padZero(this.manualTime.getMinutes());
        const seconds = this.padZero(this.manualTime.getSeconds());
        document.getElementById('timeInput').value = `${hours}:${minutes}:${seconds}`;
    }
    
    toggleAnimation() {
        this.isRunning = !this.isRunning;
        
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
    }
}

// 全局函数
let clock;

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
});

// 添加键盘快捷键
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
            // 切换到手动模式
            const manualBtn = document.querySelector('[data-mode="manual"]');
            if (manualBtn) manualBtn.click();
            break;
        case 't':
        case 'T':
            // 切换到实时模式
            const realtimeBtn = document.querySelector('[data-mode="realtime"]');
            if (realtimeBtn) realtimeBtn.click();
            break;
    }
});

// 添加触摸支持
let isDragging = false;
let dragStartAngle = 0;
let dragStartTime = 0;

document.addEventListener('touchstart', (e) => {
    if (!clock.isRealTime) {
        isDragging = true;
        const touch = e.touches[0];
        const rect = e.target.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        dragStartAngle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
        dragStartTime = new Date(clock.manualTime);
    }
});

document.addEventListener('touchmove', (e) => {
    if (isDragging && !clock.isRealTime) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = e.target.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const currentAngle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
        const angleDiff = currentAngle - dragStartAngle;
        
        // 计算时间变化
        const timeDiff = angleDiff * (1000 * 60 * 60) / (2 * Math.PI); // 1小时 = 2π
        
        const newTime = new Date(dragStartTime.getTime() + timeDiff);
        clock.manualTime = newTime;
        clock.updateClock();
        clock.updateTimeInfo();
    }
});

document.addEventListener('touchend', () => {
    isDragging = false;
});

// 添加鼠标支持
document.addEventListener('mousedown', (e) => {
    if (!clock.isRealTime && e.target.closest('.clock-container')) {
        isDragging = true;
        const rect = e.target.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        dragStartAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        dragStartTime = new Date(clock.manualTime);
    }
});

document.addEventListener('mousemove', (e) => {
    if (isDragging && !clock.isRealTime) {
        const rect = document.querySelector('.clock-container').getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        const angleDiff = currentAngle - dragStartAngle;
        
        // 计算时间变化
        const timeDiff = angleDiff * (1000 * 60 * 60) / (2 * Math.PI); // 1小时 = 2π
        
        const newTime = new Date(dragStartTime.getTime() + timeDiff);
        clock.manualTime = newTime;
        clock.updateClock();
        clock.updateTimeInfo();
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

// 添加窗口大小调整支持
window.addEventListener('resize', () => {
    if (clock) {
        clock.updateClock();
    }
});