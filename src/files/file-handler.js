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
};

document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => {
    e.preventDefault();
    collectDroppedFiles(e.dataTransfer).then(files => handleFiles(files));
});

document.getElementById('folder-input').addEventListener('change', e => {
    handleFiles(e.target.files);
    e.target.value = '';
});
document.getElementById('files-input').addEventListener('change', e => {
    handleFiles(e.target.files);
    e.target.value = '';
});

window.forceSwitchVersion = function(ver) {
    if (!window.currentSpineFiles) return;
    log(`手动切换至: ${ver} ...`);
    loadSpineGroup(window.currentSpineFiles, ver);
};

function classifySpineFile(name) {
    const n = name.toLowerCase();
    if (n.endsWith('.atlas') || n.endsWith('.atlas.txt')) return 'atlas';
    if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.webp')) return 'image';
    if (n.endsWith('.skel') || n.endsWith('.json') || n.endsWith('.skel.bytes') || n.endsWith('.json.txt')) return 'data';
    return null;
}

function spineBaseName(name) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.atlas.txt')) return name.slice(0, lower.indexOf('.atlas.txt'));
    if (lower.endsWith('.json.txt')) return name.slice(0, lower.indexOf('.json.txt'));
    if (lower.endsWith('.skel.bytes')) return name.slice(0, lower.indexOf('.skel.bytes'));
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
}

function folderOf(file) {
    const path = file.webkitRelativePath || '';
    const slash = path.lastIndexOf('/');
    return slash === -1 ? '' : path.slice(0, slash);
}

function nameScore(dataBase, assetBase) {
    const a = dataBase.toLowerCase();
    const b = assetBase.toLowerCase();
    if (a === b) return 100;
    if (a.startsWith(b) || b.startsWith(a)) return 80 - Math.abs(a.length - b.length);
    return 0;
}

function pickBest(dataBase, files) {
    let best = null;
    let bestScore = 0;
    for (const file of files) {
        const score = nameScore(dataBase, spineBaseName(file.name));
        if (score > bestScore) {
            best = file;
            bestScore = score;
        }
    }
    return best;
}

function groupSpineFiles(fileList) {
    const byFolder = new Map();
    for (const file of fileList) {
        if (!file || !file.name || file.name.startsWith('.')) continue;
        if (!classifySpineFile(file.name)) continue;
        const folder = folderOf(file);
        if (!byFolder.has(folder)) byFolder.set(folder, []);
        byFolder.get(folder).push(file);
    }

    const groups = [];
    for (const [folder, files] of byFolder) {
        const dataFiles = files.filter(f => classifySpineFile(f.name) === 'data');
        const atlases = files.filter(f => classifySpineFile(f.name) === 'atlas');
        const images = files.filter(f => classifySpineFile(f.name) === 'image');
        const allowLoose = dataFiles.length === 1;
        for (const data of dataFiles) {
            const base = spineBaseName(data.name);
            let atlas = pickBest(base, atlases);
            if (!atlas && allowLoose && atlases.length === 1) atlas = atlases[0];
            const matchedImages = images.filter(img => nameScore(base, spineBaseName(img.name)) > 0);
            const related = matchedImages.length ? matchedImages.slice() : (allowLoose ? images.slice() : []);
            if (!atlas || !related.length) continue;
            const primary = pickBest(base, related) || related[0];
            const extras = related.filter(f => f !== primary);
            const identityName = folder ? `${folder}/${base}` : base;
            groups.push({
                name: base,
                folder,
                identityName,
                displayName: identityName,
                files: [data, atlas, ...extras, primary]
            });
        }
    }
    return groups;
}

function groupFingerprint(group) {
    const data = group.files.find(f => classifySpineFile(f.name) === 'data');
    const key = (group.identityName || group.displayName || '').toLowerCase();
    return [
        key,
        data ? data.size : 0,
        data ? data.lastModified || 0 : 0
    ].join('|');
}

