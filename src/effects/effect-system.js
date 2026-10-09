// ==========================================
// 特效系统 (重构版：主动管理)
// ==========================================
console.log("Effect System Loaded v1.2 - Scale XY Split");

window.effectSystem = {
    effects: {}, // { 'boom': { frames: [], fps: 30 } }
    bindings: {}, // { 'footstep': 'boom' }
    activeEffects: [],
    currentEvents: [], // 当前骨架的所有事件名
    
    switchTab: function(tab) {
        document.getElementById('page-eff-res').style.display = tab === 'res' ? 'flex' : 'none';
        document.getElementById('page-eff-bind').style.display = tab === 'bind' ? 'flex' : 'none';
        
        document.getElementById('tab-eff-res').style.background = tab === 'res' ? '#f6f6f4' : '#e6e6e2';
        document.getElementById('tab-eff-res').style.color = tab === 'res' ? '#111' : '#6b6b6b';

        document.getElementById('tab-eff-bind').style.background = tab === 'bind' ? '#f6f6f4' : '#e6e6e2';
        document.getElementById('tab-eff-bind').style.color = tab === 'bind' ? '#111' : '#6b6b6b';
        
        if(tab === 'bind') this.refreshBindList();
    },

    // 1. 加载特效 (支持多层子文件夹)
    loadEffectFromFiles: async function(files) {
        if(!files || files.length === 0) return;
        console.log("Loading effects from", files.length, "files/entries");
        
        const loadingMsg = document.createElement('div');
        loadingMsg.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;color:#f6f6f4;padding:16px 18px;border-radius:0;border:1px solid #f6f6f4;font-family:Inter,sans-serif;z-index:999;";
        loadingMsg.innerText = "正在分析文件结构...";
        document.body.appendChild(loadingMsg);

        try {
            // 1. 归类文件到文件夹映射表
            const folderMap = {}; // { "folderName": [file1, file2...] }
            const rootImages = [];

            for(let i=0; i<files.length; i++) {
                let f = files[i];
                // 过滤非图片
                if(!f.name.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/)) continue;

                // 获取路径信息
                // webkitRelativePath 格式通常是 "RootFolder/SubFolder/Image.png"
                // 如果是直接选择的文件，可能没有 webkitRelativePath 或很短
                const pathParts = (f.webkitRelativePath || "").split('/');
                
                if (pathParts.length > 1) {
                    // 取倒数第二部分作为所属文件夹名 (即特效名)
                    // 例如: "Assets/Effects/Fire/001.png" -> folderName = "Fire"
                    const folderName = pathParts[pathParts.length - 2];
                    if(!folderMap[folderName]) folderMap[folderName] = [];
                    folderMap[folderName].push(f);
                } else {
                    // 根目录下的图片
                    rootImages.push(f);
                }
            }

            // 如果根目录下也有图片，把它们作为一个名为 "Root" (或手动指定) 的特效，或者忽略
            // 这里策略：如果有文件夹，优先加载文件夹；如果只有根目录图片，加载根目录
            // 为了响应用户 "检测子文件的所有内容" 的需求，我们重点处理 folderMap
            
            const tasks = Object.keys(folderMap).map(async (folderName) => {
                const imageFiles = folderMap[folderName];
                
                // 排序
                imageFiles.sort((a, b) => {
                    const nA = a.name.replace(/\D/g, ''); 
                    const nB = b.name.replace(/\D/g, '');
                    return parseInt(nA || 0) - parseInt(nB || 0);
                });

                // 加载图片
                const loadedImages = [];
                for(let f of imageFiles) {
                    const url = await window.readFileAsDataURL(f);
                    const img = new Image();
                    img.src = url;
                    await new Promise(r => img.onload = r);
                    loadedImages.push(img);
                }

                return { name: folderName, frames: loadedImages };
            });

            // 如果没有子文件夹，尝试加载根目录（兼容旧行为）
            if(tasks.length === 0 && rootImages.length > 0) {
                let defaultName = "Imported_Effect";
                if(rootImages[0].webkitRelativePath) {
                    const p = rootImages[0].webkitRelativePath.split('/')[0];
                    if(p) defaultName = p;
                }
                
                tasks.push((async () => {
                    rootImages.sort((a, b) => {
                        const nA = a.name.replace(/\D/g, ''); 
                        const nB = b.name.replace(/\D/g, '');
                        return parseInt(nA || 0) - parseInt(nB || 0);
                    });
                    const loadedImages = [];
                    for(let f of rootImages) {
                        const url = await window.readFileAsDataURL(f);
                        const img = new Image();
                        img.src = url;
                        await new Promise(r => img.onload = r);
                        loadedImages.push(img);
                    }
                    return { name: defaultName, frames: loadedImages };
                })());
            }

            if(tasks.length === 0) {
                alert("未找到有效的图片序列！");
                return;
            }

            loadingMsg.innerText = `正在加载 ${tasks.length} 个特效...`;
            
            // 并行执行所有加载任务
            const results = await Promise.all(tasks);

            // 注册到系统
            results.forEach(res => {
                let finalName = res.name;
                let counter = 1;
                // 防止重名覆盖
                while(this.effects[finalName]) finalName = res.name + "_" + counter++;
                
                this.effects[finalName] = {
                    name: finalName,
                    frames: res.frames,
                    fps: 30,
                    scaleX: 1.0,
                    scaleY: 1.0,
                    rotation: 0,
                    offsetX: 0,
                    offsetY: 0
                };
            });
            
            this.updateResList();
            alert(`成功导入 ${results.length} 个特效！`);

        } catch(e) {
            console.error(e);
            alert("加载失败：" + e.message);
        } finally {
            if(loadingMsg.parentNode) loadingMsg.parentNode.removeChild(loadingMsg);
        }
    },

    // --- 精灵图相关 ---
    pendingSheetFile: null,
    
    openSheetConfig: function(file) {
        if(!file) return;
        this.pendingSheetFile = file;
        
        // 预览图片
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('sheet-preview').src = e.target.result;
            document.getElementById('sheet-modal').style.display = 'flex';
            
            // 重置输入
            document.getElementById('sheet-rows').value = 1;
            document.getElementById('sheet-cols').value = 1;
            document.getElementById('sheet-total').value = "";
        };
        reader.readAsDataURL(file);
        
        // 清空 input 使得同一文件可以再次触发 change
        document.getElementById('sprite-sheet-upload').value = "";
    },
    
    confirmSlice: async function() {
        if(!this.pendingSheetFile) return;
        
        const rows = parseInt(document.getElementById('sheet-rows').value) || 1;
        const cols = parseInt(document.getElementById('sheet-cols').value) || 1;
        let total = parseInt(document.getElementById('sheet-total').value);
        
        if(!total) total = rows * cols;
        
        const file = this.pendingSheetFile;
        const name = file.name.split('.')[0]; // 去掉扩展名
        
        try {
            // 加载大图
            const url = await window.readFileAsDataURL(file);
            const img = new Image();
            img.src = url;
            await new Promise(r => img.onload = r);
            
            // 计算切片
            const frameW = Math.floor(img.width / cols);
            const frameH = Math.floor(img.height / rows);
            
            const frames = [];
            
            for(let i=0; i<total; i++) {
                const row = Math.floor(i / cols);
                const col = i % cols;
                
                const canvas = document.createElement('canvas');
                canvas.width = frameW;
                canvas.height = frameH;
                const ctx = canvas.getContext('2d');
                
                // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
                ctx.drawImage(img, col * frameW, row * frameH, frameW, frameH, 0, 0, frameW, frameH);
                
                // 转回 Image 对象，以便兼容现有渲染逻辑
                const newImg = new Image();
                newImg.src = canvas.toDataURL('image/png');
                frames.push(newImg);
            }
            
            // 存入系统
            let finalName = name;
            let counter = 1;
            while(this.effects[finalName]) finalName = name + "_" + counter++;
            
            this.effects[finalName] = {
                name: finalName,
                frames: frames,
                fps: 30,
                scaleX: 1.0,
                scaleY: 1.0,
                rotation: 0,
                offsetX: 0,
                offsetY: 0
            };
            
            this.updateResList();
            document.getElementById('sheet-modal').style.display = 'none';
            
        } catch(e) {
            console.error(e);
            alert("切图失败: " + e.message);
        }
    },
    // ------------------
    updateResList: function() {
        const list = document.getElementById('effect-res-list');
        list.innerHTML = "";
        const names = Object.keys(this.effects);
        
        if(names.length === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center; color:#555;">暂无特效</div>';
            return;
        }
        
        names.forEach(name => {
            const eff = this.effects[name];
            
            // 主容器
            const container = document.createElement('div');
            container.style.cssText = "border-bottom:1px solid #111; margin-bottom:0; background:#fff; border-radius:0; overflow:hidden;";
            
            // 1. 顶部行 (缩略图 + 名字 + 按钮)
            const row = document.createElement('div');
            row.style.cssText = "padding:8px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;";
            row.onmouseover = () => row.style.background = "#f3e6ea";
            row.onmouseout = () => row.style.background = "transparent";
            
            // 缩略图
            const thumb = document.createElement('img');
            thumb.src = eff.frames[0].src;
            thumb.style.cssText = "width:32px; height:32px; object-fit:contain; background:#f6f6f4; margin-right:10px; border-radius:0; border:1px solid #111;";
            
            const info = document.createElement('span');
            info.innerText = `${name} (${eff.frames.length}帧)`;
            info.style.cssText = "color:#111; font-size:13px; flex:1;";
            
            // 按钮组
            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.gap = '5px';
            
            const btnSettings = document.createElement('button');
            btnSettings.innerText = "⚙️";
            btnSettings.title = "设置属性 (Settings)";
            btnSettings.style.cssText = "font-size:12px; padding:4px 6px; background:#fff; color:#111; border:1px solid #111; border-radius:0; cursor:pointer;";
            
            const btnPlay = document.createElement('button');
            
            // 检查是否正在预览
            const isPreviewing = eff.previewInstanceId;
            
            btnPlay.innerText = isPreviewing ? "⏹" : "▶";
            btnPlay.title = isPreviewing ? "停止 (Stop)" : "预览 (Preview)";
            const bg = isPreviewing ? "#111" : "#fff";
            const fg = isPreviewing ? "#fff" : "#111";
            btnPlay.style.cssText = `font-size:12px; padding:4px 8px; background:${bg}; color:${fg}; border:1px solid #111; border-radius:0; cursor:pointer; min-width:25px;`;
            
                btnPlay.onclick = (e) => { 
                    e.stopPropagation(); 
                    if(eff.previewInstanceId) {
                        this.stop(eff.previewInstanceId);
                        eff.previewInstanceId = null;
                        btnPlay.innerText = "▶";
                        btnPlay.title = "预览 (Preview)";
                        btnPlay.style.background = "#fff";
                        btnPlay.style.color = "#111";
                    } else {
                        // Start Loop Preview (maxLoop: -1 for infinite)
                        eff.previewInstanceId = this.play(name, 0, 0, 1, { maxLoop: -1, isPreview: true });
                        btnPlay.innerText = "⏹";
                        btnPlay.title = "停止 (Stop)";
                        btnPlay.style.background = "#111";
                        btnPlay.style.color = "#fff";
                    }
                };

            const btnDel = document.createElement('button');
            btnDel.innerText = "🗑";
            btnDel.title = "删除 (Delete)";
            btnDel.style.cssText = "font-size:12px; padding:4px 6px; background:#fff; color:#111; border:1px solid #111; border-radius:0; cursor:pointer;";
            btnDel.onclick = (e) => {
                e.stopPropagation();
                if(confirm('确定删除特效 ' + name + ' 吗？')) {
                    delete this.effects[name];
                    this.updateResList();
                    this.refreshBindList();
                }
            };
            
            right.appendChild(btnSettings);
            right.appendChild(btnPlay);
            right.appendChild(btnDel);
            
            const left = document.createElement('div');
            left.style.display = 'flex';
            left.style.alignItems = 'center';
            left.appendChild(thumb);
            left.appendChild(info);
            
            row.appendChild(left);
            row.appendChild(right);
            
            // 2. 设置面板 (折叠)
            const settingsPanel = document.createElement('div');
            settingsPanel.style.cssText = "display:none; padding:10px; background:#f6f6f4; border-top:1px solid #111; font-size:12px; color:#111;";
            
            // Helper for inputs with slider
            const createInputRow = (label, key, type='number', step=1, min=null, max=null) => {
                const r = document.createElement('div');
                r.style.cssText = "display:flex; flex-direction:column; margin-bottom:8px;";
                
                const top = document.createElement('div');
                top.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;";
                
                const l = document.createElement('label');
                l.innerText = label;
                l.style.color = "#6b6b6b";
                l.style.fontSize = "12px";
                
                // 改为 text 类型以移除默认上下箭头
                const inp = document.createElement('input');
                inp.type = "text"; 
                const initVal = eff[key] !== undefined ? eff[key] : (key.startsWith('scale')?1:0);
                inp.value = initVal;
                // 移除 step/min/max 属性在 text 类型上无用，逻辑由 JS 控制
                // 输入框样式
                inp.style.cssText = "width:50px; background:#fff; border:1px solid #111; color:#111; padding:2px; border-radius:0; text-align:right; font-size:12px;";
                
                // 滑块
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.style.cssText = "width:100%; height:4px; margin-top:4px; accent-color:#00e5ff;";
                slider.min = (min !== null) ? min : (key.startsWith('scale')?-5.0:-360);
                slider.max = (max !== null) ? max : (key.startsWith('scale')?5.0:360);
                slider.step = step || 1;
                slider.value = initVal;

                // 联动逻辑
                
                // 1. 输入框变更 (支持手动输入)
                inp.onchange = () => {
                    let val = parseFloat(inp.value);
                    if(isNaN(val)) val = initVal;
                    
                    // 简单范围限制 (可选)
                    if(min !== null && val < min) val = min;
                    if(max !== null && val > max) val = max;
                    
                    inp.value = val; // 格式化回填
                    eff[key] = val;
                    slider.value = val;
                };
                
                // 防止点击输入框触发折叠等冒泡
                inp.onclick = (e) => e.stopPropagation(); 
                
                // 2. 滑块变更
                slider.oninput = () => {
                    const val = parseFloat(slider.value);
                    eff[key] = val;
                    inp.value = val;
                };
                // 防止点击滑块触发折叠
                slider.onclick = (e) => e.stopPropagation();
                
                top.appendChild(l);
                top.appendChild(inp);
                
                r.appendChild(top);
                r.appendChild(slider);
                return r;
            };

            settingsPanel.appendChild(createInputRow("缩放 X (Scale X)", "scaleX", "number", 0.1, -5.0, 5.0));
            settingsPanel.appendChild(createInputRow("缩放 Y (Scale Y)", "scaleY", "number", 0.1, -5.0, 5.0));
            settingsPanel.appendChild(createInputRow("旋转 (Rotation)", "rotation", "number", 1, -360, 360));
            settingsPanel.appendChild(createInputRow("X 偏移 (Off X)", "offsetX", "number", 1, -500, 500));
            settingsPanel.appendChild(createInputRow("Y 偏移 (Off Y)", "offsetY", "number", 1, -500, 500));
            settingsPanel.appendChild(createInputRow("帧率 (FPS)", "fps", "number", 1, 1, 60));

            // Toggle logic
            let isOpen = false;
            btnSettings.onclick = (e) => {
                e.stopPropagation();
                isOpen = !isOpen;
                settingsPanel.style.display = isOpen ? 'block' : 'none';
                btnSettings.style.background = isOpen ? '#666' : '#444';
            };

            container.appendChild(row);
            container.appendChild(settingsPanel);
            list.appendChild(container);
        });
    },
    
    // 3. 扫描骨架事件 (增强版)
    scanEvents: function() {
        this.currentEvents = [];
        if(!window.skeleton || !window.skeleton.data) {
            console.log("No skeleton data found.");
            this.refreshBindList();
            return;
        }
        
        const eventSet = new Set();

        // 策略 A: 从 data.events 定义中读取 (标准方式)
        if(window.skeleton.data.events && Array.isArray(window.skeleton.data.events)) {
            window.skeleton.data.events.forEach(e => {
                if(e && e.name) eventSet.add(e.name);
            });
        }

        // 策略 B: 遍历所有动画的 Timeline (深度扫描，防漏)
        if(window.skeleton.data.animations && Array.isArray(window.skeleton.data.animations)) {
            window.skeleton.data.animations.forEach(anim => {
                if(anim.timelines) {
                    anim.timelines.forEach(timeline => {
                        // 检查 EventTimeline
                        if(timeline.events) { // 3.8+ / 4.x
                            timeline.events.forEach(e => {
                                if(e.data && e.data.name) eventSet.add(e.data.name);
                            });
                        } 
                        // 兼容旧版可能的结构 (如果 timeline 直接包含 event info)
                    });
                }
            });
        }

        this.currentEvents = Array.from(eventSet).sort();
        console.log("Scanned events:", this.currentEvents);
        this.refreshBindList();
    },
    
    // 4. 刷新绑定列表 UI (多重绑定版)
    refreshBindList: function() {
        const list = document.getElementById('effect-bind-list');
        list.innerHTML = "";

        // 添加刷新按钮行
        const headerRow = document.createElement('div');
        headerRow.style.cssText = "padding:10px; text-align:center; border-bottom:1px solid #111; margin-bottom:5px;";
        const btnRefresh = document.createElement('button');
        
        // 动态设置文本
        const hasEvents = this.currentEvents.length > 0;
        btnRefresh.innerText = hasEvents ? "🔄 重新扫描事件" : "🔍 扫描事件";
        
        btnRefresh.style.cssText = "font-size:13px; padding:8px 20px; background:#111; color:#f6f6f4; border:1px solid #111; cursor:pointer; border-radius:0; font-weight:600;";
        btnRefresh.onmouseover = () => btnRefresh.style.background = "#000";
        btnRefresh.onmouseout = () => btnRefresh.style.background = "#111";
        
        btnRefresh.onclick = () => {
            this.scanEvents();
            // 扫描后不弹窗，体验更好，或者仅在无事件时提示
            if(this.currentEvents.length === 0) {
                alert("未检测到事件 (可能是纯动作文件或事件未导出)");
            }
        };
        headerRow.appendChild(btnRefresh);
        list.appendChild(headerRow);
        
        if(this.currentEvents.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.innerHTML = '<div style="padding:20px; text-align:center; color:#555;">当前骨架没有检测到事件<br><span style="font-size:10px">(可能是纯动作文件，或事件未正确导出)</span></div>';
            list.appendChild(emptyMsg);
            return;
        }
        
        const effectNames = Object.keys(this.effects);
        
        this.currentEvents.forEach(evtName => {
            const row = document.createElement('div');
            row.style.cssText = "padding:10px; border-bottom:1px solid #333; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:nowrap; gap:10px;";
            
            // 左侧：事件名
            const lbl = document.createElement('div');
            lbl.innerHTML = `<span style="color:#ffcc00;">⚡</span> ${evtName}`;
            lbl.style.cssText = "color:#eee; font-size:14px; font-weight:bold; min-width:80px; margin-top:5px;";
            
            // 中间：层级堆栈容器 (垂直布局)
            const stackContainer = document.createElement('div');
            stackContainer.style.cssText = "flex:1; display:flex; flex-direction:column; gap:5px; align-items:stretch;";

            // 获取数据
            let boundEffects = this.bindings[evtName];
            if (typeof boundEffects === 'string') boundEffects = [{id: boundEffects, zIndex: 1}];
            if (!Array.isArray(boundEffects)) boundEffects = [];
            // 数据清洗
            boundEffects = boundEffects.map(b => {
                if (typeof b === 'string') return {id: b, zIndex: 1, maxLoop: 1};
                // 确保是对象且不修改原对象引用
                let newItem = { ...b };
                if (newItem.zIndex === undefined) newItem.zIndex = 1;
                
                // 确保 maxLoop 是数字
                if (newItem.maxLoop === undefined) newItem.maxLoop = 1; 
                else newItem.maxLoop = parseInt(newItem.maxLoop);
                
                return newItem;
            });
            
            // 立即同步清洗后的数据回 bindings，确保播放逻辑读取到正确数据
            this.bindings[evtName] = boundEffects;

            // 分离 Front 和 Back，并排序
            // Front: zIndex >= 0 (实际上通常 > 0)，按数值从大到小排序 (5, 4, 3...) -> 视觉上在上面
            // Back: zIndex < 0，按数值从大到小排序 (-1, -2, -3...) -> 视觉上在 Body 下面
            let frontEffs = boundEffects.filter(e => e.zIndex >= 0).sort((a,b) => b.zIndex - a.zIndex);
            let backEffs = boundEffects.filter(e => e.zIndex < 0).sort((a,b) => b.zIndex - a.zIndex);

            // 渲染函数：生成单个特效行
            const renderEffectItem = (effObj, realIndex) => {
                const item = document.createElement('div');
                const isBack = effObj.zIndex < 0;
                const bgColor = isBack ? '#4466aa' : '#448844'; 
                item.style.cssText = `background:${bgColor}; color:#fff; padding:5px 8px; border-radius:4px; font-size:13px; display:flex; align-items:center; border:1px solid rgba(255,255,255,0.2); gap:8px; justify-content:space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.3);`;

                // 左侧：Z-Index 控制器
                const zControl = document.createElement('div');
                zControl.style.cssText = "display:flex; align-items:center; background:rgba(0,0,0,0.3); border-radius:3px; overflow:hidden;";
                zControl.title = "层级 (Z-Index)";
                
                // 标签 Z
                const zLabel = document.createElement('div');
                zLabel.innerText = "层";
                zLabel.style.cssText = "padding:0 4px; font-size:10px; color:#aaa; border-right:1px solid #444; background:rgba(0,0,0,0.2); height:24px; line-height:24px;";
                zControl.appendChild(zLabel);

                const btnMinus = document.createElement('div');
                btnMinus.innerText = "-";
                btnMinus.style.cssText = "width:24px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; background:rgba(0,0,0,0.2); font-weight:bold; font-size:14px; user-select:none;";
                btnMinus.onmouseover = () => btnMinus.style.background = "rgba(0,0,0,0.5)";
                btnMinus.onmouseout = () => btnMinus.style.background = "rgba(0,0,0,0.2)";
                btnMinus.onclick = (e) => {
                    e.stopPropagation();
                    // 修改原始数组中的数据
                    boundEffects[realIndex].zIndex -= 1;
                    this.bindings[evtName] = boundEffects;
                    this.refreshBindList(); // 必须重刷以更新排序
                };

                const zValDisplay = document.createElement('div');
                zValDisplay.innerText = effObj.zIndex;
                zValDisplay.style.cssText = "width:30px; height:24px; display:flex; align-items:center; justify-content:center; font-family:monospace; font-size:13px; font-weight:bold;";

                const btnPlus = document.createElement('div');
                btnPlus.innerText = "+";
                btnPlus.style.cssText = "width:24px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; background:rgba(0,0,0,0.2); font-weight:bold; font-size:14px; user-select:none;";
                btnPlus.onmouseover = () => btnPlus.style.background = "rgba(0,0,0,0.5)";
                btnPlus.onmouseout = () => btnPlus.style.background = "rgba(0,0,0,0.2)";
                btnPlus.onclick = (e) => {
                    e.stopPropagation();
                    boundEffects[realIndex].zIndex += 1;
                    this.bindings[evtName] = boundEffects;
                    this.refreshBindList();
                };

                zControl.appendChild(btnMinus);
                zControl.appendChild(zValDisplay);
                zControl.appendChild(btnPlus);
                
                // ===============================================
                // 新增：播放设置 (次数输入框 + 循环按钮)
                // ===============================================
                const playSettings = document.createElement('div');
                playSettings.style.cssText = "display:flex; align-items:center; gap:2px; margin-right:5px;";
                
                // 次数控制器容器 (仿照 zControl)
                const pControl = document.createElement('div');
                pControl.style.cssText = "display:flex; align-items:center; background:rgba(0,0,0,0.3); border-radius:3px; overflow:hidden;";
                pControl.title = "播放次数 (Play Count)";

                // 标签 次
                const pLabel = document.createElement('div');
                pLabel.innerText = "次";
                pLabel.style.cssText = "padding:0 4px; font-size:10px; color:#aaa; border-right:1px solid #444; background:rgba(0,0,0,0.2); height:24px; line-height:24px; display:flex; align-items:center;";
                pControl.appendChild(pLabel);

                // 1. 减号按钮
                const pBtnMinus = document.createElement('div');
                pBtnMinus.innerText = "-";
                pBtnMinus.style.cssText = "width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer; background:rgba(0,0,0,0.2); font-weight:bold; font-size:12px; user-select:none; color:#aaa;";
                pBtnMinus.onmouseover = () => pBtnMinus.style.background = "rgba(0,0,0,0.5)";
                pBtnMinus.onmouseout = () => pBtnMinus.style.background = "rgba(0,0,0,0.2)";
                
                // 2. 次数显示/输入框 (添加 title 区分)
                const pValInput = document.createElement('input');
                pValInput.type = "text"; 
                pValInput.value = effObj.maxLoop === -1 ? 1 : effObj.maxLoop;
                pValInput.title = "播放次数 (Play Count)"; 
                pValInput.style.cssText = "width:30px; height:20px; background:#fff; border:1px solid #111; color:#111; font-family:monospace; font-size:12px; font-weight:bold; text-align:center; padding:0; outline:none;";
                
                if(effObj.maxLoop === -1) pValInput.style.opacity = "0.5";

                // 3. 加号按钮
                const pBtnPlus = document.createElement('div');
                pBtnPlus.innerText = "+";
                pBtnPlus.style.cssText = "width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer; background:rgba(0,0,0,0.2); font-weight:bold; font-size:12px; user-select:none; color:#aaa;";
                pBtnPlus.onmouseover = () => pBtnPlus.style.background = "rgba(0,0,0,0.5)";
                pBtnPlus.onmouseout = () => pBtnPlus.style.background = "rgba(0,0,0,0.2)";

                // 4. 循环开关按钮 (在容器外)
                const btnLoop = document.createElement('button');
                btnLoop.innerText = "∞";
                btnLoop.title = "无限循环开关 (Infinite Loop)";
                const isLoop = effObj.maxLoop === -1;
                btnLoop.style.cssText = `width:20px; height:20px; border:none; border-radius:3px; font-size:14px; line-height:1; cursor:pointer; padding:0; background:${isLoop ? '#00e5ff' : '#333'}; color:${isLoop ? '#000' : '#777'}; transition:all 0.2s; margin-left:2px;`;
                
                // --- 逻辑函数 ---
                const updateVal = (newVal) => {
                        // 退出无限模式
                    if(effObj.maxLoop === -1) {
                            btnLoop.style.background = "#333";
                            btnLoop.style.color = "#777";
                            pValInput.style.opacity = "1.0";
                    }
                    
                    boundEffects[realIndex].maxLoop = newVal;
                    effObj.maxLoop = newVal;
                    pValInput.value = newVal;
                    
                    this.bindings[evtName] = boundEffects;
                    
                    // 清理残留
                    this.activeEffects = this.activeEffects.filter(inst => inst.effectId !== effObj.id);
                    if(this.activeEffects.length === 0) {
                        this.isLooping = false;
                        const cvsF = document.getElementById('effect-canvas');
                        if(cvsF) cvsF.getContext('2d').clearRect(0, 0, cvsF.width, cvsF.height);
                    }
                };

                pBtnMinus.onclick = (e) => {
                    e.stopPropagation();
                    let v = parseInt(pValInput.value) || 1;
                    if(v > 1) updateVal(v - 1);
                    else updateVal(1); // 保持至少为1
                };

                pBtnPlus.onclick = (e) => {
                    e.stopPropagation();
                    let v = parseInt(pValInput.value) || 1;
                    updateVal(v + 1);
                };

                // 手动输入逻辑
                pValInput.onclick = (e) => e.stopPropagation();
                pValInput.onchange = (e) => {
                    let v = parseInt(pValInput.value) || 1;
                    if(v < 1) v = 1;
                    updateVal(v);
                };
                
                // 循环切换逻辑
                btnLoop.onclick = (e) => {
                    e.stopPropagation();
                    const currentLoop = parseInt(effObj.maxLoop);
                    
                    if(currentLoop === -1) {
                        // 关：恢复当前输入框的值
                        let v = parseInt(pValInput.value) || 1;
                        updateVal(v);
                    } else {
                        // 开：设为 -1
                        boundEffects[realIndex].maxLoop = -1;
                        effObj.maxLoop = -1;
                        
                        btnLoop.style.background = "#00e5ff";
                        btnLoop.style.color = "#000";
                        pValInput.style.opacity = "0.5";
                        
                        this.bindings[evtName] = boundEffects;
                        
                        // 清理
                        this.activeEffects = this.activeEffects.filter(inst => inst.effectId !== effObj.id);
                        if(this.activeEffects.length === 0) {
                            this.isLooping = false;
                            const cvsF = document.getElementById('effect-canvas');
                            if(cvsF) cvsF.getContext('2d').clearRect(0, 0, cvsF.width, cvsF.height);
                        }
                    }
                };

                pControl.appendChild(pBtnMinus);
                pControl.appendChild(pValInput);
                pControl.appendChild(pBtnPlus);
                
                playSettings.appendChild(pControl);
                playSettings.appendChild(btnLoop);
                // ===============================================

                // 中间：特效名称
                const nameSpan = document.createElement('span');
                nameSpan.innerText = effObj.id;
                nameSpan.style.cssText = "font-weight:bold; flex:1; margin-left:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";

                // 右侧：移除按钮
                const closeBtn = document.createElement('div');
                closeBtn.innerText = "×";
                closeBtn.style.cssText = "width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:#ffdddd; font-weight:bold; cursor:pointer; font-size:16px; border-radius:50%; background:rgba(0,0,0,0.2);";
                closeBtn.onmouseover = () => closeBtn.style.background = "rgba(255,0,0,0.4)";
                closeBtn.onmouseout = () => closeBtn.style.background = "rgba(0,0,0,0.2)";
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    // 直接使用 realIndex 更新
                    boundEffects.splice(realIndex, 1);
                    this.bindings[evtName] = boundEffects;
                    this.refreshBindList();
                };

                item.appendChild(zControl);
                item.appendChild(playSettings); // Insert Settings
                item.appendChild(nameSpan);
                item.appendChild(closeBtn);
                return item;
            };

            // 1. 渲染前景层 (从上到下)
            frontEffs.forEach(eff => {
                // 需要找到它在原始数组中的真实索引，以便修改
                const realIdx = boundEffects.indexOf(eff);
                stackContainer.appendChild(renderEffectItem(eff, realIdx));
            });

            // 2. 渲染中间“本体”层
            const bodyLayer = document.createElement('div');
            bodyLayer.innerHTML = "🧍 角色本体 (Body)";
            bodyLayer.style.cssText = "background:#333; color:#777; padding:5px 8px; border-radius:4px; font-size:12px; text-align:center; border:1px dashed #555; margin: 2px 0; user-select:none;";
            stackContainer.appendChild(bodyLayer);

            // 3. 渲染背景层 (从上到下)
            backEffs.forEach(eff => {
                const realIdx = boundEffects.indexOf(eff);
                stackContainer.appendChild(renderEffectItem(eff, realIdx));
            });

            // 右侧：添加按钮
            const addSelect = document.createElement('select');
            addSelect.style.cssText = "width:36px; height:36px; background:#222; border:1px solid #555; color:#eee; padding:0 5px; font-size:18px; cursor:pointer; border-radius:4px; text-align:center; margin-top:5px;";
            addSelect.title = "添加特效绑定";
            
            const optDef = document.createElement('option');
            optDef.text = "+";
            optDef.value = "";
            addSelect.appendChild(optDef);
            
            effectNames.forEach(eff => {
                const opt = document.createElement('option');
                opt.value = eff;
                opt.text = eff;
                addSelect.appendChild(opt);
            });

            addSelect.onchange = () => {
                const newEffId = addSelect.value;
                if(newEffId) {
                    boundEffects.push({id: newEffId, zIndex: 1}); // 默认加到最前面
                    this.bindings[evtName] = boundEffects;
                    this.refreshBindList();
                }
                addSelect.value = ""; 
            };
            
            row.appendChild(lbl);
            row.appendChild(stackContainer);
            row.appendChild(addSelect);
            list.appendChild(row);
        });
    },

    play: function(effectId, worldX, worldY, zIndex = 1, options = {}) {
        const eff = this.effects[effectId];
        if(!eff) return null;
        
        // 确保 zIndex 是数字
        const z = parseInt(zIndex) || 1;
        
        const instanceId = options.instanceId || Math.random().toString(36).substr(2, 9);
        
        // maxLoop: 默认1次，-1为无限循环
        const maxLoop = options.maxLoop !== undefined ? options.maxLoop : 1;
        
        // 记录来源事件名 (用于排重)
        const sourceEvent = options.sourceEvent || null;

        this.activeEffects.push({
            id: instanceId,
            effectId: effectId,
            sourceEvent: sourceEvent, // 存储来源
            frameIndex: 0,
            x: worldX,
            y: worldY,
            zIndex: z, 
            lastTime: Date.now(),
            accumTime: 0,
            currentLoop: 0,
            maxLoop: maxLoop,
            isPreview: options.isPreview || false // 存储是否为预览模式
        });
        
        if(!this.isLooping) {
            this.isLooping = true;
            requestAnimationFrame(this.loop.bind(this));
        }
        return instanceId;
    },

    stop: function(instanceId) {
        this.activeEffects = this.activeEffects.filter(e => e.id !== instanceId);
    },
    
    loop: function() {
        if(this.activeEffects.length === 0) {
            this.isLooping = false;
            // Clear both canvases
            const cvsF = document.getElementById('effect-canvas');
            if(cvsF) cvsF.getContext('2d').clearRect(0, 0, cvsF.width, cvsF.height);
            const cvsB = document.getElementById('effect-canvas-bg');
            if(cvsB) cvsB.getContext('2d').clearRect(0, 0, cvsB.width, cvsB.height);
            return;
        }
        
        const now = Date.now();
        const cvsF = document.getElementById('effect-canvas');
        const ctxF = cvsF.getContext('2d');
        const cvsB = document.getElementById('effect-canvas-bg');
        const ctxB = cvsB ? cvsB.getContext('2d') : null;
        
        // Sync dimensions
        if(cvsF.width !== window.innerWidth || cvsF.height !== window.innerHeight) {
            // 如果正在导出，不要随窗口大小重置 Canvas，以免破坏编码器配置
            if(!window.viewerConfig.isExporting) {
                cvsF.width = window.innerWidth;
                cvsF.height = window.innerHeight;
                if(cvsB) { cvsB.width = window.innerWidth; cvsB.height = window.innerHeight; }
            }
        }
        
        // Clear
        ctxF.clearRect(0, 0, cvsF.width, cvsF.height);
        if(ctxB) ctxB.clearRect(0, 0, cvsB.width, cvsB.height);
        
        // Camera setup
        let camX=0, camY=0, zoom=1;
        if(typeof window.camX !== 'undefined') { camX=window.camX; camY=window.camY; zoom=window.camZoom; }
        else if(window.cam42) { camX=window.cam42.x; camY=window.cam42.y; zoom=window.cam42.zoom; }
        
        // --- DRAW FUNCTION ---
        const drawInstance = (ctx, instance, eff) => {
            const img = eff.frames[instance.frameIndex];
            if(!img) return;
            
            const w = img.width;
            const h = img.height;
            
            ctx.save();
            ctx.translate(cvsF.width/2, cvsF.height/2);
            ctx.scale(zoom, zoom);
            ctx.scale(1, -1); 
            ctx.translate(-camX, -camY);
            
            ctx.translate(instance.x, instance.y);
            
            // === 应用自定义变换 (Transform) ===
            if(eff.offsetX || eff.offsetY) {
                ctx.translate(eff.offsetX || 0, eff.offsetY || 0);
            }
            
            if(eff.rotation) {
                // 转换角度为弧度 (WebGL/Canvas 是顺时针还是逆时针取决于坐标系，这里 Y 是翻转的)
                // 正常 Canvas 顺时针，但这里 Y scale -1 了，可能会反。先按标准来。
                ctx.rotate((eff.rotation * Math.PI) / 180);
            }
            
            // 优先使用 scaleX/scaleY，兼容旧 scale
            let sx = (eff.scaleX !== undefined) ? eff.scaleX : (eff.scale !== undefined ? eff.scale : 1);
            let sy = (eff.scaleY !== undefined) ? eff.scaleY : (eff.scale !== undefined ? eff.scale : 1);
            
            if(sx !== 1 || sy !== 1) {
                ctx.scale(sx, sy);
            }
            // ==================================
            
            ctx.scale(1, -1); 
            ctx.drawImage(img, -w/2, -h + 20); 
            ctx.restore();
        };

        // Update & Render Loop
        const nextActiveEffects = [];
        
        // 1. 更新所有实例状态
        for(let i = 0; i < this.activeEffects.length; i++) {
            const instance = this.activeEffects[i];
            const eff = this.effects[instance.effectId];
            if(!eff) continue; 
            
            // 【位置跟随逻辑】如果是预览模式，且有骨架，自动跟随骨架移动
            if (instance.isPreview && window.skeleton) {
                // 使用包围盒 (Bounding Box) 计算视觉中心
                // 这能解决动画移动了身体但 Root 骨骼留在原地的问题
                try {
                    // 兼容不同版本的 getBounds 签名
                    // 3.8/4.x: getBounds(offset, size, tempVertices)
                    const offset = { x: 0, y: 0 };
                    const size = { x: 0, y: 0 };
                    
                    // 缓存顶点数组以避免每帧 GC
                    if (!window._tempVerts) window._tempVerts = new Array(2048).fill(0);
                    
                    window.skeleton.getBounds(offset, size, window._tempVerts);
                    
                    // 计算中心点 + 骨架偏移
                    instance.x = window.skeleton.x + offset.x + size.x / 2;
                    instance.y = window.skeleton.y + offset.y + size.y / 2;
                } catch(e) {
                    // 回退方案：如果 getBounds 失败，跟随 Root
                    const root = window.skeleton.bones[0];
                    if(root) {
                        instance.x = root.worldX;
                        instance.y = root.worldY + 100;
                    }
                }
            }

            const dt = now - instance.lastTime;
            instance.lastTime = now;
            instance.accumTime += dt;
            
            const frameDuration = 1000 / eff.fps;
            if(instance.accumTime >= frameDuration) {
                const framesToAdvance = Math.floor(instance.accumTime / frameDuration);
                instance.frameIndex += framesToAdvance;
                instance.accumTime %= frameDuration;
            }
            
            if(instance.frameIndex < eff.frames.length) {
                nextActiveEffects.push(instance);
            } else {
                // 结束了一轮
                instance.currentLoop++;
                
                // 检查是否无限循环 (-1) 或 达到指定次数
                // 注意：currentLoop 是已播放次数，所以 >= maxLoop 时结束
                const maxLoop = instance.maxLoop !== undefined ? instance.maxLoop : 1;
                
                if(maxLoop === -1 || instance.currentLoop < maxLoop) {
                    instance.frameIndex = 0;
                    nextActiveEffects.push(instance);
                }
            }
        }
        
        this.activeEffects = nextActiveEffects;

        // 2. 分组与排序
        // Z < 0 : 背景层，值越小越靠后（画的时候先画小的）
        // Z >= 0: 前景层，值越小越靠后
        const backList = this.activeEffects.filter(e => e.zIndex < 0).sort((a,b) => a.zIndex - b.zIndex);
        const frontList = this.activeEffects.filter(e => e.zIndex >= 0).sort((a,b) => a.zIndex - b.zIndex);

        // 3. 绘制
        if(ctxB) backList.forEach(inst => drawInstance(ctxB, inst, this.effects[inst.effectId]));
        frontList.forEach(inst => drawInstance(ctxF, inst, this.effects[inst.effectId]));
        
        if(this.activeEffects.length > 0) {
            requestAnimationFrame(this.loop.bind(this));
        } else {
            this.isLooping = false;
        }
    }
};