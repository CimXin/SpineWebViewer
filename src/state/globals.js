function toggleSection(header) {
    const group = header.parentElement;
    const content = group.querySelector('.ui-content');
    const arrow = group.querySelector('.ui-arrow');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.style.transform = 'rotate(90deg)'; 
    } else {
        content.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)'; 
    }
}

window.setBoneColor = function(c) {
    document.getElementById('bone-color').value = c;
    window.viewerConfig.boneColor = c;
}

window.setBgColor = function(c) {
    document.getElementById('bg-color').value = c;
    const wrapper = document.getElementById('canvas-wrapper');
    wrapper.style.backgroundColor = c;
    wrapper.style.backgroundImage = 'none'; // 清除棋盘格
    
    const r = parseInt(c.slice(1, 3), 16) / 255;
    const g = parseInt(c.slice(3, 5), 16) / 255;
    const b = parseInt(c.slice(5, 7), 16) / 255;
    window.viewerConfig.bgColor = [r, g, b, 0.0]; // Alpha = 0 让 WebGL 透明
}

window.setBgCheckerboard = function() {
    const wrapper = document.getElementById('canvas-wrapper');
    // Photoshop 风格灰白棋盘格
    wrapper.style.backgroundColor = "#fff";
    wrapper.style.backgroundImage = "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)";
    wrapper.style.backgroundSize = "20px 20px";
    wrapper.style.backgroundPosition = "0 0, 0 10px, 10px -10px, -10px 0px";
    
    window.viewerConfig.bgColor = [0, 0, 0, 0]; // WebGL 全透
}

window.log = function(msg) { document.getElementById('log').innerText = msg; }

// ==========================================
// 全局配置 (指挥部)
// ==========================================
window.viewerConfig = { 
    bgColor: [0.2, 0.2, 0.2, 0.0],
    showBones: false,
    showOrigin: true,
    boneColor: '#00ff00',
    boneScale: 1.0,
    speed: 1.0,
    targetFps: 60,
    timeMode: 'seconds',
    pmaEnabled: false, // 运行时混合开关，默认关闭
    unpackEnabled: false, // 加载时解包开关
    debugCtx: null,
    debugCanvas: null
};

window.togglePMA = function(checked) {
    window.viewerConfig.pmaEnabled = checked;
    // 立即尝试更新当前渲染器（不需要重新加载）
    if (window.renderer) {
        window.renderer.premultipliedAlpha = checked;
    } else if (window.skeletonRenderer) {
        window.skeletonRenderer.premultipliedAlpha = checked;
    }
};

window.toggleUnpack = function(checked) {
    window.viewerConfig.unpackEnabled = checked;
    console.log("Unpack Pre-multiply switched to:", checked);
    
    // 只有当当前有加载的文件时，才触发重载
    if (window.currentSpineFiles && window.currentSpineFiles.length > 0) {
        const ver = document.getElementById('version-select').value;
        loadSpineGroup(window.currentSpineFiles, ver || null);
    }
};
