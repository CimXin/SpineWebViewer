// ==========================================
// 序列帧/GIF/WebM 导出逻辑 (支持批量)
// ==========================================
window.exportSequence = async function() {
    if(!window.animControl) return;

    // UI Read
    const prefix = document.getElementById('export-prefix').value || "anim";
    const digits = parseInt(document.getElementById('export-digits').value);
    const format = document.getElementById('export-format').value; 
    const scaleInput = document.getElementById('export-scale');
    const scale = scaleInput ? parseFloat(scaleInput.value) || 1.0 : 1.0;
    const isBatch = document.getElementById('export-batch').checked;

    if(!window.skeleton) {
            alert(window.t("export.noSkel"));
            return;
    }

    // 1. Directory Picker
    let rootDirHandle;
    try {
        rootDirHandle = await window.showDirectoryPicker();
    } catch(e) { return; } 

    // Setup Modal
    const modal = document.getElementById('export-modal');
    const fill = document.getElementById('export-progress-fill');
    const status = document.getElementById('export-status');
    const modalTitle = modal.querySelector('h2');
    
    modal.style.display = 'flex';
    modalTitle.innerText = window.t("export.init");

    // Global State Backup
    const wasPlaying = window.animControl.isPlaying;
    window.animControl.isPlaying = false;
    window.animControl.isScrubbing = true; 
    window.viewerConfig.isExporting = true;
    
    let originalBgColor = window.viewerConfig.bgColor.slice(); 
    window.viewerConfig.bgColor[3] = 0.0; // Force Transparent

    const originalUpdateUI = window.animControl.updateUI;
    window.animControl.updateUI = function(){};
    
    const canvas = document.getElementById('canvas');
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    // Determine animations list
    let animations = [];
    if (isBatch) {
            // Export all animations
            animations = window.skeleton.data.animations.map(a => a.name);
    } else {
            // Current animation only (null indicates "don't switch")
            animations = [null]; 
    }

    try {
        for(let i=0; i<animations.length; i++) {
            const animName = animations[i];
            let currentDirHandle = rootDirHandle;
            let currentPrefix = prefix;

            if (animName) {
                status.innerText = window.t("export.progress", { i: i + 1, n: animations.length, name: animName });
                
                // Switch Animation
                if (window.animationState) {
                    window.animationState.setAnimation(0, animName, true);
                    window.skeleton.setToSetupPose();
                    window.skeleton.updateWorldTransform();
                    
                    // Update Duration
                    const animObj = window.skeleton.data.animations.find(a => a.name === animName);
                    if(animObj) window.animControl.duration = animObj.duration;
                    else window.animControl.duration = 0; 
                }
                
                // Naming / Folder Logic
                if (format === 'png') {
                    // Create Subfolder for sequence frames
                        try {
                        currentDirHandle = await rootDirHandle.getDirectoryHandle(animName, { create: true });
                        currentPrefix = animName; 
                    } catch(e) {
                            console.warn("Folder creation failed, using root", e);
                    }
                } else {
                    // Video/GIF prefix
                    currentPrefix = `${prefix}_${animName}`;
                }
            }

            if (window.animControl.duration <= 0) {
                    console.warn(`Skipping empty animation: ${animName}`);
                    continue; 
            }

            // Call Core Export
            await runExportCore(currentDirHandle, currentPrefix);
        }
        
        status.innerText = window.t("export.done");
        setTimeout(() => modal.style.display = 'none', 1000);

    } catch(e) {
        alert(window.t("export.fail", { msg: e }));
        console.error(e);
        modal.style.display = 'none';
    } finally {
        // Restore Global State
        if(originalBgColor) window.viewerConfig.bgColor = originalBgColor;
        window.viewerConfig.isExporting = false; 
        window.animControl.isScrubbing = false;
        window.animControl.targetTime = -1;
        window.animControl.updateUI = originalUpdateUI; 
        
        canvas.width = originalWidth;
        canvas.height = originalHeight;
        
        // Restore Camera
        if(typeof window.camX !== 'undefined') { 
            window.camX = 0; window.camY = 0; window.camZoom = 1.0; 
        }
        else if(window.renderer && window.renderer.camera) { 
            window.renderer.camera.position.x = 0;
            window.renderer.camera.position.y = 0;
            window.renderer.camera.zoom = 1.0;
            window.renderer.camera.viewportWidth = originalWidth;
            window.renderer.camera.viewportHeight = originalHeight;
            window.renderer.camera.update();
        }
        else if(window.cam42) {
                window.cam42.x = 0;
                window.cam42.y = -200;
                window.cam42.zoom = 1.0;
                if(window.skeleton && window.spine && window.spine.Physics) {
                    window.skeleton.updateWorldTransform(window.spine.Physics.reset);
                }
        }

        // 【解锁 Canvas 尺寸】
        delete canvas.width; 
        delete canvas.height;
        canvas.width = originalWidth;
        canvas.height = originalHeight;

        if(wasPlaying) window.animControl.togglePlay();
        if(window.requestAnimationFrame) requestAnimationFrame(() => {});
    }

    // Inner function to capture variables
    async function runExportCore(targetDirHandle, filePrefix) {
        const fps = 30; 
        const duration = window.animControl.duration;
        const totalFrames = Math.ceil(duration * fps);
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        // Phase 1: Bounds
        for(let i=0; i<totalFrames; i++) {
            window.animControl.targetTime = i / fps;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            
            if(window.skeleton.getBounds) {
                let offset = { x:0, y:0, set: function(x,y){this.x=x; this.y=y;} };
                let size = { x:0, y:0, set: function(x,y){this.x=x; this.y=y;} };
                window.skeleton.getBounds(offset, size, []); 
                if(size.x > 0 && size.y > 0) {
                    minX = Math.min(minX, offset.x);
                    minY = Math.min(minY, offset.y);
                    maxX = Math.max(maxX, offset.x + size.x);
                    maxY = Math.max(maxY, offset.y + size.y);
                }
            }
            fill.style.width = (i / totalFrames * 30) + '%'; 
        }
        
        const padding = 10;
        minX -= padding; minY -= padding;
        maxX += padding; maxY += padding;
        
        // If invalid bounds, fallback or skip
        if(minX === Infinity) { minX = -100; maxX = 100; minY = 0; maxY = 200; }
        
        const baseW = maxX - minX;
        const baseH = maxY - minY;
        let targetW = Math.ceil(baseW * scale);
        let targetH = Math.ceil(baseH * scale);
        
        if(targetW <= 0 || targetH <= 0) throw "Invalid bounds";

        // 【关键修复】WebCodecs (VP9/VP8) 通常要求视频尺寸为偶数
        // 如果是奇数，可能会导致 InvalidStateError 或编码失败
        if (targetW % 2 !== 0) targetW++;
        if (targetH % 2 !== 0) targetH++;

        canvas.width = targetW;
        canvas.height = targetH;

        // 【超级防抖】锁定 Canvas 尺寸，禁止任何外部脚本(包括Spine运行库)在导出期间重置它
        // 这能彻底解决 "Closed Codec" 错误
        const lockProp = (prop) => {
            const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
            Object.defineProperty(canvas, prop, {
                configurable: true,
                get: function() { return desc.get.call(this); },
                set: function(v) {
                    if(window.viewerConfig.isExporting) return; // 拦截修改
                    desc.set.call(this, v);
                }
            });
        };
        lockProp('width');
        lockProp('height');
        
        const centerX = minX + baseW/2;
        const centerY = minY + baseH/2;

        // Update Camera (Logic from original)
        if(typeof window.camX !== 'undefined') { 
            window.camX = centerX; window.camY = centerY; window.camZoom = scale; 
        }
        else if(window.renderer && window.renderer.camera) { 
            window.renderer.camera.position.x = centerX;
            window.renderer.camera.position.y = centerY;
            window.renderer.camera.zoom = scale; 
            window.renderer.camera.viewportWidth = targetW;
            window.renderer.camera.viewportHeight = targetH;
            window.renderer.camera.update();
        }
        else if(window.cam42) { 
                window.cam42.x = centerX; window.cam42.y = centerY; window.cam42.zoom = scale; 
                if(window.skeleton && window.spine && window.spine.Physics) window.skeleton.updateWorldTransform(window.spine.Physics.reset);
        }

        modalTitle.innerText = window.t("export.running", { name: filePrefix });

        // Phase 2: Render
        if (format === 'gif') {
                
                const transparentKey = 0xFF00FF; 
                const gif = new GIF({
                workers: 4,
                quality: 10,
                width: targetW,
                height: targetH,
                workerScript: (window.__ASSET_BASE__ || "/") + "vendor/gif/gif.worker.js",
                transparent: transparentKey
            });

            const fileName = `${filePrefix}.gif`;
            let fileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
            
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            const pixels = new Uint8Array(targetW * targetH * 4);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = targetW;
            tempCanvas.height = targetH;
            const tempCtx = tempCanvas.getContext('2d');
            const outputImgData = tempCtx.createImageData(targetW, targetH);
            
            const bayerThresholdMap = [
                [  0, 48, 12, 60,  3, 51, 15, 63 ],
                [ 32, 16, 44, 28, 35, 19, 47, 31 ],
                [  8, 56,  4, 52, 11, 59,  7, 55 ],
                [ 40, 24, 36, 20, 43, 27, 39, 23 ],
                [  2, 50, 14, 62,  1, 49, 13, 61 ],
                [ 34, 18, 46, 30, 33, 17, 45, 29 ],
                [ 10, 58,  6, 54,  9, 57,  5, 53 ],
                [ 42, 26, 38, 22, 41, 25, 37, 21 ]
            ];

            for(let i=0; i<totalFrames; i++) {
                window.animControl.targetTime = i / fps;
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                
                gl.readPixels(0, 0, targetW, targetH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const outData = outputImgData.data;

                for (let y = 0; y < targetH; y++) {
                    const srcY = targetH - 1 - y;
                    for (let x = 0; x < targetW; x++) {
                        const srcIdx = (srcY * targetW + x) * 4;
                        const dstIdx = (y * targetW + x) * 4;
                        const r = pixels[srcIdx];
                        const g = pixels[srcIdx + 1];
                        const b = pixels[srcIdx + 2];
                        const a = pixels[srcIdx + 3];
                        const intensity = Math.max(a, r, g, b);
                        const mapValue = bayerThresholdMap[y % 8][x % 8];
                        const threshold = (mapValue + 0.5) * 4; 

                        if (intensity < threshold) {
                            outData[dstIdx] = 255; outData[dstIdx + 1] = 0; outData[dstIdx + 2] = 255; outData[dstIdx + 3] = 255; 
                        } else {
                            let normFactor = 255 / (intensity || 1); 
                            outData[dstIdx] = Math.min(255, Math.floor(r * normFactor));
                            outData[dstIdx + 1] = Math.min(255, Math.floor(g * normFactor));
                            outData[dstIdx + 2] = Math.min(255, Math.floor(b * normFactor));
                            outData[dstIdx + 3] = 255; 
                        }
                    }
                }
                tempCtx.putImageData(outputImgData, 0, 0);
                gif.addFrame(tempCtx, {copy: true, delay: 1000/fps});
                fill.style.width = (30 + i / totalFrames * 40) + '%';
            }

            await new Promise((resolve, reject) => {
                gif.on('finished', async function(blob) {
                    try {
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        resolve();
                    } catch(err) { reject(err); }
                });
                gif.render();
            });

        } else if (format === 'webm-v9-pro') {
            // ==========================================
            // WebM-Muxer (Local Implementation)
            // ==========================================
            const fileName = `${filePrefix}.webm`;
            let fileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
            
            // 使用 WebCodecs VideoEncoder + 内嵌 WebM Muxer
            if (!('VideoEncoder' in window)) {
                alert(window.t("export.noWebCodecs"));
                return;
            }

            const muxer = new WebMMuxer({
                target: 'buffer',
                video: {
                    codec: 'V_VP9',
                    width: targetW,
                    height: targetH,
                    frameRate: fps,
                    alpha: true // 关键：开启 Alpha
                }
            });

            const videoEncoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: (e) => {
                    console.error(e);
                    alert(window.t("export.codec", { msg: e.message }));
                }
            });

            videoEncoder.configure({
                codec: 'vp09.00.50.08', // VP9, Level 5.0
                width: targetW,
                height: targetH,
                bitrate: 8000000,
                alpha: 'keep', // 关键：保留 Alpha
                hardwareAcceleration: 'prefer-software' // 关键修复：强制使用软件编码器以支持 Alpha 通道
            });

            for(let i=0; i<totalFrames; i++) {
                // 如果编码器已关闭（例如初始化失败），提前退出循环，防止 InvalidStateError
                if (videoEncoder.state === "closed") break;

                window.animControl.targetTime = i / fps;
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                
                // 时间戳必须是整数微秒
                const timestamp = Math.round(i * (1000000 / fps));
                const frame = new VideoFrame(canvas, { timestamp: timestamp, alpha: 'keep' });
                
                try {
                    videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
                } catch(e) {
                    console.error("Frame Encode Error:", e);
                    frame.close();
                    break;
                }
                frame.close();
                
                fill.style.width = (30 + i / totalFrames * 60) + '%';
            }

            await videoEncoder.flush();
            const buffer = muxer.finalize();
            
            const writable = await fileHandle.createWritable();
            await writable.write(buffer);
            await writable.close();

        } else if (format.startsWith('webm')) {
                // WebM Logic
                const fileName = `${filePrefix}.webm`;
                let fileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
                
                const stream = canvas.captureStream(fps);
                const recorder = new MediaRecorder(stream, { 
                mimeType: 'video/webm; codecs=vp8', 
                videoBitsPerSecond: 5000000 
            });
            
            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            
            const recPromise = new Promise((resolve, reject) => {
                recorder.onstop = async () => {
                    const blob = new Blob(chunks, {type: 'video/webm'});
                    try {
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        resolve();
                    } catch(err) { reject(err); }
                };
            });
            
            recorder.start();
            const frameDuration = 1000 / fps;
            const recordStartTime = performance.now();
            
            for(let i=0; i<totalFrames; i++) {
                    window.animControl.targetTime = i / fps;
                    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                    const targetEndTime = recordStartTime + (i + 1) * frameDuration;
                    const delay = targetEndTime - performance.now();
                    if (delay > 0) await new Promise(r => setTimeout(r, delay));
                    fill.style.width = (30 + i / totalFrames * 60) + '%';
            }
            recorder.stop();
            await recPromise;

        } else {
            // PNG
            for(let i=0; i<totalFrames; i++) {
                window.animControl.targetTime = i / fps;
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                const numStr = String(i).padStart(digits, '0');
                const fileName = `${filePrefix}_${numStr}.png`;
                const fileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                fill.style.width = (30 + i / totalFrames * 70) + '%';
            }
        }
    }
}
