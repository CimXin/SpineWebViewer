// ==========================================
// Spine 4.1 渲染逻辑 (Timeline + DebugDraw)
// ==========================================

var canvas, gl, renderer, assetManager, skeleton, animationState;
var lastTime = Date.now();
var rendererRequestId = 0;

function startSpine41(canvasElement, files) {
    if(window.viewerConfig.animRequestId) cancelAnimationFrame(window.viewerConfig.animRequestId);

    // 重置时间戳，防止 delta 过大
    lastTime = Date.now();

    canvas = canvasElement;
    // 关键修复：添加 premultipliedAlpha: false，解决半透明黑边问题
    gl = canvas.getContext("webgl", { alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    
    if(!gl) return;
    
    // 确保 WebGL 不自动预乘 (因为 PMA 图片本身已经是预乘过的)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    renderer = new spine.SceneRenderer(canvas, gl);
    assetManager = new spine.AssetManager(gl); 
    
    renderer.premultipliedAlpha = true; 
    addPmaToggle41();
    loadFiles41(files);
}

function addPmaToggle41() {
    // 适配新版 UI：直接复用 index.html 的 chk-pma，不再重复创建
    const chk = document.getElementById('chk-pma');
    if (chk) {
        // 绑定事件
        chk.onchange = (e) => {
            window.viewerConfig.pmaEnabled = e.target.checked;
            if(renderer) {
                renderer.premultipliedAlpha = e.target.checked;
            }
        };
        // 初始化
        window.viewerConfig.pmaEnabled = chk.checked;
        if(renderer) renderer.premultipliedAlpha = chk.checked;
    }
}

async function loadFiles41(files) {
    const myLoadId = window.viewerConfig.currentLoadId;
    let map = { atlas: null, png: null, main: null, type: null };
    for(let f of files) {
        let name = f.name.toLowerCase();
        if(name.endsWith('.atlas') || name.endsWith('.atlas.txt')) map.atlas = f;
        else if(name.endsWith('.png') || name.endsWith('.jpg')) map.png = f;
        else if(name.endsWith('.skel') || name.endsWith('.skel.bytes')) { map.main = f; map.type = 'binary'; }
        else if(name.endsWith('.json') || name.endsWith('.json.txt')) { map.main = f; map.type = 'json'; }
    }

    try {
        const atlasText = await readFileAsText(map.atlas);
        const imgUrl = await readFileAsDataURL(map.png);
        
        const img = new Image();
        img.onload = async () => {
            if(window.viewerConfig.currentLoadId !== myLoadId) return;
            
            // 根据用户设置决定是否让 WebGL 自动预乘 Alpha
            const unpack = window.viewerConfig.unpackEnabled || false;
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, unpack);
            
            const texture = new spine.GLTexture(gl, img);
            const spineAtlas = new spine.TextureAtlas(atlasText, (path) => texture);
            
            for (let i = 0; i < spineAtlas.pages.length; i++) {
                spineAtlas.pages[i].texture = texture;
                spineAtlas.pages[i].width = img.width;
                spineAtlas.pages[i].height = img.height;
            }
            
            const atlasLoader = new spine.AtlasAttachmentLoader(spineAtlas);
            let skeletonData;
            
            if(map.type === 'binary') {
                const buffer = await readFileAsArrayBuffer(map.main);
                const skeletonBinary = new spine.SkeletonBinary(atlasLoader);
                skeletonBinary.scale = 1.0;
                skeletonData = skeletonBinary.readSkeletonData(new Uint8Array(buffer));
            } else {
                const text = await readFileAsText(map.main);
                const skeletonJson = new spine.SkeletonJson(atlasLoader);
                skeletonJson.scale = 1.0;
                const jsonObj = JSON.parse(text);
                if(jsonObj.skeleton) jsonObj.skeleton.images = ""; 
                skeletonData = skeletonJson.readSkeletonData(jsonObj);
            }
            
            setupSkeleton41(skeletonData);
            
            document.getElementById('ui').style.display = 'block';
            document.getElementById('controls').style.display = 'flex';
            document.getElementById('version-label').innerText = "Spine 4.1 (Binary/JSON)";
            document.getElementById('version-label').style.color = "#00e5ff";

            if(rendererRequestId) cancelAnimationFrame(rendererRequestId);
            requestAnimationFrame(render41);
        };
        img.src = imgUrl;

    } catch(e) {
        alert("4.1 加载错误: " + e);
        console.error(e);
    }
}

function setupSkeleton41(skeletonData) {
    skeleton = new spine.Skeleton(skeletonData);
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform();
    skeleton.x = 0; skeleton.y = -500; 
    
    // 显式绑定到全局变量，确保 UI 能控制
    window.skeleton = skeleton;
    
    renderer.camera.position.x = 0;
    renderer.camera.position.y = 0;
    renderer.camera.zoom = 1.0;
    
    var stateData = new spine.AnimationStateData(skeleton.data);
    animationState = new spine.AnimationState(stateData);
    
    // 显式绑定到全局变量
    window.animationState = animationState;
    
    // 暴露实例供导出使用
    window.spineInstance = { skeleton: skeleton, state: animationState, gl: gl, renderer: renderer };

    const animSelect = document.getElementById('anim-select');
    animSelect.innerHTML = "";
    skeleton.data.animations.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name; opt.text = a.name; animSelect.appendChild(opt);
    });
    if(skeleton.data.animations.length > 0) animationState.setAnimation(0, skeleton.data.animations[0].name, true);
    
    // === 皮肤混搭逻辑 (全版本通用) ===
    const skinNames = skeleton.data.skins.map(s => s.name);
    // 默认皮肤通常是 "default"，如果没有则选第一个
    const defaultSkin = skeleton.data.defaultSkin ? skeleton.data.defaultSkin.name : (skinNames.length > 0 ? skinNames[0] : "");
    
    // 调用 index.html 提供的填充列表函数
    if(window.populateSkinList) {
        window.populateSkinList(skinNames, defaultSkin);
    }
    
    // 定义混搭更新函数 (供 Checkbox 回调)
    window.updateMixSkin = function(activeSkinNames) {
        if (!skeleton) return;
        
        // 1. 如果没有选中任何皮肤，还原为默认皮肤 (或清空)
        // 关键修复：避免什么都不显示
        if (!activeSkinNames || activeSkinNames.length === 0) {
            // 尝试还原到默认皮肤，如果没有默认皮肤则设为 null
            const def = skeleton.data.defaultSkin;
            if (def) skeleton.setSkin(def); 
            else skeleton.setSkin(null);
            
            skeleton.setSlotsToSetupPose();
            return;
        }
        
        // 2. 创建一个新的混合皮肤
        const newSkin = new spine.Skin("custom-mix");
        
        activeSkinNames.forEach(name => {
            const s = skeleton.data.findSkin(name);
            if (s) newSkin.addSkin(s);
        });
        
        // 3. 应用皮肤
        skeleton.setSkin(newSkin);
        skeleton.setSlotsToSetupPose();
        skeleton.setToSetupPose();
    };
    
    // 初始调用一次，应用默认皮肤
    if(window.updateMixSkin) window.updateMixSkin([defaultSkin]);

    animSelect.onchange = () => animationState.setAnimation(0, animSelect.value, true);
    
    bindControls41();
    updateControls41();
    
    // 触发加载完成回调 (Spine 4.1 初始化完成)
    if(window.onSpineLoaded) window.onSpineLoaded();
}

