// ==========================================
// Spine 3.8 渲染逻辑 (Timeline + DebugDraw)
// ==========================================

var canvas, gl, shader, batcher, mvp, skeletonRenderer;
var skeleton, animationState;
var lastTime = Date.now();
var camX=0, camY=0, camZoom=1.0;
// var rendererRequestId = 0; // 移除局部变量

function startSpine38(canvasElement, files) {
    // 强制停止之前的循环 (双重保险，防止 index.html 没有清理干净)
    if(window.viewerConfig.animRequestId) cancelAnimationFrame(window.viewerConfig.animRequestId);

    canvas = canvasElement;
    // 关键修改：开启 alpha 通道，并设置 premultipliedAlpha: false
    // 这告诉浏览器：Canvas 的内容是 Straight Alpha 的（未预乘）。
    // 即使我们画的是 PMA 数据，如果浏览器认为它是 PMA 并在合成时不再处理，就会导致透明边缘黑边。
    // 这里设为 false，是为了让浏览器在合成到网页背景时，帮我们处理好边缘混合。
    gl = canvas.getContext("webgl", { alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    
    // 如果 Context 丢失 (因为 Canvas 被移除)，直接返回
    if(!gl) return;

    // === 关键：全局禁用 WebGL 自动预乘 ===
    // 我们的纹理已经是 PMA 的了，所以不能让 WebGL 再乘一次。
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    
    // 移除之前的 gl.blendFunc Hack，回归标准流程

    shader = spine.webgl.Shader.newTwoColoredTextured(gl);
    batcher = new spine.webgl.PolygonBatcher(gl);
    mvp = new spine.webgl.Matrix4();
    skeletonRenderer = new spine.webgl.SkeletonRenderer(gl);
    
    skeletonRenderer.premultipliedAlpha = !!(window.viewerConfig && window.viewerConfig.pmaEnabled);
    addPmaToggle38();
    loadFiles38(files);
}

function addPmaToggle38() {
    const chk = document.getElementById('chk-pma');
    if (chk) {
        window.viewerConfig.pmaEnabled = chk.checked;
        chk.onchange = (e) => {
            window.viewerConfig.pmaEnabled = e.target.checked;
        };
    }
}

async function loadFiles38(files) {
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
            
            // 确保不预乘 (防止黑边) -> 修正：根据用户设置动态决定
            const unpack = window.viewerConfig.unpackEnabled || false;
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, unpack);
            
            const texture = new spine.webgl.GLTexture(gl, img);
            const spineAtlas = new spine.TextureAtlas(atlasText, (path) => texture);
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
                skeletonData = skeletonJson.readSkeletonData(JSON.parse(text));
            }
            
            setupSkeleton38(skeletonData);
            
            document.getElementById('ui').style.display = 'block';
            document.getElementById('controls').style.display = 'flex';
            document.getElementById('version-label').innerText = "Spine 3.8 (Binary/JSON)";
            document.getElementById('version-label').style.color = "#ff0055";
            
            if(window.viewerConfig.animRequestId) cancelAnimationFrame(window.viewerConfig.animRequestId);
            render38();
        };
        img.src = imgUrl;

    } catch(e) {
        alert("3.8 加载错误: " + e);
        console.error(e);
    }
}

function setupSkeleton38(skeletonData) {
    skeleton = new spine.Skeleton(skeletonData);
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform();
    skeleton.x = 0; skeleton.y = 0;
    
    // 显式绑定到全局变量
    window.skeleton = skeleton;
    
    // 暴露实例供导出使用
    window.spineInstance = { skeleton: skeleton, state: animationState, gl: gl };

    var stateData = new spine.AnimationStateData(skeleton.data);
    animationState = new spine.AnimationState(stateData);
    
    // 显式绑定到全局变量
    window.animationState = animationState;

    const animSelect = document.getElementById('anim-select');
    animSelect.innerHTML = "";
    skeleton.data.animations.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name; opt.text = a.name; animSelect.appendChild(opt);
    });
    if(skeleton.data.animations.length > 0) animationState.setAnimation(0, skeleton.data.animations[0].name, true);
    
    // === 3.8 皮肤混搭逻辑 ===
    const skinNames = skeleton.data.skins.map(s => s.name);
    const defaultSkinName = skeleton.data.defaultSkin ? skeleton.data.defaultSkin.name : (skinNames.length > 0 ? skinNames[0] : null);

    // 调用 index.html 中的 populateSkinList (渲染 Checkbox List)
    if(window.populateSkinList) {
        window.populateSkinList(skinNames, defaultSkinName);
    }

    // 实现混搭接口
    window.updateMixSkin = function(activeSkinNames) {
        if (!skeleton) return;

        // 如果没有选中任何皮肤，清空皮肤
        if (!activeSkinNames || activeSkinNames.length === 0) {
            skeleton.setSkin(null);
        } else if (activeSkinNames.length === 1) {
            // 如果只选了一个，直接使用该皮肤
            skeleton.setSkinByName(activeSkinNames[0]);
        } else {
            // 多个皮肤混搭：手动创建新皮肤并复制附件
            const newMixSkin = new spine.Skin("mixed-skin");
            activeSkinNames.forEach(skinName => {
                const originalSkin = skeleton.data.findSkin(skinName);
                if (originalSkin) {
                    // Manually copy attachments for Spine 3.8
                    for (let i = 0; i < originalSkin.attachments.length; i++) {
                        const slotAttachments = originalSkin.attachments[i];
                        if (slotAttachments) {
                            for (let attachmentName in slotAttachments) {
                                const attachment = slotAttachments[attachmentName];
                                if (attachment) {
                                    newMixSkin.addAttachment(i, attachmentName, attachment);
                                }
                            }
                        }
                    }
                }
            });
            skeleton.setSkin(newMixSkin);
        }
        
        skeleton.setSlotsToSetupPose();
        skeleton.setToSetupPose();
        
        // 关键：重新应用动画，防止重置后角色不动
        if(animationState) animationState.apply(skeleton);
        skeleton.updateWorldTransform();
    };

    // 初始化：如果有默认皮肤，应用一次
    if (defaultSkinName && window.updateMixSkin) {
        window.updateMixSkin([defaultSkinName]);
    }

    animSelect.onchange = () => animationState.setAnimation(0, animSelect.value, true);
    // skinSelect.onchange 已废弃，由 updateMixSkin 接管
    
    bindControls38();
    updateControls38();
    
    // 触发加载完成回调 (Spine 3.8 初始化完成)
    if(window.onSpineLoaded) window.onSpineLoaded();
}

