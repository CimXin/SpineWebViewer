// ==========================================
// Spine 3.7 渲染逻辑 (Clone from 3.8, adapted for 3.7)
// ==========================================

var canvas, gl, shader, batcher, mvp, skeletonRenderer;
var skeleton, animationState;
var lastTime = Date.now();
var camX=0, camY=0, camZoom=1.0;

function startSpine37(canvasElement, files) {
    if(window.viewerConfig.animRequestId) cancelAnimationFrame(window.viewerConfig.animRequestId);

    canvas = canvasElement;
    gl = canvas.getContext("webgl", { alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    
    if(!gl) return;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    
    // Spine 3.7 WebGL Runtime differences:
    // Some classes might be in different namespaces or have different constructors.
    // Assuming spine-webgl-3.7.js exposes 'spine' global similar to 3.8 but check for 'webgl' namespace.
    
    if (!spine.webgl) {
        console.error("Spine 3.7 WebGL runtime not loaded properly.");
        return;
    }

    shader = spine.webgl.Shader.newTwoColoredTextured(gl);
    batcher = new spine.webgl.PolygonBatcher(gl);
    mvp = new spine.webgl.Matrix4();
    skeletonRenderer = new spine.webgl.SkeletonRenderer(gl);
    
    skeletonRenderer.premultipliedAlpha = true; 
    addPmaToggle37();
    loadFiles37(files);
}

function addPmaToggle37() {
    const chk = document.getElementById('chk-pma');
    if (chk) {
        // 恢复默认勾选
        chk.checked = true;
        window.viewerConfig.pmaEnabled = true;
        
        chk.onchange = (e) => {
            window.viewerConfig.pmaEnabled = e.target.checked;
        };
    }
}

async function loadFiles37(files) {
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
            
            const texture = new spine.webgl.GLTexture(gl, img);
            const spineAtlas = new spine.TextureAtlas(atlasText, (path) => texture);
            const atlasLoader = new spine.AtlasAttachmentLoader(spineAtlas);
            
            let skeletonData;
            // Note: Spine 3.7 JS runtime usually doesn't support Binary (.skel) officially in the web version 
            // unless using a specific third-party port or if the official one added it later.
            // Official spine-ts 3.7 does NOT support binary.
            // We will try JSON.
            
            if(map.type === 'binary') {
                alert("Spine 3.7 WebGL 官方运行时不支持二进制 (.skel) 文件。\n请使用 JSON 格式导出，或转换为 JSON。");
                return;
            } else {
                const text = await readFileAsText(map.main);
                const skeletonJson = new spine.SkeletonJson(atlasLoader);
                skeletonJson.scale = 1.0;
                skeletonData = skeletonJson.readSkeletonData(JSON.parse(text));
            }
            
            setupSkeleton37(skeletonData);
            
            document.getElementById('ui').style.display = 'block';
            document.getElementById('controls').style.display = 'flex';
            document.getElementById('version-label').innerText = "Spine 3.7 (JSON Only)";
            document.getElementById('version-label').style.color = "#ffaa00";
            
            if(window.viewerConfig.animRequestId) cancelAnimationFrame(window.viewerConfig.animRequestId);
            render37();
        };
        img.src = imgUrl;

    } catch(e) {
        alert("3.7 加载错误: " + e);
        console.error(e);
    }
}

function setupSkeleton37(skeletonData) {
    skeleton = new spine.Skeleton(skeletonData);
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform();
    skeleton.x = 0; skeleton.y = 0;
    
    window.skeleton = skeleton;
    window.spineInstance = { skeleton: skeleton, state: animationState, gl: gl };

    var stateData = new spine.AnimationStateData(skeleton.data);
    animationState = new spine.AnimationState(stateData);
    window.animationState = animationState;

    const animSelect = document.getElementById('anim-select');
    animSelect.innerHTML = "";
    skeleton.data.animations.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name; opt.text = a.name; animSelect.appendChild(opt);
    });
    if(skeleton.data.animations.length > 0) animationState.setAnimation(0, skeleton.data.animations[0].name, true);
    
    // === 3.7 皮肤混搭逻辑 ===
    // Similar to 3.8
    const skinNames = skeleton.data.skins.map(s => s.name);
    const defaultSkinName = skeleton.data.defaultSkin ? skeleton.data.defaultSkin.name : (skinNames.length > 0 ? skinNames[0] : null);

    if(window.populateSkinList) {
        window.populateSkinList(skinNames, defaultSkinName);
    }

    window.updateMixSkin = function(activeSkinNames) {
        if (!skeleton) return;

        if (!activeSkinNames || activeSkinNames.length === 0) {
            skeleton.setSkin(null);
        } else if (activeSkinNames.length === 1) {
            skeleton.setSkinByName(activeSkinNames[0]);
        } else {
            // Spine 3.7 Skin API might differ slightly, but let's try the 3.8 approach
            // In 3.7, Skin constructor might just take name.
            const newMixSkin = new spine.Skin("mixed-skin");
            activeSkinNames.forEach(skinName => {
                const originalSkin = skeleton.data.findSkin(skinName);
                if (originalSkin) {
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
        
        if(animationState) animationState.apply(skeleton);
        skeleton.updateWorldTransform();
    };

    if (defaultSkinName && window.updateMixSkin) {
        window.updateMixSkin([defaultSkinName]);
    }

    animSelect.onchange = () => animationState.setAnimation(0, animSelect.value, true);
    
    bindControls37();
    updateControls37();
    
    // 触发加载完成回调 (Spine 3.7 初始化完成)
    if(window.onSpineLoaded) window.onSpineLoaded();
}

function render37() {
    window.viewerConfig.animRequestId = requestAnimationFrame(render37);

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
    
    delta *= (window.viewerConfig.speed || 1.0);
    
    const isExporting = window.viewerConfig.isExporting;
    
    if (!isExporting) {
        if(canvas.width !== window.innerWidth) canvas.width = window.innerWidth;
        if(canvas.height !== window.innerHeight) canvas.height = window.innerHeight;
    }
    
    let w = canvas.width;
    let h = canvas.height;
    gl.viewport(0, 0, w, h);
    
    if (isExporting) {
        gl.clearColor(0, 0, 0, 0);
    } else {
        const bg = window.viewerConfig ? window.viewerConfig.bgColor : [0.2, 0.2, 0.2, 1];
        gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);

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
        
        if (window.viewerConfig) {
             skeletonRenderer.premultipliedAlpha = window.viewerConfig.pmaEnabled;
        }

        batcher.begin(shader);
        skeletonRenderer.draw(batcher, skeleton);
        batcher.end();
        shader.unbind();

        if(!isExporting) {
            if(window.debugRenderer && window.viewerConfig.showBones) {
                window.debugRenderer.drawBones(skeleton, camX, camY, camZoom, h);
            } else if(window.debugRenderer) {
                window.debugRenderer.drawBones(null, 0,0,1,0); 
            }
        }
    }
}

function updateControls37() {
    document.getElementById('posX').value = skeleton.x;
    document.getElementById('posY').value = skeleton.y;
}

function bindControls37() {
    const inputX = document.getElementById('posX');
    const inputY = document.getElementById('posY');
    inputX.oninput = () => { if(skeleton) skeleton.x = parseFloat(inputX.value); };
    inputY.oninput = () => { if(skeleton) skeleton.y = parseFloat(inputY.value); };
    
    window.resetView = function() {
        skeleton.x = 0; skeleton.y = 0;
        camX=0; camY=0; camZoom=1.0;
        updateControls37();
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
