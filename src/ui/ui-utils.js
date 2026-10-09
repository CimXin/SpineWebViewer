
window.toggleGroup = function(header) {
    header.parentElement.classList.toggle('open');
};

// 收藏功能逻辑
window.toggleFav = function(id, starEl, itemEl) {
    let favs = JSON.parse(localStorage.getItem('spine_favs') || '[]');
    const idx = favs.indexOf(id);
    
    if (idx === -1) {
        favs.push(id);
        starEl.classList.add('active');
        itemEl.dataset.fav = "true";
    } else {
        favs.splice(idx, 1);
        starEl.classList.remove('active');
        itemEl.dataset.fav = "false";
    }
    
    localStorage.setItem('spine_favs', JSON.stringify(favs));
    
    // 如果当前处于“仅显示收藏”模式，需要刷新列表显隐
    if (window.currentFileTab === 'fav') {
        filterSpineFiles(document.getElementById('spine-file-search').value);
    }
};

window.currentFileTab = 'all'; // 'all' | 'fav'

window.switchFileTab = function(tab) {
    window.currentFileTab = tab;
    
    // 更新 Tab 样式
    const tabAll = document.getElementById('tab-all');
    const tabFav = document.getElementById('tab-fav');
    if(tabAll) tabAll.className = (tab === 'all') ? 'file-tab active' : 'file-tab';
    if(tabFav) tabFav.className = (tab === 'fav') ? 'file-tab active' : 'file-tab';
    
    // 触发筛选
    filterSpineFiles(document.getElementById('spine-file-search').value);
};

// 切换文件组
window.switchSpineFile = function(index) {
    if(!window.spineFileGroups) return;
    const group = window.spineFileGroups[index];
    if(!group) return;
    const files = group.files;
    loadSpineGroup(files);
    
    const items = document.querySelectorAll('.file-item');
    items.forEach(it => {
        if(parseInt(it.dataset.index) === parseInt(index)) it.classList.add('active');
        else it.classList.remove('active');
    });
};

// 搜索过滤逻辑
window.filterSpineFiles = function(keyword) {
    const listContainer = document.getElementById('custom-file-list');
    const items = listContainer.querySelectorAll('.file-item');
    const countLabel = document.getElementById('search-count');
    let matchCount = 0;
    keyword = keyword ? keyword.toLowerCase() : "";
    
    items.forEach(item => {
        const key = item.dataset.searchKey;
        const isFav = item.dataset.fav === "true";
        
        // 核心筛选逻辑：关键词匹配 && (如果不只看收藏 || 是收藏)
        const matchKeyword = key.includes(keyword);
        // 修复：使用 currentFileTab 判断是否仅显示收藏
        const matchFav = (window.currentFileTab === 'fav') ? isFav : true;
        
        if(matchKeyword && matchFav) {
            item.style.display = 'flex';
            matchCount++;
        } else {
            item.style.display = 'none';
        }
    });
    
    if (keyword || window.currentFileTab === 'fav') {
        countLabel.innerText = matchCount > 0 ? `${matchCount}个` : '无';
        countLabel.style.color = matchCount > 0 ? '#888' : '#f44';
    } else {
        countLabel.innerText = "";
    }
};

window.toggleFileView = function() {
    const list = document.getElementById('custom-file-list');
    const btn = document.getElementById('btn-view-mode');
    if (list.classList.contains('view-list')) {
        list.classList.remove('view-list');
        list.classList.add('view-grid');
        btn.innerText = "▦"; 
        localStorage.setItem('spine_view_mode', 'grid');
        if (window.loadVisibleThumbs) window.loadVisibleThumbs();
    } else {
        list.classList.remove('view-grid');
        list.classList.add('view-list');
        btn.innerText = "≣"; 
        localStorage.setItem('spine_view_mode', 'list');
    }
};

