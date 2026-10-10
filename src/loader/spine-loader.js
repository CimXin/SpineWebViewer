window.loadSpineGroup = async function(files, forceVersion = null) {
    window.currentSpineFiles = files;
    const ts = Date.now();
    window.viewerConfig.currentLoadId = ts;

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

    // 重置状态。运行时对象按版本缓存，这里不要清掉。
    window.skeleton = null;
    window.animationState = null;
    if(window.debugRenderer) window.debugRenderer.drawBones(null, 0,0,1,0);
    if(window.refreshBoneTree) window.refreshBoneTree();
    if(window.debugTools) window.debugTools.refresh();

    log(window.t("status.prepare"), "status.prepare");
    document.getElementById('file-panel').style.display = 'flex';
    const dropZoneEarly = document.getElementById('drop-zone');
    if (dropZoneEarly && dropZoneEarly.style.display !== 'none') {
        dropZoneEarly.style.opacity = 0;
        window.__dropZoneToken = (window.__dropZoneToken || 0) + 1;
        const earlyToken = window.__dropZoneToken;
        setTimeout(() => {
            if (window.__dropZoneToken !== earlyToken) return;
            dropZoneEarly.style.display = 'none';
        }, 200);
    }

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
    
    log(window.t("status.loadingSpine", { v: version }), "status.loadingSpine", { v: version });
    
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
    const autoOpt = vSelect.options[0];
    if(!matched) {
        autoOpt.dataset.detected = version;
        autoOpt.removeAttribute("data-i18n");
        autoOpt.textContent = window.t("version.detected", { v: version });
        vSelect.value = "";
    } else if (autoOpt.dataset.detected) {
        delete autoOpt.dataset.detected;
        autoOpt.setAttribute("data-i18n", "version.auto");
        autoOpt.textContent = window.t("version.auto");
    }
    
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
        if(window.refreshBoneTree) window.refreshBoneTree();
        if(window.debugTools) window.debugTools.refresh();
    };

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

    try {
        await ensureSpineRuntime(runtimeKey);
        await ensureSpineLogic(runtimeKey);
    } catch (err) {
        alert(window.t("status.script", { msg: err.message || err }));
        return;
    }
    if (window.viewerConfig.currentLoadId !== ts) return;
    window.spine = window.__spineRuntimes[runtimeKey];
    const start = window[entry];
    if (start) start(newCanvas, files);
    else alert(window.t("status.missingAdapter", { entry: entry }));
}

const spineRuntimePromises = {};
const spineLogicPromises = {};

function loadClassicScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(src));
        document.head.appendChild(script);
    });
}

function ensureSpineRuntime(runtimeKey) {
    if (!window.__spineRuntimes) window.__spineRuntimes = {};
    if (window.__spineRuntimes[runtimeKey]) {
        window.spine = window.__spineRuntimes[runtimeKey];
        return Promise.resolve();
    }
    if (!spineRuntimePromises[runtimeKey]) {
        const base = window.__ASSET_BASE__ || "/";
        const url = `${base}vendor/spine/${runtimeKey}/spine-webgl.js`;
        spineRuntimePromises[runtimeKey] = fetch(url).then((res) => {
            if (!res.ok) throw new Error(url);
            return res.text();
        }).then((code) => {
            // 3.x/4.1 会写进已经存在的全局 spine。先清掉，避免和另一版本的 class 混在同一个对象上。
            window.spine = undefined;
            const script = document.createElement("script");
            script.textContent = code;
            document.head.appendChild(script);
            window.__spineRuntimes[runtimeKey] = window.spine;
        });
    }
    return spineRuntimePromises[runtimeKey].then(() => {
        window.spine = window.__spineRuntimes[runtimeKey];
    });
}

function ensureSpineLogic(runtimeKey) {
    const entry = {
        "3.6": "startSpine36",
        "3.7": "startSpine37",
        "3.8": "startSpine38",
        "4.0": "startSpine40",
        "4.1": "startSpine41",
        "4.2": "startSpine42",
    }[runtimeKey];
    if (entry && typeof window[entry] === "function") return Promise.resolve();
    if (!spineLogicPromises[runtimeKey]) {
        const base = window.__ASSET_BASE__ || "/";
        spineLogicPromises[runtimeKey] = loadClassicScript(`${base}runtime/logic/logic_${runtimeKey}.js`);
    }
    return spineLogicPromises[runtimeKey];
}

window.loadScript = function(src, callback) {
    loadClassicScript(src).then(callback, () => alert(window.t("status.script", { msg: src })));
}

window.detectJsonVersion = async function(file) {
    try {
        const head = await window.readFileAsText(file.slice(0, 8192));
        const match = head.match(/"spine"\s*:\s*"([^"]+)"/);
        if (match) return match[1];
        const text = await window.readFileAsText(file);
        const data = JSON.parse(text);
        return data.skeleton ? data.skeleton.spine : null;
    } catch {
        return null;
    }
}

window.detectBinaryVersion = async function(file) {
    try {
        const buffer = await window.readFileAsArrayBuffer(file.slice(0, 1024));
        const v = new DataView(buffer);
        let s = "";
        for(let i=0; i<v.byteLength; i++) {
            let c = v.getUint8(i);
            if(c>=32 && c<=126) s+=String.fromCharCode(c); else s+=" ";
        }
        let m = s.match(/(\d+\.\d+)(\.\d+)?/);
        if(m) {
            let ver = m[1];
            console.log("Detected Version:", m[0]);
            if(ver === "3.6" || ver === "3.7" || ver === "3.8" || ver === "4.0" || ver === "4.2") return m[0];
            return "4.1";
        }
        console.warn("Version not detected");
        return null;
    } catch {
        return null;
    }
}
