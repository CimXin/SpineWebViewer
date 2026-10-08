// ==========================================
// 自动记忆功能 (Auto Save/Load Config)
// ==========================================
const CONFIG_KEY = "spine_viewer_config_v1";

window.saveConfig = function() {
    // 防止未加载完成时覆盖配置
    if (!window.configLoaded) return; 

    const config = {
        bgColor: document.getElementById('bg-color').value,
        bgType: window.viewerConfig.bgType || 'color', // 记录是纯色还是棋盘格
        showBones: document.getElementById('chk-bones').checked,
        boneColor: document.getElementById('bone-color').value,
        boneScale: document.getElementById('bone-scale').value,
        speed: document.getElementById('speed-select').value,
        fps: document.getElementById('fps-select').value,
        pma: document.getElementById('chk-pma').checked,
        unpack: document.getElementById('chk-unpack').checked,
        // 记录导出设置
        exportParams: {
            prefix: document.getElementById('export-prefix').value,
            digits: document.getElementById('export-digits').value,
            format: document.getElementById('export-format').value,
            scale: document.getElementById('export-scale').value
        },
        // 记录背景图参数
        bgParams: {
            x: document.getElementById('bg-x').value,
            y: document.getElementById('bg-y').value,
            scale: document.getElementById('bg-scale').value,
            opacity: document.getElementById('bg-opacity').value
        }
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    // console.log("Config saved:", config);
}

window.loadConfig = function() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) {
            window.configLoaded = true;
            return;
        }
        const config = JSON.parse(raw);
        
        // 恢复背景色
        if (config.bgColor) {
            setBgColor(config.bgColor); // 这里会设置 bgType = 'color'
            document.getElementById('bg-color').value = config.bgColor;
        }
        // 恢复棋盘格状态（如果上次是棋盘格，覆盖上面的设置）
        if (config.bgType === 'checkerboard') {
                setBgCheckerboard();
        }

        // 恢复骨骼设置
        if (config.showBones !== undefined) {
            document.getElementById('chk-bones').checked = config.showBones;
            if(window.viewerConfig) window.viewerConfig.showBones = config.showBones;
        }
        if (config.boneColor) {
            document.getElementById('bone-color').value = config.boneColor;
            if(window.viewerConfig) window.viewerConfig.boneColor = config.boneColor;
        }
        if (config.boneScale) {
            document.getElementById('bone-scale').value = config.boneScale;
            if(window.viewerConfig) window.viewerConfig.boneScale = parseFloat(config.boneScale);
        }

        // 恢复播放设置
        if (config.speed) {
            document.getElementById('speed-select').value = config.speed;
            if(window.viewerConfig) window.viewerConfig.speed = parseFloat(config.speed);
        }
        if (config.fps) {
            document.getElementById('fps-select').value = config.fps;
            if(window.viewerConfig) window.viewerConfig.targetFps = parseInt(config.fps);
        }

        // 恢复 PMA 和 Unpack
        if (config.pma !== undefined) {
            document.getElementById('chk-pma').checked = config.pma;
            if(window.viewerConfig) window.viewerConfig.pmaEnabled = config.pma;
        }
        if (config.unpack !== undefined) {
            document.getElementById('chk-unpack').checked = config.unpack;
            if(window.viewerConfig) window.viewerConfig.unpackEnabled = config.unpack;
        }
        // 兼容旧配置 alphaMode
        if (config.alphaMode) {
            // 如果旧配置是 straight，相当于开启了 Unpack
            if(config.alphaMode === 'straight') {
                document.getElementById('chk-unpack').checked = true;
                if(window.viewerConfig) window.viewerConfig.unpackEnabled = true;
            }
        }
        
        // 恢复导出设置
        if (config.exportParams) {
            if(config.exportParams.prefix) document.getElementById('export-prefix').value = config.exportParams.prefix;
            if(config.exportParams.digits) document.getElementById('export-digits').value = config.exportParams.digits;
            if(config.exportParams.format) document.getElementById('export-format').value = config.exportParams.format;
            if(config.exportParams.scale) document.getElementById('export-scale').value = config.exportParams.scale;
        }

        // 恢复背景图参数
        if (config.bgParams) {
            updateBgFromInput('bg-x', config.bgParams.x);
            updateBgFromInput('bg-y', config.bgParams.y);
            updateBgFromInput('bg-scale', config.bgParams.scale);
            updateBgFromInput('bg-opacity', config.bgParams.opacity);
        }
        
        // console.log("Config loaded");
    } catch(e) {
        console.warn("Load config failed:", e);
    } finally {
        window.configLoaded = true; // 标记加载完成，允许保存
    }
}

// 绑定自动保存：页面关闭/刷新时
window.addEventListener('beforeunload', saveConfig);
// 同时也绑定到 visibilitychange，以防移动端不触发 beforeunload
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveConfig();
});

function bootConfig() {
    if (window.debugRenderer) window.debugRenderer.init();
    loadConfig();
}

if (document.readyState === 'complete') bootConfig();
else window.addEventListener('load', bootConfig);