function render38() {
    window.viewerConfig.animRequestId = requestAnimationFrame(render38);

    // 检查 canvas 是否还存在于 DOM 中 (防止僵尸循环)
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
        // 只有非导出模式下才跟随窗口大小
        if(canvas.width !== window.innerWidth) canvas.width = window.innerWidth;
        if(canvas.height !== window.innerHeight) canvas.height = window.innerHeight;
    }
    
    let w = canvas.width;
    let h = canvas.height;
    gl.viewport(0, 0, w, h);
    
    if (isExporting) {
        gl.clearColor(0, 0, 0, 0); // 强制全透明
    } else {
        const bg = window.viewerConfig ? window.viewerConfig.bgColor : [0.2, 0.2, 0.2, 1];
        gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);

    // === 关键修复：同步 PMA 设置 ===
    // 确保每一帧都从全局配置读取 PMA 状态，并应用到 skeletonRenderer
    if (window.viewerConfig) {
        skeletonRenderer.premultipliedAlpha = window.viewerConfig.pmaEnabled;
    }

    if (skeleton && animationState) {
        const ctrl = window.animControl;
        let track = animationState.tracks[0];
        
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
        
        shader.bind();
        mvp.ortho2d(camX - w/2/camZoom, camY - h/2/camZoom, w/camZoom, h/camZoom);
        shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, mvp.values);
        shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
        
        // 关键修复：不要手动调用 gl.blendFunc，因为 skeletonRenderer.draw 会根据 Slot 模式自己设置
        // 我们只需要确保 skeletonRenderer.premultipliedAlpha 是对的
        if (window.viewerConfig) {
             skeletonRenderer.premultipliedAlpha = window.viewerConfig.pmaEnabled;
        }

        batcher.begin(shader);
        skeletonRenderer.draw(batcher, skeleton);
        batcher.end();
        shader.unbind();

        // === 绘制骨骼调试线 (导出时不绘制) ===
        if(!isExporting && window.debugRenderer) {
            window.debugRenderer.drawBones(skeleton, camX, camY, camZoom, h);
        }
    }
}

function updateControls38() {
    document.getElementById('posX').value = skeleton.x;
    document.getElementById('posY').value = skeleton.y;
}

function bindControls38() {
    const inputX = document.getElementById('posX');
    const inputY = document.getElementById('posY');
    inputX.oninput = () => { if(skeleton) skeleton.x = parseFloat(inputX.value); };
    inputY.oninput = () => { if(skeleton) skeleton.y = parseFloat(inputY.value); };
    
    window.resetView = function() {
        skeleton.x = 0; skeleton.y = 0;
        camX=0; camY=0; camZoom=1.0;
        updateControls38();
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
            camX -= (e.clientX - startX) / camZoom;
            camY += (e.clientY - startY) / camZoom;
            startX = e.clientX; startY = e.clientY;
        } else if(isRightDrag) {
            let dy = e.clientY - startY;
            let newZoom = camZoom * (1 + dy * 0.01);
            if(newZoom > 0.1 && newZoom < 10) camZoom = newZoom;
            startY = e.clientY;
        }
    };
    canvas.onwheel = e => {
        let newZoom = camZoom * (e.deltaY > 0 ? 0.9 : 1.1);
        if(newZoom > 0.1 && newZoom < 10) camZoom = newZoom;
    };
}
