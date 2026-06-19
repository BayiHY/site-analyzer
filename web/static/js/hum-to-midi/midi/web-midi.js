// ========== Web MIDI API ==========
async function initMIDI() {
    const select = document.getElementById('midiDeviceSelect');
    select.innerHTML = '<option value="">选择MIDI设备...</option>';
    
    // 添加虚拟键盘选项（始终可用）
    const virtualOption = document.createElement('option');
    virtualOption.value = 'virtual-keyboard';
    virtualOption.textContent = '🎹 虚拟键盘（页面内）';
    select.appendChild(virtualOption);
    
    if (!navigator.requestMIDIAccess) {
        document.getElementById('midiStatus').textContent = '仅虚拟键盘';
        document.getElementById('midiStatus').style.color = 'var(--warning)';
        return;
    }
    
    try {
        midiAccess = await navigator.requestMIDIAccess();
        const inputs = Array.from(midiAccess.inputs.values());
        
        inputs.forEach((input, i) => {
            const option = document.createElement('option');
            option.value = input.id;
            option.textContent = input.name || `MIDI Input ${i + 1}`;
            select.appendChild(option);
        });
        
        if (inputs.length === 0) {
            document.getElementById('midiStatus').textContent = '仅虚拟键盘';
            document.getElementById('midiStatus').style.color = 'var(--warning)';
        } else {
            document.getElementById('midiStatus').textContent = `${inputs.length} 设备 + 虚拟键盘`;
            document.getElementById('midiStatus').style.color = 'var(--success)';
        }
        
        // 监听设备连接/断开
        midiAccess.onstatechange = (e) => {
            const inputs = Array.from(midiAccess.inputs.values());
            const select = document.getElementById('midiDeviceSelect');
            select.innerHTML = '<option value="">选择MIDI设备...</option>';
            
            // 重新添加虚拟键盘选项
            const virtualOption = document.createElement('option');
            virtualOption.value = 'virtual-keyboard';
            virtualOption.textContent = '🎹 虚拟键盘（页面内）';
            select.appendChild(virtualOption);
            
            inputs.forEach((input, i) => {
                const option = document.createElement('option');
                option.value = input.id;
                option.textContent = input.name || `MIDI Input ${i + 1}`;
                select.appendChild(option);
            });
            
            if (inputs.length === 0) {
                document.getElementById('midiStatus').textContent = '仅虚拟键盘';
            } else {
                document.getElementById('midiStatus').textContent = `${inputs.length} 设备 + 虚拟键盘`;
            }
        };
        
    } catch (err) {
        document.getElementById('midiStatus').textContent = '仅虚拟键盘';
        document.getElementById('midiStatus').style.color = 'var(--warning)';
    }
}

