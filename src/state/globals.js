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

window.log = function(msg, key, vars) {
    const el = document.getElementById('log');
    if (!el) return;
    el.dataset.touched = "1";
    el.removeAttribute("data-i18n");
    if (typeof key === "string" && key && window.t) {
        el.dataset.i18nKey = key;
        el.dataset.i18nVars = vars ? JSON.stringify(vars) : "{}";
        el.innerText = window.t(key, vars);
    } else {
        delete el.dataset.i18nKey;
        delete el.dataset.i18nVars;
        el.innerText = msg == null ? "" : String(msg);
    }
};

// ==========================================
// 全局配置 (指挥部)
// ==========================================
window.viewerConfig = { 
    bgColor: [0.2, 0.2, 0.2, 0.0],
    showBones: false,
    showOrigin: true,
    highlightBone: null,
    boneColor: '#00ff00',
    boneScale: 1.0,
    speed: 1.0,
    targetFps: 60,
    timeMode: 'seconds',
    pmaEnabled: false, // 运行时混合开关，默认关闭
    unpackEnabled: false, // 加载时解包开关
    debugMesh: false,
    debugTris: false,
    debugHull: false,
    debugBounds: false,
    debugPaths: false,
    debugClip: false,
    debugConstraints: false,
    debugPhysics: false,
    debugPoints: false,
    showStats: false,
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

// 舞台像素：WebGL 投影、调试叠加层、鼠标位移必须共用同一套 CSS 像素。
// 浏览器页面缩放（Ctrl +/-）会改变视口里有多少 CSS 像素，devicePixelRatio 跟着变，
// 但相机单位仍然是 CSS 像素，不能再乘 devicePixelRatio，否则骨骼在高分屏上会变小。
// 位图尺寸用布局盒（getBoundingClientRect）而不是 innerWidth：页面缩放后 innerWidth
// 会变，调试画布若停在旧尺寸，CSS 把两张位图拉伸的比例就不同，原点轴会越拖越偏。
window.stageMetrics = {
    backingSize: function (cssWidth, cssHeight) {
        const w = Number(cssWidth);
        const h = Number(cssHeight);
        const width = Number.isFinite(w) && w > 0 ? w : (window.innerWidth || 1);
        const height = Number.isFinite(h) && h > 0 ? h : (window.innerHeight || 1);
        return {
            width: Math.max(1, Math.round(width)),
            height: Math.max(1, Math.round(height))
        };
    },
    // clientX 是 CSS 像素，投影用的是画布位图像素。两者不一致时用这个比值换算。
    pointerScale: function (backingW, backingH, cssW, cssH) {
        const bw = Number(backingW);
        const bh = Number(backingH);
        const cw = Number(cssW);
        const ch = Number(cssH);
        return {
            x: cw > 0 && bw > 0 ? bw / cw : 1,
            y: ch > 0 && bh > 0 ? bh / ch : 1
        };
    },
    // zoom 为放大倍率（越大越放大）。结果是位图像素，Y 向下。
    project: function (worldX, worldY, camX, camY, zoom, width, height) {
        const z = Number.isFinite(zoom) && zoom !== 0 ? zoom : 1;
        return {
            x: width / 2 + (worldX - camX) * z,
            y: height / 2 - (worldY - camY) * z
        };
    },
    // 4.0/4.1 OrthoCamera.zoom 放大视锥（越大越缩小）。3.6–3.8 与 4.2 存的是放大倍率。
    overlayZoom: function (cameraZoom, kind) {
        const z = Number(cameraZoom);
        if (!Number.isFinite(z) || z === 0) return 1;
        if (kind === "ortho") return 1 / z;
        return z;
    }
};

window.syncStageCanvas = function (canvas) {
    if (!canvas || (window.viewerConfig && window.viewerConfig.isExporting)) return;
    let cssW = 0;
    let cssH = 0;
    const stage = document.getElementById("canvas-wrapper") || canvas;
    if (stage && typeof stage.getBoundingClientRect === "function") {
        const rect = stage.getBoundingClientRect();
        cssW = rect.width;
        cssH = rect.height;
    }
    if (!(cssW > 0) || !(cssH > 0)) {
        if (canvas !== stage && typeof canvas.getBoundingClientRect === "function") {
            const rect = canvas.getBoundingClientRect();
            cssW = rect.width;
            cssH = rect.height;
        }
    }
    const size = window.stageMetrics.backingSize(cssW, cssH);
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
};

window.stagePointerScale = function (canvas) {
    const el = canvas || document.getElementById("canvas");
    if (!el || typeof el.getBoundingClientRect !== "function") return { x: 1, y: 1 };
    const rect = el.getBoundingClientRect();
    return window.stageMetrics.pointerScale(el.width, el.height, rect.width, rect.height);
};

window.stageDragDelta = function (canvas, event, lastX, lastY) {
    const scale = window.stagePointerScale(canvas);
    return {
        x: (event.clientX - lastX) * scale.x,
        y: (event.clientY - lastY) * scale.y
    };
};
