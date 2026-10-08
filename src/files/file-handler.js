window.readFileAsText = async function(file) {
    if(file.url) return await (await fetch(file.url)).text();
    return new Promise((r,j) => { const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.onerror=j; fr.readAsText(file); });
};
window.readFileAsArrayBuffer = async function(file) {
    if(file.url) return await (await fetch(file.url)).arrayBuffer();
    return new Promise((r,j) => { const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.onerror=j; fr.readAsArrayBuffer(file); });
};
window.readFileAsDataURL = async function(file) {
    if(file.url) return file.url; 
    return new Promise((r,j) => { const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.onerror=j; fr.readAsDataURL(file); });
};

const isNative = window.chrome && window.chrome.webview;
if (isNative) {
    document.getElementById('web-input').style.display = 'none';
    document.getElementById('native-input').style.display = 'block';
    log("已连接到本地引擎");
}

window.openNativeFolder = async function() {
    try {
        const jsonStr = await window.chrome.webview.hostObjects.native.SelectFolder();
        const data = JSON.parse(jsonStr);
        if(data.files && data.files.length > 0) {
            handleFiles(data.files);
        }
    } catch(e) {
        alert("打开失败: " + e);
    }
}

const dropZone = document.getElementById('drop-zone');
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
document.getElementById('folder-input').addEventListener('change', e => handleFiles(e.target.files));

// 强制切换版本
window.forceSwitchVersion = function(ver) {
    if (!window.currentSpineFiles) return;
    log(`手动切换至: ${ver} ...`);
    loadSpineGroup(window.currentSpineFiles, ver);
};

window.handleFiles = async function(files) {
    if(!files || files.length === 0) return;
    
    console.log("Start handling files:", files.length);
    const groups = {};
    for(let i=0; i<files.length; i++) {
        let f = files[i];
        let name = f.name; 
        let path = f.webkitRelativePath || "";
        
        let folderPath = "";
        if (path.indexOf('/') !== -1) {
            folderPath = path.substring(0, path.lastIndexOf('/'));
        }
        
        let lowerName = name.toLowerCase();
        if(lowerName.startsWith('.')) continue;
        
        let baseName = name.substring(0, name.lastIndexOf('.'));
        if(lowerName.endsWith('.atlas.txt')) baseName = name.substring(0, name.toLowerCase().indexOf('.atlas.txt'));
        else if(lowerName.endsWith('.json.txt')) baseName = name.substring(0, name.toLowerCase().indexOf('.json.txt'));
        else if(lowerName.endsWith('.skel.bytes')) baseName = name.substring(0, name.toLowerCase().indexOf('.skel.bytes'));
        
        let uniqueKey = folderPath + "/" + baseName;
        
        if(!groups[uniqueKey]) groups[uniqueKey] = { name: baseName, folder: folderPath, files: [] };
        groups[uniqueKey].files.push(f);
    }
    
    // 2. 筛选有效组
    const validGroups = [];
    for(let key in groups) {
        const g = groups[key];
        let hasAtlas = false, hasPng = false, hasData = false;
        
        for(let f of g.files) {
            let n = f.name.toLowerCase();
            if(n.endsWith('.atlas') || n.endsWith('.atlas.txt')) hasAtlas = true;
            else if(n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.webp')) hasPng = true;
            else if(n.endsWith('.skel') || n.endsWith('.json') || n.endsWith('.skel.bytes') || n.endsWith('.json.txt')) hasData = true;
        }
        
        if(hasAtlas && hasPng && hasData) {
            if(g.folder) g.displayName = g.folder + "/" + g.name;
            else g.displayName = g.name;
            validGroups.push(g);
        }
    }
    
    if(validGroups.length === 0) {
        alert("❌ 未找到完整的 Spine 文件组！\n请确保每个子文件夹内包含完整的: .skel/.json + .atlas + .png");
        return;
    }
    
    validGroups.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    // 3. 填充自定义列表
    window.spineFileGroups = validGroups;
    const listContainer = document.getElementById('custom-file-list');
    listContainer.innerHTML = "";
    
    // 读取收藏列表
    const favList = JSON.parse(localStorage.getItem('spine_favs') || '[]');

    validGroups.forEach(async (g, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        if(index === 0) item.classList.add('active'); 
        item.dataset.index = index;
        // 存储唯一ID用于搜索
        item.dataset.searchKey = g.displayName.toLowerCase();
        
        // 点击切换文件
        item.onclick = (e) => {
            // 如果点的是星星，不触发切换
            if(e.target.classList.contains('star-btn')) return;

            document.querySelectorAll('.file-item').forEach(d => d.classList.remove('active'));
            item.classList.add('active');
            switchSpineFile(index);
        };
        
        // === 星星图标 ===
        const star = document.createElement('span');
        star.className = 'star-btn';
        star.innerHTML = '★'; 
        star.title = '收藏/取消收藏';
        
        // 检查是否已收藏
        const isFav = favList.includes(g.displayName);
        if(isFav) {
            star.classList.add('active');
            item.dataset.fav = "true";
        } else {
            item.dataset.fav = "false";
        }

        // 点击星星逻辑
        star.onclick = (e) => {
            e.stopPropagation(); // 阻止冒泡
            toggleFav(g.displayName, star, item);
        };

        let thumbUrl = (window.__ASSET_BASE__ || "/") + "vendor/icon.png"; 
        let pngFile = null;
        for(let f of g.files) {
            if(f.name.toLowerCase() === 'preview.png') { pngFile = f; break; }
        }
        if(!pngFile) {
            for(let f of g.files) {
                if(f.name.toLowerCase().endsWith('.png') || f.name.toLowerCase().endsWith('.jpg')) { pngFile = f; break; }
            }
        }
        if(pngFile) thumbUrl = URL.createObjectURL(pngFile);
        
        const img = document.createElement('img');
        img.className = 'file-thumb';
        img.src = thumbUrl;
        
        const info = document.createElement('div');
        info.className = 'file-info';
        
        const name = document.createElement('div');
        name.className = 'file-name';
        name.innerText = g.name;
        
        const path = document.createElement('div');
        path.className = 'file-path';
        path.innerText = g.folder || "/";
        
        info.appendChild(name);
        info.appendChild(path);
        
        item.appendChild(star); // 插入星星
        item.appendChild(img);
        item.appendChild(info);
        listContainer.appendChild(item);
    });
    
    if(validGroups.length > 1) {
        document.getElementById('file-list-container').style.display = 'block';
    } else {
        document.getElementById('file-list-container').style.display = 'none';
    }
    
    loadSpineGroup(validGroups[0].files);
};
