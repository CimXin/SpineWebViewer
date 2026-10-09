// ==========================================
// 事件系统 (Event System)
// ==========================================
window.eventSystem = {
    lastState: null,
    showToasts: true, // 控制弹幕显示
    currentColor: '#ffcc00', // 默认黄色
    
    setColor: function(color) {
        this.currentColor = color;
        document.getElementById('event-color-picker').value = color;
        
        // 更新标题颜色以示反馈
        const title = document.querySelector('label[style*="⚡"]');
        if(title) title.style.color = color;
    },
    
    init: function() {
        // 启动轮询检查 AnimationState 变化
        setInterval(() => {
            if (window.animationState && window.animationState !== this.lastState) {
                this.attach(window.animationState);
                this.lastState = window.animationState;
            }
        }, 500);
    },
    
    attach: function(state) {
        console.log("Event System: Attaching listener to new state...");
        const box = document.getElementById('event-log');
        if(box) box.innerHTML = '<div class="event-log-empty" data-i18n="event.waiting">' + window.t("event.waiting") + '</div>';

        if (state.addListener) {
            state.addListener({
                event: (trackEntry, event) => {
                    const data = event.data || event; 
                    const name = data.name;
                    const i = event.intValue !== undefined ? event.intValue : (data.intValue || 0);
                    const f = event.floatValue !== undefined ? event.floatValue : (data.floatValue || 0);
                    const s = event.stringValue !== undefined ? event.stringValue : (data.stringValue || null);
                    
                    this.log(name, i, f, s);
                }
            });
        }
    },
    
    log: function(name, i, f, s) {
        const box = document.getElementById('event-log');
        if(!box) return;
        
        // 清除"等待..."提示
        const placeholder = box.querySelector('div[style*="font-style:italic"]');
        if(placeholder) box.removeChild(placeholder);
        
        // 限制为只显示最新的一条 (Single Line Mode)
        box.innerHTML = ''; 
        
        const line = document.createElement('div');
        line.style.borderBottom = "1px solid #333";
        line.style.padding = "4px 0";
        line.style.animation = "flash 0.5s"; 
        
        let extra = "";
        if(i !== 0) extra += ` <span style="color:#88aaff">Int:${i}</span>`;
        if(f !== 0) extra += ` <span style="color:#88aaff">Float:${f.toFixed(2)}</span>`;
        if(s) extra += ` <span style="color:#aa88ff">Str:"${s}"</span>`;
        
        line.innerHTML = `<span style="color:${this.currentColor}; font-weight:bold;">⚡ ${name}</span> ${extra}`;
        box.appendChild(line);
        
        // 2. 视觉反馈：在 Canvas 上弹字 (如果开启)
        if (this.showToasts) {
            this.showToast(name);
        }

        // 3. 触发绑定的特效 (Effect System Link)
        if (window.effectSystem && window.effectSystem.bindings) {
            let effectList = window.effectSystem.bindings[name];
            
            // 兼容处理：旧数据可能是字符串或纯 ID 数组
            if (typeof effectList === 'string') effectList = [{id: effectList, zIndex: 1}];
            
            if (Array.isArray(effectList) && window.skeleton) {
                effectList.forEach(item => {
                    // 兼容纯字符串项
                    let eid = item;
                    let zIndex = 1;
                    
                    if(typeof item === 'object' && item.id) {
                        eid = item.id;
                        zIndex = (item.zIndex !== undefined) ? item.zIndex : 1;
                    }
                    
                    if(eid) {
                        // 修正：传递 maxLoop 参数
                        // boundEffects 中现在存储了 maxLoop
                        // 找到对应的 item
                        const item = effectList.find(e => e.id === eid);
                        const loopCount = item ? (item.maxLoop !== undefined ? item.maxLoop : 1) : 1;
                        
                        // 【关键逻辑】防止堆叠 (Anti-Stacking)
                        // 如果同一个事件再次触发，先停止该事件之前产生的所有同名特效
                        window.effectSystem.activeEffects = window.effectSystem.activeEffects.filter(inst => {
                            // 如果是同一个特效ID，且是由同一个事件(name)触发的，就移除它
                            if(inst.effectId === eid && inst.sourceEvent === name) {
                                return false; 
                            }
                            return true;
                        });
                        
                        // 播放新实例，并标记来源
                        window.effectSystem.play(eid, window.skeleton.x, window.skeleton.y, zIndex, { 
                            maxLoop: loopCount,
                            sourceEvent: name // 标记来源事件
                        });
                    }
                });
            }
        }
    },
    
    showToast: function(text) {
        const container = document.getElementById('canvas-wrapper');
        const toast = document.createElement('div');
        toast.innerText = text;
        toast.style.position = 'absolute';
        
        // === 坐标计算：世界坐标转屏幕坐标 ===
        let screenX = window.innerWidth / 2;
        let screenY = window.innerHeight / 2;
        
        if (window.skeleton) {
            // 获取相机参数 (兼容不同版本的全局变量)
            let cx = 0, cy = 0, zoom = 1.0;
            
            if (window.cam42) { // 4.2 logic
                cx = window.cam42.x;
                cy = window.cam42.y;
                zoom = window.cam42.zoom;
            } else if (typeof window.camX !== 'undefined') { // 3.6 - 4.1 logic
                cx = window.camX;
                cy = window.camY;
                zoom = window.camZoom;
            }
            
            // 获取骨骼位置 (世界坐标)
            // 默认偏移：假设事件发生在角色头顶 (Spine 原点通常在脚底)
            // 如果有 height 数据则使用，否则默认向上偏移 150 像素
            const skelHeight = (window.skeleton.data && window.skeleton.data.height) ? window.skeleton.data.height : 150;
            const worldX = window.skeleton.x;
            const worldY = window.skeleton.y + skelHeight; 
            
            // 投影公式
            // ScreenX = (WorldX - CamX) * Zoom + ScreenCenterW
            // ScreenY = ScreenCenterH - (WorldY - CamY) * Zoom  (Y轴翻转)
            const w = window.innerWidth;
            const h = window.innerHeight;
            
            screenX = (worldX - cx) * zoom + w / 2;
            screenY = h / 2 - (worldY - cy) * zoom;
        }
        // =======================================

        toast.style.left = screenX + 'px';
        toast.style.top = screenY + 'px';
        toast.style.transform = 'translate(-50%, -50%)'; // 居中锚点
        
        toast.style.color = this.currentColor;
        toast.style.fontSize = '24px';
        toast.style.fontWeight = 'bold';
        toast.style.textShadow = '0 2px 4px rgba(0,0,0,0.8)';
        toast.style.pointerEvents = 'none';
        toast.style.zIndex = '100';
        toast.style.animation = 'floatUp 1s ease-out forwards';
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if(toast.parentElement) toast.parentElement.removeChild(toast);
        }, 1000);
    }
};

// Start
window.eventSystem.init();
