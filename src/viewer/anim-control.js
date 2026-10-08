// 动画控制器
window.animControl = {
    isPlaying: true,
    isScrubbing: false, 
    targetTime: -1,
    duration: 0,
    currentTime: 0,
    
    togglePlay: function() {
        this.isPlaying = !this.isPlaying;
        document.getElementById('btn-play').innerText = this.isPlaying ? "⏸" : "▶";
    },

    updateUI: function(current, total) {
        this.duration = total;
        this.currentTime = current;
        
        const el = document.getElementById('timeline');
        const txt = document.getElementById('time-text');
        
        if (!this.isScrubbing && total > 0) {
            const progress = (current % total) / total;
            el.value = progress * 1000;
        }

        if(window.viewerConfig.timeMode === 'frames') {
            const fps = window.viewerConfig.targetFps || 30;
            const curFrame = Math.floor((current % total) * fps);
            const totalFrame = Math.floor(total * fps);
            txt.innerText = `${curFrame} / ${totalFrame}`;
            txt.style.color = '#00e5ff'; 
        } else {
            txt.innerText = `${(current % total).toFixed(2)} / ${total.toFixed(2)}`;
            txt.style.color = '#ffffff'; 
        }
    },
    
    // 强制刷新（当FPS改变时调用）
    refresh: function() {
        this.updateUI(this.currentTime, this.duration);
    }
};

// 绑定背景颜色
document.getElementById('bg-color').addEventListener('input', (e) => {
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    window.viewerConfig.bgColor = [r, g, b, 1.0];
});

// 绑定时间滑块
const timeline = document.getElementById('timeline');
timeline.addEventListener('mousedown', () => { window.animControl.isScrubbing = true; });
timeline.addEventListener('mouseup', () => { 
    window.animControl.isScrubbing = false; 
    window.animControl.targetTime = -1; 
});
timeline.addEventListener('input', (e) => {
    if (window.animControl.duration > 0) {
        const percent = e.target.value / 1000;
        const time = percent * window.animControl.duration;
        window.animControl.targetTime = time;
        window.animControl.updateUI(time, window.animControl.duration);
    }
});
