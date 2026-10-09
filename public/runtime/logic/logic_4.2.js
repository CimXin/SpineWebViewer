// Spine 4.2 逻辑适配器 (基于 V30 + 全局配置 + Timeline + DebugDraw)
window.startSpine42 = async function(canvas, files) {
    console.log("启动 Spine 4.2 引擎...");
    
    // 停止旧循环
    if(window.viewerConfig.animRequestId) cancelAnimationFrame(window.viewerConfig.animRequestId);
    const myLoadId = window.viewerConfig.currentLoadId;

    // =============================================================
    // 动态增强 UI
    // =============================================================
    const uiPanel = document.getElementById('ui');
    
    // 适配新版 UI：绑定现有的 PMA checkbox
    const chkPma = document.getElementById('chk-pma');
    if (chkPma) {
        chkPma.onchange = (e) => {
            // 4.2 可能需要特定的处理，或者只是重绘
            // 这里假设 render loop 会读取 global pma setting
            window.viewerConfig.pmaEnabled = e.target.checked;
        };
    }
    
    // 物理重置按钮保留，但样式微调
    if (!document.getElementById('btn-reset-phy')) {
        const btn = document.createElement('button');
        btn.id = 'btn-reset-phy';
        btn.innerText = "💥 重置物理";
        btn.className = 'btn-export'; // 复用导出按钮的样式
        btn.style.marginTop = '15px';
        btn.style.background = '#880000'; // 特殊颜色
        btn.onclick = () => resetPhysics();
        uiPanel.appendChild(btn);
    }

    // =============================================================
    // 核心变量
    // =============================================================
    const ui = {
        log: (msg, type) => {
            console.log(msg);
            const box = document.getElementById('log');
            if(box) box.innerText = msg;
        },
        updateSliders: () => {
            const sx = document.getElementById('posX');
            const sy = document.getElementById('posY');
            if(sx) sx.value = cam.x;
            if(sy) sy.value = cam.y;
        }
    };

    const Mat4 = {
        create: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
        ortho: (out, l, r, b, t, n, f) => {
            const lr = 1/(l-r), bt = 1/(b-t), nf = 1/(n-f);
            out[0]=-2*lr; out[5]=-2*bt; out[10]=2*nf; out[12]=(l+r)*lr; out[13]=(t+b)*bt; out[14]=(f+n)*nf; out[15]=1;
        }
    };

    let gl, shader, batcher, renderer;
    let skeleton, state, mvp = Mat4.create();
    let lastTime = Date.now();
    let cam = {x:0, y:0, zoom:1.0};
    window.cam42 = cam; // 暴露给导出脚本使用
    let globalTexture = null;
    const Physics = { None: 0, Update: 1, Reset: 2 };

    // =============================================================
    // 初始化 WebGL
    // =============================================================
    try {
        // 重置时间戳，防止 delta 过大
        lastTime = Date.now();

        // 关键修复：添加 premultipliedAlpha: false，解决半透明黑边问题
        gl = canvas.getContext('webgl', { alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
        if(!gl) throw "WebGL 不可用";
        
        // 确保 WebGL 不自动预乘 -> 修正：根据用户设置决定
        const unpack = window.viewerConfig.unpackEnabled || false;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, unpack);

        shader = spine.Shader.newTwoColoredTextured(gl);
        batcher = new spine.PolygonBatcher(gl, true); 
        renderer = new spine.SkeletonRenderer(gl);
        renderer.twoColor = true;
        renderer.premultipliedAlpha = !!(window.viewerConfig && window.viewerConfig.pmaEnabled);
        
        bindInput();
        
        // 开始处理文件
        handleFiles(files);
        
        // 启动循环
        requestAnimationFrame(loop);
        
        // 触发加载完成回调
        if(window.onSpineLoaded) window.onSpineLoaded();
        
    } catch(e) { ui.log("初始化失败: " + e, 'err'); }

    // =============================================================
    // 输入绑定
    // =============================================================
    function bindInput() {
        // 鼠标/滚轮控制
        canvas.onwheel = e => { 
            cam.zoom *= (e.deltaY>0 ? 0.9 : 1.1); 
            if(cam.zoom < 0.1) cam.zoom = 0.1;
            if(cam.zoom > 10) cam.zoom = 10;
        };
        
        let drag=false, lx, ly, isRight=false;
        
        canvas.oncontextmenu = e => e.preventDefault();
        canvas.onmousedown = e => { 
            drag=true; 
            isRight = (e.button === 2);
            lx=e.clientX; ly=e.clientY; 
        };
        window.onmouseup = () => drag=false;
        
        window.onmousemove = e => {
            if(drag) {
                let dx = e.clientX - lx;
                let dy = e.clientY - ly;
                
                if(isRight) {
                    let newZoom = cam.zoom * (1 + dy * 0.005);
                     if(newZoom > 0.1 && newZoom < 10) cam.zoom = newZoom;
                } else {
                    cam.x -= dx / cam.zoom;
                    cam.y += dy / cam.zoom;
                    
                    // 物理惯性
                    if (skeleton) {
                        skeleton.x += dx / cam.zoom;
                        skeleton.y -= dy / cam.zoom;
                    }
                    ui.updateSliders();
                }
                lx = e.clientX; ly = e.clientY;
            }
        };
        
        const sx = document.getElementById('posX');
        const sy = document.getElementById('posY');
        if(sx) sx.oninput = () => cam.x = parseFloat(sx.value);
        if(sy) sy.oninput = () => cam.y = parseFloat(sy.value);

        // 绑定全局归位函数
        window.resetView = function() {
            if(skeleton) {
                // 4.2 需要同时重置摄像机和骨骼位置(如果有物理惯性)
                cam.x = 0; 
                cam.y = -200; // 4.2 默认稍微向下偏移一点
                cam.zoom = 1.0;
                
                // 重置滑块
                if(sx) sx.value = 0;
                if(sy) sy.value = -200;
                
                ui.log("视图已重置");
            }
        };
    }

    function resetPhysics() {
        if(skeleton && spine.Physics) {
            skeleton.updateWorldTransform(spine.Physics.reset);
            ui.log("物理已重置");
        }
    }

    // =============================================================
    // 文件处理
    // =============================================================
    async function handleFiles(fileList) {
        let map = {};
        for(let f of fileList) {
            let n = f.name.toLowerCase();
            if(n.includes('.atlas')) map.atlas = f;
            else if(n.includes('.png') || n.includes('.jpg') || n.includes('.webp')) map.png = f;
            else if(n.includes('.skel') || n.includes('.json')) map.main = f;
        }
        
        if(!map.atlas || !map.png || !map.main) {
            ui.log("文件缺失: 需要 .json/.skel + .atlas + .png", 'err');
            return;
        }

        try {
            const imgBlob = URL.createObjectURL(map.png);
            const img = new Image();
            img.onload = () => {
                if(window.viewerConfig.currentLoadId !== myLoadId) return;
                processSpine(map, img);
            };
            ui.log("正在解码贴图…");
            img.src = imgBlob;
        } catch(e) { ui.log(e, 'err'); }
    }

    async function processSpine(map, img) {
        try {
            ui.log("正在加载 (Spine 4.2)...");
            const atlasText = await readFile(map.atlas, 'text');
            
            globalTexture = new spine.GLTexture(gl, img, false);
            globalTexture.setFilters(gl.LINEAR, gl.LINEAR);
            globalTexture.setWraps(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
            
            const atlas = new spine.TextureAtlas(atlasText, path => globalTexture);
            // 强制修正 Atlas 尺寸
            for(let page of atlas.pages) { page.width = img.width; page.height = img.height; }
            
            const loader = new spine.AtlasAttachmentLoader(atlas);
            let skelData;
            
            if(map.main.name.includes('.skel')) {
                ui.log("解析二进制文件...");
                const buffer = await readFile(map.main, 'array');
                skelData = new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(buffer));
            } else {
                ui.log("解析 JSON 文件...");
                const text = await readFile(map.main, 'text');
                skelData = new spine.SkeletonJson(loader).readSkeletonData(JSON.parse(text));
            }
            
            ui.log(`版本: ${skelData.version}`);

            skeleton = new spine.Skeleton(skelData);
            
            // 显式绑定全局变量
            window.skeleton = skeleton; 
            
            // 自动注入纹理
            let fixCount = 0;
            for(let skin of skeleton.data.skins) {
                let entries = skin.getAttachments ? skin.getAttachments() : skin.attachments;
                for(let entry of entries) {
                    let att = entry ? entry.attachment : null;
                    if(att && att.region) {
                        att.region.texture = globalTexture;
                        att.region.renderObject = att.region;
                        fixCount++;
                    }
                }
            }
            
            skeleton.setToSetupPose();
            if(spine.Physics) skeleton.updateWorldTransform(spine.Physics.reset);

            state = new spine.AnimationState(new spine.AnimationStateData(skelData));
            
            // 显式绑定全局变量
            window.animationState = state;
            
            // 暴露实例供导出使用
            window.spineInstance = { skeleton: skeleton, state: state, gl: gl, renderer: renderer };
            
            setupUI(skelData); 
            
            // 预热两帧
            state.update(0); state.apply(skeleton); skeleton.updateWorldTransform(spine.Physics.update);
            state.update(0); state.apply(skeleton); skeleton.updateWorldTransform(spine.Physics.update);
            
            // 自动对焦
            const offset = new spine.Vector2(), size = new spine.Vector2();
            skeleton.getBounds(offset, size, []);
            if(size.x > 0) {
                cam.x = offset.x + size.x/2;
                cam.y = offset.y + size.y/2;
                cam.zoom = Math.min(canvas.width/size.x, canvas.height/size.y) * 0.8;
            } else {
                 cam.x = 0; cam.y = -200; 
            }
            ui.updateSliders();
            
            // 显示UI
            document.getElementById('ui').style.display = 'block';
            document.getElementById('controls').style.display = 'flex';
            if(window.refreshBoneTree) window.refreshBoneTree();
            
        } catch(e) { ui.log(e.message, 'err'); }
    }

    function setupUI(data) {
        const animSelect = document.getElementById('anim-select');
        // 4.2 适配：不再使用 skinSelect，改为 populateSkinList
        // const skinSelect = document.getElementById('skin-select');
        if(!animSelect) return;

        animSelect.innerHTML = "";
        // skinSelect.innerHTML = "";

        data.animations.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.name; opt.text = a.name; animSelect.appendChild(opt);
        });
        
        if(data.animations.length > 0) {
            state.setAnimation(0, data.animations[0].name, true);
        }

        // === 皮肤混搭逻辑 (全版本通用) ===
        const skinNames = data.skins.map(s => s.name);
        const defaultSkin = data.defaultSkin ? data.defaultSkin.name : (skinNames.length > 0 ? skinNames[0] : "");

        if(window.populateSkinList) {
            window.populateSkinList(skinNames, defaultSkin);
        }

        // 定义混搭更新函数
        window.updateMixSkin = function(activeSkinNames) {
            if (!skeleton) return;
            
            // 1. 关键修复：空皮肤还原
            if (!activeSkinNames || activeSkinNames.length === 0) {
                const def = skeleton.data.defaultSkin;
                if (def) skeleton.setSkin(def); 
                else skeleton.setSkin(null);
                
                skeleton.setSlotsToSetupPose();
                if(spine.Physics) skeleton.updateWorldTransform(spine.Physics.reset);
                return;
            }
            
            // 2. 创建新混合皮肤
            const newSkin = new spine.Skin("custom-mix");
            activeSkinNames.forEach(name => {
                const s = skeleton.data.findSkin(name);
                if (s) newSkin.addSkin(s);
            });
            
            // 3. 应用
            skeleton.setSkin(newSkin);
            skeleton.setSlotsToSetupPose();
            skeleton.setToSetupPose();
            if(spine.Physics) skeleton.updateWorldTransform(spine.Physics.reset);
        };
        
        // 初始应用
        if(window.updateMixSkin) window.updateMixSkin([defaultSkin]);

        animSelect.onchange = () => state.setAnimation(0, animSelect.value, true);
    }

    function readFile(f, type) {
        return new Promise(r => {
            const fr = new FileReader();
            fr.onload = () => r(fr.result);
            if(type==='text') fr.readAsText(f); else fr.readAsArrayBuffer(f);
        });
    }

    // =============================================================
    // 渲染循环
    // =============================================================
    function loop() {
        window.viewerConfig.animRequestId = requestAnimationFrame(loop);
        
        // 防止僵尸循环：如果 LoadId 变了，说明有新加载任务，本循环自杀
        if (window.viewerConfig.currentLoadId !== myLoadId) {
            cancelAnimationFrame(window.viewerConfig.animRequestId);
            return;
        }
        
        const now = Date.now();
        const targetFps = window.viewerConfig.targetFps || 30;
        const interval = 1000 / targetFps;
        const elapsed = now - lastTime;
        
        if (elapsed < interval) return;

        lastTime = now - (elapsed % interval);
        let dt = elapsed / 1000;
        
        // 应用倍速
        const speed = window.viewerConfig.speed || 1.0;
        dt *= speed;

        // === 导出模式判断 ===
        const isExporting = window.viewerConfig.isExporting;

        if (!isExporting) {
            if(canvas.width !== window.innerWidth) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        }
        
        gl.viewport(0, 0, canvas.width, canvas.height);
        
        if (isExporting) {
            gl.clearColor(0, 0, 0, 0); // 强制全透明
        } else {
            const bg = window.viewerConfig ? window.viewerConfig.bgColor : [0.2, 0.2, 0.2, 1];
            gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
        }
        gl.clear(gl.COLOR_BUFFER_BIT);

        if(!skeleton || !state) return;

        try {
            // === 时间轴核心控制 ===
            const ctrl = window.animControl;
            let track = state.getCurrent(0); 
            
            if (track) {
                if (ctrl) ctrl.updateUI(track.trackTime, track.animation.duration);
                if (ctrl && ctrl.isScrubbing && ctrl.targetTime >= 0) {
                    track.trackTime = ctrl.targetTime;
                } 
                else if (ctrl && !ctrl.isPlaying) {
                    if (skeleton.update) skeleton.update(0); 
                    state.update(0);
                }
                else {
                    state.update(dt);
                }
            } else {
                state.update(dt);
            }

            state.apply(skeleton);
            
            // 物理更新逻辑
            if(skeleton.update && (!ctrl || (ctrl.isPlaying && !ctrl.isScrubbing))) {
                skeleton.update(dt); 
            }
            if(spine.Physics) skeleton.updateWorldTransform(spine.Physics.update);
            else skeleton.updateWorldTransform(1);

            if(!Number.isFinite(cam.zoom)) cam.zoom=0.1;
            const w = canvas.width, h = canvas.height;
            Mat4.ortho(mvp, cam.x - w/cam.zoom/2, cam.x + w/cam.zoom/2, cam.y - h/cam.zoom/2, cam.y + h/cam.zoom/2, -2000, 2000);
            
            shader.bind();
            shader.setUniform4x4f(spine.Shader.MVP_MATRIX, mvp);
            shader.setUniformi(spine.Shader.SAMPLER, 0);

            // 从全局配置读取 PMA
            const pma = !!(window.viewerConfig && window.viewerConfig.pmaEnabled);
            renderer.premultipliedAlpha = pma;
            
            gl.enable(gl.BLEND);
            gl.blendFunc(pma ? gl.ONE : gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            batcher.begin(shader);
            renderer.draw(batcher, skeleton);
            batcher.end();
            shader.unbind();

            // === 绘制骨骼调试线 (导出时不绘制) ===
            if(!isExporting && window.debugRenderer) {
                window.debugRenderer.drawBones(skeleton, cam.x, cam.y, cam.zoom, h);
            }

        } catch(e) { }
    }
};
