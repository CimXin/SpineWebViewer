// ==========================================
// 多轨道 (Animation Mixing) 逻辑
// ==========================================
window.trackCounter = 1;

window.addTrack = function() {
    if (!window.skeleton) {
        alert("请先加载模型！");
        return;
    }
    
    const container = document.getElementById('extra-tracks-container');
    const trackIndex = window.trackCounter++;
    
    const row = document.createElement('div');
    row.className = 'control-row'; 
    row.style.height = 'auto'; 
    row.style.background = 'rgba(0,0,0,0.2)';
    row.style.padding = '4px';
    row.style.borderRadius = '4px';
    row.id = `track-row-${trackIndex}`;
    
    const leftCol = document.createElement('div');
    leftCol.style.display = 'flex';
    leftCol.style.alignItems = 'center';
    leftCol.style.gap = '5px';
    leftCol.style.flex = '1';

    const lbl = document.createElement('div');
    lbl.innerText = `T${trackIndex}`;
    lbl.style.fontSize = '11px';
    lbl.style.fontWeight = 'bold';
    lbl.style.color = '#00e5ff';
    lbl.style.minWidth = '18px';
    
    const sel = document.createElement('select');
    sel.style.flex = '1';
    sel.style.fontSize = '12px';
    sel.style.padding = '4px';
    
    // 填充动画列表
    window.skeleton.data.animations.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name; opt.text = a.name; 
        sel.appendChild(opt);
    });
    
    // Alpha 滑块 (混合权重)
    const alphaContainer = document.createElement('div');
    alphaContainer.style.display = 'flex';
    alphaContainer.style.alignItems = 'center';
    alphaContainer.style.gap = '2px';
    
    const alphaLabel = document.createElement('span');
    alphaLabel.innerText = "α";
    alphaLabel.title = "混合权重 (Alpha)";
    alphaLabel.style.fontSize = '10px';
    alphaLabel.style.color = '#aaa';
    
    const alphaRange = document.createElement('input');
    alphaRange.type = 'range';
    alphaRange.min = '0';
    alphaRange.max = '1';
    alphaRange.step = '0.1';
    alphaRange.value = '1.0';
    alphaRange.style.width = '40px';
    alphaRange.style.height = '2px';
    
    alphaContainer.appendChild(alphaLabel);
    alphaContainer.appendChild(alphaRange);

    // 绑定播放事件
    const updateTrack = () => {
            if(window.animationState) {
                try {
                    const entry = window.animationState.setAnimation(trackIndex, sel.value, true);
                    entry.alpha = parseFloat(alphaRange.value);
                } catch(e) { console.error(e); }
            }
    };
    
    // 绑定 Alpha 更新事件
    alphaRange.oninput = () => {
        if(window.animationState) {
            // 尝试获取当前轨道并设置 alpha
            // 注意：Spine JS API 中 getCurrent 可能返回 null
            let entry = null;
            if(window.animationState.getCurrent) {
                    entry = window.animationState.getCurrent(trackIndex);
            } else if(window.animationState.tracks) {
                    // 兼容旧版 API
                    entry = window.animationState.tracks[trackIndex];
            }
            
            if(entry) {
                entry.alpha = parseFloat(alphaRange.value);
            }
        }
    };

    sel.onchange = updateTrack;
    
    const btnDel = document.createElement('button');
    btnDel.innerHTML = '×';
    btnDel.title = "移除轨道";
    btnDel.style.width = '24px';
    btnDel.style.height = '24px';
    btnDel.style.background = '#d33';
    btnDel.style.color = 'white';
    btnDel.style.fontSize = '16px';
    btnDel.style.padding = '0';
    btnDel.onclick = () => {
        if(window.animationState) {
            window.animationState.setEmptyAnimation(trackIndex, 0.5); 
        }
        container.removeChild(row);
    };
    
    leftCol.appendChild(lbl);
    leftCol.appendChild(sel);
    row.appendChild(leftCol);
    row.appendChild(alphaContainer); // 添加 Alpha 滑块
    row.appendChild(btnDel);
    container.appendChild(row);
    
    // 默认播放列表中的第一个
    if(window.skeleton.data.animations.length > 0) {
            updateTrack();
    }
};
