function drawWaveform(buffer) {
    ctx.fillStyle = '#1a2332';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4f8a8b';
    ctx.beginPath();
    
    const sliceWidth = canvas.width / buffer.length;
    let x = 0;
    
    for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i];
        const y = (v + 1) / 2 * canvas.height;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    
    ctx.stroke();
}