// 通用拖拽逻辑 (支持 Zoom 缩放修正版)
window.makeDraggable = function(elementId, handleId) {
    const elm = document.getElementById(elementId);
    const handle = document.getElementById(handleId);
    if (!elm || !handle) return;

    let isDragging = false;
    let startX, startY;
    let startLeft, startTop; // 记录逻辑 CSS 坐标

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        
        // 获取当前缩放比例 (默认为 1)
        const currentZoom = parseFloat(elm.style.zoom) || 1.0;
        
        // 1. 获取当前视觉位置 (屏幕坐标)
        const rect = elm.getBoundingClientRect();
        
        // 2. 将视觉坐标转换为逻辑 CSS 坐标
        // 逻辑坐标 = 视觉坐标 / Zoom
        const logicalLeft = rect.left / currentZoom;
        const logicalTop = rect.top / currentZoom;
        
        // 3. 锁定位置 (切换为 left/top 定位)
        // 这一步至关重要：如果之前是 bottom: 120px，现在需要算出等效的 top
        elm.style.left = logicalLeft + 'px';
        elm.style.top = logicalTop + 'px';
        elm.style.right = 'auto';  // 必须清除 right
        elm.style.bottom = 'auto'; // 必须清除 bottom
        elm.style.transform = 'none'; // 清除之前的 transform
        elm.style.transition = 'none'; // 禁用过渡以防止延迟
        
        startLeft = logicalLeft;
        startTop = logicalTop;
        startX = e.clientX;
        startY = e.clientY;
        
        handle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        // 获取当前缩放比例
        const currentZoom = parseFloat(elm.style.zoom) || 1.0;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        // 修正位移量：鼠标移动 10px，对于 Zoom=2 的元素，只需要移动 5px 逻辑像素
        elm.style.left = (startLeft + dx / currentZoom) + 'px';
        elm.style.top = (startTop + dy / currentZoom) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            handle.style.cursor = 'move';
            document.body.style.userSelect = '';
            elm.style.transition = ''; 
        }
    });
}

// 通用缩放逻辑 (锚点修正版：右下角手柄，固定左上角)
window.makeResizable = function(elementId, handleId) {
    const elm = document.getElementById(elementId);
    const handle = document.getElementById(handleId);
    if (!elm || !handle) return;

    let isResizing = false;
    let startX, startZoom;
    let anchorLeftVisual, anchorTopVisual;
    const BASE_WIDTH = 460; 

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation(); // 防止触发拖拽
        isResizing = true;
        startX = e.clientX;
        startZoom = parseFloat(elm.style.zoom) || 1.0;
        
        // 1. 记录缩放前的“锚点”位置 (左上角不动)
        const rect = elm.getBoundingClientRect();
        anchorLeftVisual = rect.left;
        anchorTopVisual = rect.top;
        
        // 2. 强制转换为 left/top 定位模式
        elm.style.left = (rect.left / startZoom) + 'px';
        elm.style.top = (rect.top / startZoom) + 'px';
        elm.style.right = 'auto';
        elm.style.bottom = 'auto';
        
        handle.style.cursor = 'nwse-resize';
        document.body.style.cursor = 'nwse-resize';
        document.body.style.userSelect = 'none';
        elm.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        // 向右拖动 (dx > 0) -> 放大
        const dx = e.clientX - startX; 
        
        // 计算新缩放比例
        let newZoom = startZoom + (dx / BASE_WIDTH);
        if (newZoom < 0.5) newZoom = 0.5;
        if (newZoom > 3.0) newZoom = 3.0;
        
        // 应用缩放
        elm.style.zoom = newZoom;
        
        // 补偿位置偏移，保持左上角不动
        // 逻辑 Left = 视觉 Left (常量) / 新 Zoom
        elm.style.left = (anchorLeftVisual / newZoom) + 'px';
        elm.style.top = (anchorTopVisual / newZoom) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            handle.style.cursor = 'nwse-resize'; // 恢复手柄 cursor
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            elm.style.transition = '';
        }
    });
}

window.toggleEventPanel = function() {
    const c = document.getElementById('event-panel-content');
    const a = document.getElementById('event-panel-arrow');
    if(c.style.display === 'none') {
        c.style.display = 'block';
        a.innerText = '▼';
    } else {
        c.style.display = 'none';
        a.innerText = '▶';
    }
};

window.toggleColorFilter = function() {
    const content = document.getElementById('color-filter-content');
    const arrow = document.getElementById('color-filter-arrow');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.innerText = '▼';
    } else {
        content.style.display = 'none';
        arrow.innerText = '▶';
    }
};