function renderSpineFileList(activeIndex) {
    const groups = window.spineFileGroups || [];
    const listContainer = document.getElementById('custom-file-list');
    listContainer.querySelectorAll('img.file-thumb').forEach(img => {
        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    });
    listContainer.innerHTML = '';

    const favList = JSON.parse(localStorage.getItem('spine_favs') || '[]');
    const fallbackThumb = (window.__ASSET_BASE__ || '/') + 'vendor/icon.png';

    groups.forEach((g, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        if (index === activeIndex) item.classList.add('active');
        item.dataset.index = index;
        item.dataset.searchKey = g.displayName.toLowerCase();
        item.onclick = (e) => {
            if (e.target.classList.contains('star-btn')) return;
            document.querySelectorAll('.file-item').forEach(d => d.classList.remove('active'));
            item.classList.add('active');
            switchSpineFile(index);
        };

        const star = document.createElement('span');
        star.className = 'star-btn';
        star.innerHTML = '★';
        star.title = '收藏/取消收藏';
        const isFav = favList.includes(g.displayName);
        if (isFav) {
            star.classList.add('active');
            item.dataset.fav = 'true';
        } else {
            item.dataset.fav = 'false';
        }
        star.onclick = (e) => {
            e.stopPropagation();
            toggleFav(g.displayName, star, item);
        };

        let thumbUrl = fallbackThumb;
        let pngFile = g.files.find(f => f.name.toLowerCase() === 'preview.png');
        if (!pngFile) pngFile = g.files.find(f => classifySpineFile(f.name) === 'image');
        if (pngFile) thumbUrl = URL.createObjectURL(pngFile);

        const img = document.createElement('img');
        img.className = 'file-thumb';
        img.src = thumbUrl;

        const info = document.createElement('div');
        info.className = 'file-info';
        const name = document.createElement('div');
        name.className = 'file-name';
        const suffix = g.identityName && g.displayName.startsWith(g.identityName)
            ? g.displayName.slice(g.identityName.length)
            : '';
        name.innerText = g.name + suffix;
        const path = document.createElement('div');
        path.className = 'file-path';
        path.innerText = g.folder || '/';
        info.appendChild(name);
        info.appendChild(path);

        item.appendChild(star);
        item.appendChild(img);
        item.appendChild(info);
        listContainer.appendChild(item);
    });

    document.getElementById('file-list-container').style.display = groups.length ? 'block' : 'none';
    const search = document.getElementById('spine-file-search');
    if (search && window.filterSpineFiles) filterSpineFiles(search.value);
}

window.clearSpineList = function() {
    window.spineFileGroups = [];
    renderSpineFileList(-1);
    window.__dropZoneToken = (window.__dropZoneToken || 0) + 1;
    const panel = document.getElementById('file-panel');
    if (panel) panel.style.display = 'none';
    const drop = document.getElementById('drop-zone');
    if (drop) {
        drop.style.display = 'flex';
        drop.style.opacity = '1';
    }
    log('列表已清空');
};

function readAllEntries(reader) {
    return new Promise((resolve, reject) => {
        const all = [];
        const read = () => {
            reader.readEntries(batch => {
                if (!batch.length) resolve(all);
                else {
                    all.push(...batch);
                    read();
                }
            }, reject);
        };
        read();
    });
}

async function walkEntry(entry, prefix) {
    if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        const rel = prefix + file.name;
        try {
            Object.defineProperty(file, 'webkitRelativePath', { value: rel });
        } catch (e) { /* already defined */ }
        return [file];
    }
    if (!entry.isDirectory) return [];
    const children = await readAllEntries(entry.createReader());
    const nested = await Promise.all(children.map(child => walkEntry(child, prefix + entry.name + '/')));
    return nested.flat();
}

async function collectDroppedFiles(dataTransfer) {
    const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
    const entries = items.map(item => item.webkitGetAsEntry && item.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return Array.from(dataTransfer.files || []);
    const groups = await Promise.all(entries.map(entry => walkEntry(entry, '')));
    return groups.flat();
}

window.handleFiles = async function(files) {
    const list = Array.from(files || []);
    if (!list.length) return;

    const found = groupSpineFiles(list);
    if (!found.length) {
        alert('未找到完整的 Spine 文件。\n需要成套的 .json/.skel + .atlas + 贴图。\n添加单个动画时，请同时选中这几个文件。');
        return;
    }

    if (!window.spineFileGroups) window.spineFileGroups = [];
    const known = new Set(window.spineFileGroups.map(groupFingerprint));
    const added = [];
    let skipped = 0;
    found.sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const group of found) {
        const id = groupFingerprint(group);
        if (known.has(id)) {
            skipped++;
            continue;
        }
        known.add(id);
        let displayName = group.displayName;
        let n = 2;
        const names = new Set(window.spineFileGroups.map(g => g.displayName));
        while (names.has(displayName)) {
            displayName = `${group.displayName} (${n++})`;
        }
        group.displayName = displayName;
        window.spineFileGroups.push(group);
        added.push(group);
    }

    if (!added.length) {
        log(skipped ? `已在列表中，跳过 ${skipped} 个重复骨架` : '没有新的骨架');
        return;
    }

    const activeIndex = window.spineFileGroups.length - added.length;
    renderSpineFileList(activeIndex);
    const summary = skipped
        ? `追加 ${added.length} 个，跳过 ${skipped} 个重复`
        : `已加入 ${added.length} 个骨架`;
    log(summary);
    loadSpineGroup(added[0].files);
};
