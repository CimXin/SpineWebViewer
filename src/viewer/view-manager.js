// ==========================================
// 背景图片控制逻辑
// ==========================================
window.bgConfig = { x: 0, y: 0, scale: 1.0, opacity: 1.0 };

window.loadBgImage = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('bg-reference');
            img.src = e.target.result;
            document.getElementById('bg-image-container').style.display = 'block';
            document.getElementById('bg-controls').style.display = 'flex';
            document.getElementById('bg-visible').checked = true; // 自动勾选显示
            resetBgParams(); 
        }
        reader.readAsDataURL(input.files[0]);
    }
}

window.clearBgImage = function() {
    document.getElementById('bg-reference').src = '';
    document.getElementById('bg-image-container').style.display = 'none';
    document.getElementById('bg-controls').style.display = 'none';
    document.getElementById('bg-upload').value = ''; 
}

window.toggleBgVisibility = function(show) {
    const container = document.getElementById('bg-image-container');
    container.style.visibility = show ? 'visible' : 'hidden';
}

window.resetBgParams = function() {
    updateBgFromInput('bg-x', 0);
    updateBgFromInput('bg-y', 0);
    updateBgFromInput('bg-scale', 1.0);
    updateBgFromInput('bg-opacity', 1.0);
}

window.updateBgFromSlider = function(id) {
    const val = parseFloat(document.getElementById(id).value);
    document.getElementById('val-' + id).value = val;
    applyBgTransform();
}

window.updateBgFromInput = function(id, val) {
    if (val === undefined) {
        val = parseFloat(document.getElementById('val-' + id).value);
    } else {
        document.getElementById('val-' + id).value = val;
    }
    document.getElementById(id).value = val;
    applyBgTransform();
}

window.applyBgTransform = function() {
    window.bgConfig.x = parseFloat(document.getElementById('val-bg-x').value);
    window.bgConfig.y = parseFloat(document.getElementById('val-bg-y').value);
    window.bgConfig.scale = parseFloat(document.getElementById('val-bg-scale').value);
    window.bgConfig.opacity = parseFloat(document.getElementById('val-bg-opacity').value);

    const img = document.getElementById('bg-reference');
    img.style.transform = `translate(-50%, -50%) translate(${window.bgConfig.x}px, ${window.bgConfig.y}px) scale(${window.bgConfig.scale})`;
    img.style.opacity = window.bgConfig.opacity;
}

window.populateSkinList = function(skinNames, defaultSkinName) {
    const list = document.getElementById('skin-list');
    list.innerHTML = "";
    
    skinNames.forEach(name => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '4px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = name;
        checkbox.id = 'skin-chk-' + name;
        
        if (name === defaultSkinName) checkbox.checked = true;
        
        checkbox.onchange = () => {
            const activeSkins = [];
            list.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                activeSkins.push(cb.value);
            });
            if(window.updateMixSkin) window.updateMixSkin(activeSkins);
        };
        
        const label = document.createElement('label');
        label.htmlFor = 'skin-chk-' + name;
        label.innerText = name;
        label.style.marginLeft = '8px';
        label.style.cursor = 'pointer';
        label.style.fontSize = '13px';
        
        row.appendChild(checkbox);
        row.appendChild(label);
        list.appendChild(row);
    });
};

// ==========================================
// 角色调色板逻辑 (Color Filter & Tint)
// ==========================================

window.updateCharacterFilter = function() {
    const h = document.getElementById('filter-hue').value;
    const s = document.getElementById('filter-sat').value;
    const b = document.getElementById('filter-bri').value;
    
    document.getElementById('val-hue').innerText = h + '°';
    document.getElementById('val-sat').innerText = s;
    document.getElementById('val-bri').innerText = b;
    
    const canvas = document.getElementById('canvas');
    if (canvas) {
        // CSS 滤镜：Hue Rotate + Saturate + Brightness
        canvas.style.filter = `hue-rotate(${h}deg) saturate(${s}%) brightness(${b}%)`;
    }
};

window.updateSkeletonTint = function(hex) {
    document.getElementById('skeleton-tint').value = hex;
    // 同步 setSkeletonColor (为了兼容旧代码)
    if (window.setSkeletonColor) window.setSkeletonColor(hex);
};

window.resetColorFilters = function() {
    document.getElementById('filter-hue').value = 0;
    document.getElementById('filter-sat').value = 100;
    document.getElementById('filter-bri').value = 100;
    document.getElementById('skeleton-tint').value = "#ffffff";
    
    updateCharacterFilter();
    updateSkeletonTint("#ffffff");
};

// ==========================================
// 角色染色逻辑
// ==========================================
window.setSkeletonColor = function(hex) {
    document.getElementById('skeleton-color').value = hex;
    
    if (window.skeleton) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        
        // 设置骨架颜色 (Tint)
        window.skeleton.color.set(r, g, b, 1.0);
    }
};
