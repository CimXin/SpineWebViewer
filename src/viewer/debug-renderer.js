// ==========================================
// 骨骼调试渲染器 (Spine 样式还原版)
// ==========================================
window.debugRenderer = {
    init: function() {
        const c = document.getElementById('debug-canvas');
        window.viewerConfig.debugCanvas = c;
        window.viewerConfig.debugCtx = c.getContext('2d');
        
        // 绑定骨骼UI事件
        document.getElementById('bone-color').addEventListener('input', (e) => window.viewerConfig.boneColor = e.target.value);
        document.getElementById('bone-scale').addEventListener('input', (e) => window.viewerConfig.boneScale = parseFloat(e.target.value));
        
        // 绑定播放控制事件
        document.getElementById('time-unit-select').addEventListener('change', (e) => {
            window.viewerConfig.timeMode = e.target.value;
            window.animControl.refresh();
        });
        document.getElementById('speed-select').addEventListener('change', (e) => window.viewerConfig.speed = parseFloat(e.target.value));
        document.getElementById('fps-select').addEventListener('change', (e) => {
            window.viewerConfig.targetFps = parseInt(e.target.value);
            window.animControl.refresh(); // FPS变了，总帧数也会变，需要立即刷新
        });

        this.resize();
    },
    resize: function() {
        const c = window.viewerConfig.debugCanvas;
        if(c) {
            c.width = window.innerWidth;
            c.height = window.innerHeight;
        }
    },
    hexToRgba: function(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    drawBones: function(skeleton, camX, camY, zoom, canvasHeight) {
        const ctx = window.viewerConfig.debugCtx;
        const c = window.viewerConfig.debugCanvas;
        if (window.debugTools) window.debugTools.tick(skeleton);
        const showBones = !!(window.viewerConfig.showBones && skeleton);
        const showOrigin = window.viewerConfig.showOrigin !== false && !!skeleton;
        const highlightName = skeleton && window.viewerConfig.highlightBone;
        const showHighlight = !!highlightName;
        const showOverlay = !!(skeleton && window.debugTools && window.debugTools.wantsOverlay());
        if(!ctx || !c || (!showBones && !showOrigin && !showHighlight && !showOverlay)) {
            if(ctx && c) ctx.clearRect(0, 0, c.width, c.height);
            return;
        }
        if(!zoom || !Number.isFinite(zoom)) zoom = 1;

        ctx.clearRect(0, 0, c.width, c.height);
        ctx.save();
        
        // 坐标系转换
        ctx.translate(c.width/2, c.height/2);
        ctx.scale(zoom, zoom); 
        ctx.scale(1, -1); 
        ctx.translate(-camX, -camY);

        if (showOrigin) this.drawOriginAxes(ctx, skeleton, zoom);

        const finishOverlay = () => {
            if (showOverlay) window.debugTools.drawWorld(ctx, skeleton, zoom);
            ctx.restore();
            if (showOrigin) this.drawOriginLabels(ctx, c, skeleton, camX, camY, zoom);
            if (showHighlight) this.drawBoneHighlightLabel(ctx, c, skeleton, highlightName, camX, camY, zoom);
            if (showOverlay) window.debugTools.drawLabels(ctx, c, skeleton, camX, camY, zoom);
        };

        if (!showBones) {
            if (showHighlight) this.drawBoneHighlight(ctx, skeleton, highlightName, zoom);
            finishOverlay();
            return;
        }

        // === 智能过滤：仅显示当前可见附件关联的骨骼 ===
        const activeBones = new Set();
        // 总是显示根骨骼
        if(skeleton.bones.length > 0) activeBones.add(skeleton.bones[0]);
        
        for(let i=0; i<skeleton.slots.length; i++) {
            const slot = skeleton.slots[i];
            // 如果插槽有附件（即当前可见）
            if(slot.attachment) {
                let b = slot.bone;
                // 向上回溯标记所有父骨骼
                while(b) {
                    activeBones.add(b);
                    b = b.parent;
                }
            }
        }
        // ============================================

        // 获取当前配置
        const baseColor = window.viewerConfig.boneColor;
        const scale = window.viewerConfig.boneScale;
        
        // 动态计算颜色
        const BONE_FILL = this.hexToRgba(baseColor, 0.15); 
        const BONE_STROKE = this.hexToRgba(baseColor, 0.6);
        const JOINT_COLOR = baseColor;
        
        // 设置线条粗细 (受 scale 影响)
        ctx.lineWidth = (1.5 * scale) / zoom; 

        // 遍历骨骼
        for (let i = 0; i < skeleton.bones.length; i++) {
            let bone = skeleton.bones[i];
            
            // 如果骨骼未被激活（属于隐藏皮肤），则跳过绘制
            if (!activeBones.has(bone)) continue;
            
            let x = bone.worldX;
            let y = bone.worldY;
            
            const rad = bone.worldRotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            
            if (bone.data.length > 0) {
                const len = bone.data.length;
                // 宽度受 scale 影响
                const width = Math.min(Math.max(len * 0.1, 5 * scale), 25 * scale); 
                
                const endX = x + cos * len;
                const endY = y + sin * len;
                
                const shoulderLen = Math.min(len * 0.2, 20 * scale); 
                const shoulderX = x + cos * shoulderLen;
                const shoulderY = y + sin * shoulderLen;

                const perpX = -sin * (width / 2);
                const perpY = cos * (width / 2);

                const leftX = shoulderX + perpX;
                const leftY = shoulderY + perpY;
                const rightX = shoulderX - perpX;
                const rightY = shoulderY - perpY;

                ctx.beginPath();
                ctx.moveTo(x, y); 
                ctx.lineTo(leftX, leftY); 
                ctx.lineTo(endX, endY); 
                ctx.lineTo(rightX, rightY); 
                ctx.closePath();
                
                // 优先使用骨骼自带颜色(如果有)，否则使用全局配置
                ctx.fillStyle = bone.data.color ? '#' + bone.data.color : BONE_FILL; 
                ctx.fill();
                
                ctx.strokeStyle = BONE_STROKE;
                ctx.stroke();
                
                // 关节圆点大小受 scale 影响
                ctx.beginPath();
                ctx.arc(x, y, (3 * scale)/zoom, 0, Math.PI*2);
                ctx.fillStyle = JOINT_COLOR;
                ctx.fill();
            } 
            else {
                // 十字大小受 scale 影响
                const size = (8 * scale) / zoom; 
                ctx.lineWidth = (1.5 * scale) / zoom;
                ctx.strokeStyle = JOINT_COLOR;
                
                ctx.beginPath();
                ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
                ctx.moveTo(x, y - size); ctx.lineTo(x, y + size);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(x, y, (1.5 * scale)/zoom, 0, Math.PI*2);
                ctx.fillStyle = JOINT_COLOR;
                ctx.fill();
            }
        }
        if (showHighlight) this.drawBoneHighlight(ctx, skeleton, highlightName, zoom);
        finishOverlay();
    },
    findBone: function(skeleton, name) {
        if (!skeleton || !skeleton.bones || !name) return null;
        for (let i = 0; i < skeleton.bones.length; i++) {
            const bone = skeleton.bones[i];
            const boneName = bone.data && bone.data.name ? bone.data.name : bone.name;
            if (boneName === name) return bone;
        }
        return null;
    },
    boneRotationDeg: function(bone) {
        if (typeof bone.getWorldRotationX === "function") {
            const deg = bone.getWorldRotationX();
            if (Number.isFinite(deg)) return deg;
        }
        if (Number.isFinite(bone.worldRotation)) return bone.worldRotation;
        return null;
    },
    drawBoneHighlight: function(ctx, skeleton, name, zoom) {
        const bone = this.findBone(skeleton, name);
        if (!bone || !Number.isFinite(bone.worldX) || !Number.isFinite(bone.worldY)) return;
        const z = zoom || 1;
        const x = bone.worldX;
        const y = bone.worldY;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 14 / z, 0, Math.PI * 2);
        ctx.lineWidth = 3 / z;
        ctx.strokeStyle = "#ffe14a";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 4 / z, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe14a";
        ctx.fill();
        const deg = this.boneRotationDeg(bone);
        if (deg != null) {
            const rad = deg * Math.PI / 180;
            const len = bone.data && bone.data.length > 0 ? bone.data.length : 28 / z;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(rad) * len, y + Math.sin(rad) * len);
            ctx.lineWidth = 2.5 / z;
            ctx.strokeStyle = "#ffe14a";
            ctx.stroke();
        }
        ctx.restore();
    },
    drawBoneHighlightLabel: function(ctx, c, skeleton, name, camX, camY, zoom) {
        const bone = this.findBone(skeleton, name);
        if (!bone || !Number.isFinite(bone.worldX) || !Number.isFinite(bone.worldY)) return;
        const sx = c.width / 2 + (bone.worldX - camX) * zoom;
        const sy = c.height / 2 - (bone.worldY - camY) * zoom;
        ctx.save();
        ctx.font = "bold 12px sans-serif";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineJoin = "round";
        ctx.strokeText(name, sx + 16, sy - 10);
        ctx.fillStyle = "#ffe14a";
        ctx.fillText(name, sx + 16, sy - 10);
        ctx.restore();
    },
    drawOriginAxes: function(ctx, skeleton, zoom) {
        const ox = skeleton.x || 0;
        const oy = skeleton.y || 0;
        const span = 200000;
        const z = zoom || 1;
        const strokeLine = (x1, y1, x2, y2, color) => {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = 3 / z;
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.stroke();
            ctx.lineWidth = 1.6 / z;
            ctx.strokeStyle = color;
            ctx.stroke();
        };
        strokeLine(ox - span, oy, ox + span, oy, '#ff4d6a');
        strokeLine(ox, oy - span, ox, oy + span, '#3dde7a');

        const wing = 9 / z;
        this.fillArrow(ctx, ox + 42 / z, oy, 1, 0, wing, '#ff4d6a');
        this.fillArrow(ctx, ox, oy + 42 / z, 0, 1, wing, '#3dde7a');

        ctx.beginPath();
        ctx.arc(ox, oy, 5 / z, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5 / z;
        ctx.strokeStyle = '#111111';
        ctx.stroke();
    },
    fillArrow: function(ctx, tipX, tipY, dx, dy, wing, color) {
        const px = -dy;
        const py = dx;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - dx * wing * 1.7 + px * wing * 0.75, tipY - dy * wing * 1.7 + py * wing * 0.75);
        ctx.lineTo(tipX - dx * wing * 1.7 - px * wing * 0.75, tipY - dy * wing * 1.7 - py * wing * 0.75);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    },
    drawOriginLabels: function(ctx, c, skeleton, camX, camY, zoom) {
        const ox = skeleton.x || 0;
        const oy = skeleton.y || 0;
        const sx = c.width / 2 + (ox - camX) * zoom;
        const sy = c.height / 2 - (oy - camY) * zoom;
        ctx.save();
        ctx.font = 'bold 13px sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineJoin = 'round';
        ctx.strokeText('X', sx + 48, sy + 4);
        ctx.fillStyle = '#ff4d6a';
        ctx.fillText('X', sx + 48, sy + 4);
        ctx.strokeText('Y', sx + 4, sy - 40);
        ctx.fillStyle = '#3dde7a';
        ctx.fillText('Y', sx + 4, sy - 40);
        ctx.restore();
    }
};