function render41() {
    // 将 requestId 存储到全局配置中
    window.viewerConfig.animRequestId = requestAnimationFrame(render41);

    // 检查 canvas 是否还存在于 DOM 中
    if(!canvas.parentElement) {
        cancelAnimationFrame(window.viewerConfig.animRequestId);
        return;
    }

    let now = Date.now();
    const targetFps = window.viewerConfig.targetFps || 30;
    const interval = 1000 / targetFps;
    const elapsed = now - lastTime;
    
    if (elapsed < interval) return;

    lastTime = now - (elapsed % interval);
    let delta = elapsed / 1000;

    // 应用倍速
    delta *= (window.viewerConfig.speed || 1.0);
    
    // === 导出模式判断 ===
    const isExporting = window.viewerConfig.isExporting;

    if (!isExporting) {
        let w = window.innerWidth;
        let h = window.innerHeight;
        if(canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
    }
    
    let w = canvas.width;
    let h = canvas.height;
    gl.viewport(0, 0, w, h);
    
    if(renderer.camera.viewportWidth !== w || renderer.camera.viewportHeight !== h) {
        renderer.camera.viewportWidth = w;
        renderer.camera.viewportHeight = h;
        renderer.camera.update();
    }
    
    if (isExporting) {
        gl.clearColor(0, 0, 0, 0); // 强制全透明
    } else {
        const bg = window.viewerConfig ? window.viewerConfig.bgColor : [0.2, 0.2, 0.2, 1];
        gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);

    // === 关键修复：同步 PMA 设置 ===
    // 确保每一帧都从全局配置读取 PMA 状态，并应用到 renderer
    if (renderer && window.viewerConfig) {
        renderer.premultipliedAlpha = window.viewerConfig.pmaEnabled;
    }

    if (skeleton && animationState) {
        const ctrl = window.animControl;
        let track = animationState.getCurrent(0); 
        
        if (track) {
            if (ctrl) ctrl.updateUI(track.trackTime, track.animation.duration);
            if (ctrl && ctrl.isScrubbing && ctrl.targetTime >= 0) {
                track.trackTime = ctrl.targetTime;
            } 
            else if (ctrl && !ctrl.isPlaying) {
                animationState.update(0); 
            }
            else {
                animationState.update(delta);
            }
        } else {
            animationState.update(delta);
        }

        animationState.apply(skeleton);
        skeleton.updateWorldTransform();
        renderer.begin();
        renderer.drawSkeleton(skeleton, true);
        renderer.end();

        // === 绘制骨骼调试线 (导出时不绘制) ===
        if(!isExporting && window.debugRenderer) {
            window.debugRenderer.drawBones(
                skeleton,
                renderer.camera.position.x,
                renderer.camera.position.y,
                renderer.camera.zoom,
                h
            );
        }
    }
}

function updateControls41() {
    document.getElementById('posX').value = skeleton.x;
    document.getElementById('posY').value = skeleton.y;
}

function bindControls41() {
    const inputX = document.getElementById('posX');
    const inputY = document.getElementById('posY');
    inputX.oninput = () => { if(skeleton) skeleton.x = parseFloat(inputX.value); };
    inputY.oninput = () => { if(skeleton) skeleton.y = parseFloat(inputY.value); };
    
    window.resetView = function() {
        skeleton.x = 0; skeleton.y = -500;
        renderer.camera.position.x = 0; renderer.camera.position.y = 0; renderer.camera.zoom = 1.0;
        updateControls41();
    };

    let isDragging=false, startX, startY, isRightDrag=false;
    canvas.oncontextmenu = e => e.preventDefault();
    canvas.onmousedown = e => { 
        if(e.button === 2) isRightDrag = true; else isDragging = true; 
        startX = e.clientX; startY = e.clientY; 
    };
    window.onmouseup = () => { isDragging=false; isRightDrag=false; };
    window.onmousemove = e => {
        if(isDragging) {
            renderer.camera.position.x -= (e.clientX - startX) * renderer.camera.zoom;
            renderer.camera.position.y += (e.clientY - startY) * renderer.camera.zoom;
            startX = e.clientX; startY = e.clientY;
        } else if(isRightDrag) {
            let dy = e.clientY - startY;
            let newZoom = renderer.camera.zoom * (1 + dy * 0.01);
            if(newZoom > 0.1 && newZoom < 10) renderer.camera.zoom = newZoom;
            startY = e.clientY;
        }
    };
    canvas.onwheel = e => {
        let newZoom = renderer.camera.zoom * (e.deltaY > 0 ? 1.1 : 0.9);
        if(newZoom > 0.1 && newZoom < 10) renderer.camera.zoom = newZoom;
    };
}
