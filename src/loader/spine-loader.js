window.loadSpineGroup = async function(files, forceVersion = null) {
    window.currentSpineFiles = files;

    if (window.rendererRequestId) {
        cancelAnimationFrame(window.rendererRequestId);
        window.rendererRequestId = 0;
    }
    if (window.viewerConfig && window.viewerConfig.animRequestId) {
        cancelAnimationFrame(window.viewerConfig.animRequestId);
        window.viewerConfig.animRequestId = 0;
    }

    const wrapper = document.getElementById('canvas-wrapper');
    const oldCanvas = document.getElementById('canvas');
    if (oldCanvas) {
        const gl = oldCanvas.getContext('webgl');
        if(gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
        wrapper.removeChild(oldCanvas);
    }

    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'canvas';
    newCanvas.style.position = 'absolute';
    newCanvas.style.top = '0';
    newCanvas.style.left = '0';
    newCanvas.style.width = '100%';
    newCanvas.style.height = '100%';
    newCanvas.style.zIndex = '5'; // Spine 在中间层 (BG=1, Front=10)
    
    // 插入到 effect-canvas 之前，bg-image-container 之后
    const effectCanvas = document.getElementById('effect-canvas');
    wrapper.insertBefore(newCanvas, effectCanvas);

    // 重置状态
    window.skeleton = null;
    window.animationState = null;
    window.spine = undefined; 
    if(window.debugRenderer) window.debugRenderer.drawBones(null, 0,0,1,0);

    // 识别文件
    let map = { skel: null, json: null, atlas: null, png: null };
    for(let f of files) {
        let name = f.name.toLowerCase();
        if(name.endsWith('.atlas') || name.endsWith('.atlas.txt')) map.atlas = f;
        else if(name.endsWith('.png') || name.endsWith('.jpg')) map.png = f;
        else if(name.endsWith('.skel') || name.endsWith('.skel.bytes')) map.skel = f;
        else if(name.endsWith('.json') || name.endsWith('.json.txt')) map.json = f;
    }

    // 版本检测
    let version = forceVersion;
    if (!version) {
        try {
            if (map.skel) version = await detectBinaryVersion(map.skel);
            else if (map.json) version = await detectJsonVersion(map.json);
            // 移除错误的 fallback: else version = await detectBinaryVersion(files);
            
            if(!version) {
                console.warn("Version detection failed, defaulting to 4.1");
                version = "4.1"; 
            }
        } catch (err) {
            console.error("Version detection error:", err);
            version = "4.1";
        }
    }
    
    log(`加载: ${version} ...`);
    
    // 更新 UI 状态
    document.getElementById('version-label').style.display = 'block';
    document.getElementById('version-label').innerText = `Ver: ${version}`;
    
    const vSelect = document.getElementById('version-select');
    let matched = false;
    for(let opt of vSelect.options) {
        if(version.startsWith(opt.value) && opt.value !== "") {
            vSelect.value = opt.value;
            matched = true;
            break;
        }
    }
    if(!matched) {
        vSelect.options[0].text = `Detected: ${version}`;
        vSelect.value = ""; 
    }
    
    document.getElementById('file-panel').style.display = 'flex';
    const dropZone = document.getElementById('drop-zone');
    dropZone.style.opacity = 0;
    setTimeout(() => dropZone.style.display = 'none', 500);

    // 隐藏不需要的 UI
    document.getElementById('ui').style.display = 'none';
    document.getElementById('controls').style.display = 'none';

    // 重置多轨道UI
    document.getElementById('extra-tracks-container').innerHTML = '';
    window.trackCounter = 1;

    // 统一强制使用混搭 UI
    document.getElementById('skin-select').style.display = 'none';
    document.getElementById('skin-list').style.display = 'block';

    // 定义加载完成后的回调
    window.onSpineLoaded = function() {
        if(window.effectSystem) window.effectSystem.scanEvents();
    };

    const ts = Date.now();
    window.viewerConfig.currentLoadId = ts;

    // Official runtime + version adapter. See public/vendor/spine/versions.json.
    const runtimeKey = version.startsWith("3.6") ? "3.6"
        : version.startsWith("3.7") ? "3.7"
        : version.startsWith("3.8") ? "3.8"
        : version.startsWith("4.0") ? "4.0"
        : version.startsWith("4.2") ? "4.2"
        : "4.1";
    const entry = {
        "3.6": "startSpine36",
        "3.7": "startSpine37",
        "3.8": "startSpine38",
        "4.0": "startSpine40",
        "4.1": "startSpine41",
        "4.2": "startSpine42",
    }[runtimeKey];

    const base = window.__ASSET_BASE__ || "/";
    const runtimeUrl = `${base}vendor/spine/${runtimeKey}/spine-webgl.js?t=${ts}`;
    const logicUrl = `${base}runtime/logic/logic_${runtimeKey}.js?t=${ts}`;

    loadScript(runtimeUrl, () => {
        loadScript(logicUrl, () => {
            const start = window[entry];
            if (start) start(newCanvas, files);
            else alert(`缺少版本适配器: ${entry}`);
        });
    });
}

window.loadScript = function(src, callback) {
    let script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    script.onerror = () => alert(`无法加载脚本: ${src}`);
    document.head.appendChild(script);
}

window.detectJsonVersion = function(file) {
    return new Promise(async r => {
        try {
            const text = await window.readFileAsText(file);
            const o = JSON.parse(text); 
            r(o.skeleton ? o.skeleton.spine : null); 
        } catch { r(null); }
    });
}

window.detectBinaryVersion = function(file) {
    return new Promise(async r => {
        const buffer = await window.readFileAsArrayBuffer(file);
        const header = buffer.slice(0, 1024); 
        const v = new DataView(header);
        let s = "";
        for(let i=0; i<v.byteLength; i++) {
            let c = v.getUint8(i);
            if(c>=32 && c<=126) s+=String.fromCharCode(c); else s+=" ";
        }
        let m = s.match(/(\d+\.\d+)(\.\d+)?/);
        if(m) {
            let ver = m[1];
            console.log("Detected Version:", m[0]);
            if(ver === "3.6") r(m[0]); // 识别 3.6
            else if(ver === "3.7") r(m[0]); 
            else if(ver === "3.8") r(m[0]);
            else if(ver === "4.0") r(m[0]);
            else if(ver === "4.2") r(m[0]);
            else r("4.1");
        } else {
            console.warn("Version not detected");
            r(null);
        }
    });
}
