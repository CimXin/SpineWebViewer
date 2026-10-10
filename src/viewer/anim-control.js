// 动画控制器
window.animControl = {
    isPlaying: true,
    isScrubbing: false, 
    targetTime: -1,
    duration: 0,
    currentTime: 0,
    
    togglePlay: function() {
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) this.releaseHold();
        document.getElementById('btn-play').innerText = this.isPlaying ? "⏸" : "▶";
    },

    releaseHold: function() {
        this.isScrubbing = false;
        this.targetTime = -1;
    },

    pauseForStep: function() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        const btn = document.getElementById('btn-play');
        if (btn) btn.innerText = "▶";
    },

    // direction: -1 backward, +1 forward. One frame at the current 帧率 setting.
    step: function(direction) {
        const duration = this.duration;
        if (!(duration > 0)) return;
        this.pauseForStep();
        const fps = (window.viewerConfig && window.viewerConfig.targetFps) || 60;
        const frame = 1 / (fps > 0 ? fps : 60);
        let time = this.currentTime;
        if (!Number.isFinite(time)) time = 0;
        time = ((time % duration) + duration) % duration;
        let next = time + direction * frame;
        next = ((next % duration) + duration) % duration;
        this.isScrubbing = true;
        this.targetTime = next;
        this.currentTime = next;
        const state = window.animationState;
        if (state && typeof state.getCurrent === "function") {
            const track = state.getCurrent(0);
            if (track) track.trackTime = next;
        }
        this.updateUI(next, duration);
        const el = document.getElementById('timeline');
        if (el) el.value = String((next / duration) * 1000);
    },

    updateUI: function(current, total) {
        this.duration = total;
        this.currentTime = current;
        
        const el = document.getElementById('timeline');
        const txt = document.getElementById('time-text');
        if (window.animDirector && window.animDirector.tick) window.animDirector.tick();

        if (!(total > 0)) {
            if (txt) txt.innerText = window.viewerConfig.timeMode === 'frames' ? '0 / 0' : '0.00 / 0.00';
            if (txt) txt.style.color = '#111111';
            if (el && !this.isScrubbing) el.value = 0;
            return;
        }
        
        if (!this.isScrubbing && total > 0) {
            const progress = (current % total) / total;
            el.value = progress * 1000;
        }

        if(window.viewerConfig.timeMode === 'frames') {
            const fps = window.viewerConfig.targetFps || 30;
            const curFrame = Math.floor((current % total) * fps);
            const totalFrame = Math.floor(total * fps);
            txt.innerText = `${curFrame} / ${totalFrame}`;
        } else {
            txt.innerText = `${(current % total).toFixed(2)} / ${total.toFixed(2)}`;
        }
        txt.style.color = '#111111';
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
