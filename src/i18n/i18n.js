/* zh/en UI strings. Default is Chinese. Choice is stored in localStorage under spine-viewer-lang. */
(function () {
    var KEY = "spine-viewer-lang";
    var STR = {
        zh: {
            "app.title": "Spine查看器",
            "splash.brand": "Spine查看器",
            "splash.player": "播放器",
            "splash.openFolder": "打开动画文件夹",
            "splash.openLocal": "打开本地文件夹",
            "status.wait": "等待文件...",
            "origin.title": "原点坐标轴",
            "fx.title": "⚡ 特效管理器",
            "fx.tabRes": "1. 特效资源库",
            "fx.tabBind": "2. 事件绑定配置",
            "fx.importSeq": "📂 导入序列帧文件夹",
            "fx.importSheet": "🖼️ 导入精灵图 (Sprite Sheet)",
            "fx.imported": "已导入的特效 (点击 ▶ 预览):",
            "fx.emptyImport": "暂无特效，请点击上方按钮导入",
            "fx.empty": "暂无特效",
            "fx.events": "检测到的骨架事件 (Event)",
            "fx.actions": "绑定动作 (Action)",
            "fx.noEvents": "未检测到事件，或者未加载模型",
            "fx.bindHint": "* 绑定后，播放动画时触发对应事件即可自动播放特效",
            "fx.rescan": "🔄 重新扫描事件",
            "fx.scan": "🔍 扫描事件",
            "fx.noEventsAlert": "未检测到事件 (可能是纯动作文件或事件未导出)",
            "fx.noEventsDetail": "当前骨架没有检测到事件<br><span style=\"font-size:10px\">(可能是纯动作文件，或事件未正确导出)</span>",
            "fx.settings": "设置属性",
            "fx.preview": "预览",
            "fx.stop": "停止",
            "fx.delete": "删除",
            "fx.confirmDelete": "确定删除特效 {name} 吗？",
            "fx.frames": "{name} ({n}帧)",
            "fx.scaleX": "缩放 X",
            "fx.scaleY": "缩放 Y",
            "fx.rotation": "旋转",
            "fx.offX": "X 偏移",
            "fx.offY": "Y 偏移",
            "fx.fps": "帧率",
            "fx.layer": "层",
            "fx.zTitle": "层级",
            "fx.times": "次",
            "fx.playCount": "播放次数",
            "fx.loop": "无限循环",
            "fx.body": "🧍 角色本体",
            "fx.addBind": "添加特效绑定",
            "fx.analyzing": "正在分析文件结构...",
            "fx.loadingN": "正在加载 {n} 个特效...",
            "fx.noneFound": "未找到有效的图片序列！",
            "fx.importedN": "成功导入 {n} 个特效！",
            "fx.loadFail": "加载失败：{msg}",
            "fx.sliceFail": "切图失败: {msg}",
            "file.addFolder": "📂 追加文件夹",
            "file.addOne": "＋ 添加单个",
            "file.addOneTip": "在同一次选择里选中 .json 或 .skel，以及这一套的 .atlas 和贴图。没选中的同目录文件页面读不到。",
            "file.clear": "清空列表",
            "file.loaded": "已加载的骨架（再次添加会追加）:",
            "file.all": "全部文件",
            "file.fav": "★ 我的收藏",
            "file.search": "🔍 搜索文件名...",
            "file.view": "切换视图模式 (列表/预览)",
            "file.favToggle": "收藏/取消收藏",
            "file.count": "{n}个",
            "file.none": "无",
            "file.engine": "已连接到本地引擎",
            "file.openFail": "打开失败: {msg}",
            "file.switchVer": "手动切换至: {v} ...",
            "file.cleared": "列表已清空",
            "file.incomplete": "未找到完整的 Spine 文件。\n需要成套的 .json/.skel + .atlas + 贴图。\n添加单个时，请在同一次选择里同时选中这些文件。页面读不到没选中的同目录文件。",
            "file.dup": "已在列表中，跳过 {n} 个重复骨架",
            "file.noNew": "没有新的骨架",
            "file.addedSkip": "追加 {a} 个，跳过 {s} 个重复",
            "file.added": "已加入 {n} 个骨架",
            "export.label": "导出序列帧:",
            "export.prefix": "前缀",
            "export.format": "格式:",
            "export.png": "PNG 序列帧 (默认)",
            "export.gif": "GIF 动图 (支持透明)",
            "export.scale": "缩放:",
            "export.batch": "批量:",
            "export.batchAll": "导出所有动作",
            "export.choose": "📂 选择文件夹并导出",
            "export.exporting": "正在导出序列帧...",
            "export.init": "正在初始化...",
            "export.progress": "正在处理 ({i}/{n}): {name}",
            "export.done": "全部导出完成！",
            "export.fail": "导出出错: {msg}",
            "export.running": "正在导出 {name}...",
            "export.noSkel": "无法获取骨架数据",
            "export.noWebCodecs": "当前浏览器不支持 WebCodecs API (请使用最新版 Chrome/Edge)",
            "export.codec": "视频编码器错误: {msg}",
            "anim.title": "🎬 动画",
            "anim.track0": "主动画 (Track 0)",
            "anim.addTrack": "➕ 添加叠加轨道",
            "anim.skin": "选择皮肤",
            "anim.pma": "预乘 Alpha (PMA)",
            "anim.pmaTip": "开启后，图片加载时不进行预乘（因为图片已经预乘过了），渲染时使用 One 混合模式。",
            "anim.unpackTip": "开启后，让 WebGL 在加载图片时自动乘上 Alpha。通常用于直通(Straight)导出的图片。",
            "anim.needModel": "请先加载模型！",
            "track.alpha": "混合权重",
            "track.remove": "移除轨道",
            "bone.title": "💀 骨骼显示",
            "bone.show": "显示骨骼",
            "bone.color": "骨骼颜色",
            "bone.width": "骨骼粗细",
            "hier.title": "🌳 骨骼层级",
            "hier.hint": "点选骨骼会在画面上标出它的位置。再点一次取消。",
            "hier.empty": "未加载骨架",
            "event.title": "⚡ 事件监视器",
            "event.manage": "✨ 管理特效 / 绑定",
            "event.toasts": "显示弹幕",
            "event.clear": "清空",
            "event.color": "颜色:",
            "event.yellow": "默认黄",
            "event.red": "红",
            "event.green": "绿",
            "event.blue": "蓝",
            "event.white": "白",
            "event.waiting": "等待事件触发...",
            "bg.title": "🖼️ 参考背景",
            "bg.color": "背景颜色",
            "bg.checker": "透明/棋盘格",
            "bg.image": "背景图片",
            "bg.show": "显示",
            "bg.choose": "📂 选择",
            "bg.reset": "重置参数",
            "bg.remove": "移除",
            "bg.x": "X 位移",
            "bg.y": "Y 位移",
            "bg.size": "大小",
            "bg.opacity": "透明度",
            "color.title": "🎨 角色调色板",
            "color.hue": "色相",
            "color.sat": "饱和度",
            "color.light": "亮度",
            "color.tint": "整体染色",
            "color.reset": "重置",
            "play.speed": "倍速",
            "play.fps": "帧率",
            "play.reset": "归位",
            "play.stepBack": "逐帧后退",
            "play.stepFwd": "逐帧前进",
            "nav.github": "在 GitHub 上打开本仓库",
            "version.auto": "自动识别",
            "version.detected": "已识别: {v}",
            "sheet.title": "📐 精灵图切分配置",
            "sheet.rows": "行数:",
            "sheet.cols": "列数:",
            "sheet.total": "总帧数:",
            "sheet.all": "默认全部",
            "sheet.cancel": "取消",
            "sheet.confirm": "确认导入",
            "physics.reset": "💥 重置物理",
            "status.prepare": "正在准备预览…",
            "status.loadingSpine": "加载 Spine {v} …",
            "status.script": "无法加载脚本: {msg}",
            "status.missingAdapter": "缺少版本适配器: {entry}",
            "status.webglLost": "加载失败: WebGL 上下文已丢失",
            "status.version": "版本: {v}",
            "status.loaded": "加载完成",
            "status.loadFail": "加载失败: {msg}",
            "status.textureFail": "贴图解码失败",
            "status.decoding": "正在解码贴图…",
            "status.viewReset": "视图已重置",
            "status.physicsReset": "物理已重置",
            "status.missingFiles": "文件缺失: 需要 .json/.skel + .atlas + .png",
            "status.initFail": "初始化失败: {msg}",
            "status.loading42": "正在加载 (Spine 4.2)...",
            "status.parseBin": "解析二进制文件...",
            "status.parseJson": "解析 JSON 文件...",
            "status.webglOff": "WebGL 不可用",
            "status.bin37": "Spine 3.7 WebGL 官方运行时不支持二进制 (.skel) 文件。\n请使用 JSON 格式导出，或转换为 JSON。",
            "status.bin37log": "加载失败: 3.7 不支持二进制，请改用 JSON",
            "status.err37": "3.7 加载错误: {msg}",
            "status.err36": "3.6 加载错误: {msg}",
            "status.err38": "3.8 加载错误: {msg}",
            "status.err40": "4.0 加载错误: {msg}",
            "status.err41": "4.1 加载错误: {msg}",
            "status.bin36": "加载失败：\n\nSpine 官方的 JavaScript 运行时直到 3.8 版本才加入二进制 (.skel) 支持。\n3.6 版本的官方 Web 库仅支持 JSON 格式。\n\n请使用 Spine 编辑器将动画重新导出为 JSON 格式即可解决。",
            "status.bin36log": "加载失败: 3.6 不支持二进制，请改用 JSON",
            "status.bin36err": "加载 3.6 二进制异常: {msg}\n请使用 JSON 格式。"
        },
        en: {
            "app.title": "Spine Viewer",
            "splash.brand": "Spine Viewer",
            "splash.player": "Player",
            "splash.openFolder": "Open animation folder",
            "splash.openLocal": "Open local folder",
            "status.wait": "Waiting for files...",
            "origin.title": "Origin axes",
            "fx.title": "⚡ Effect manager",
            "fx.tabRes": "1. Effect library",
            "fx.tabBind": "2. Event bindings",
            "fx.importSeq": "📂 Import frame folder",
            "fx.importSheet": "🖼️ Import sprite sheet",
            "fx.imported": "Imported effects (click ▶ to preview):",
            "fx.emptyImport": "No effects yet. Use the buttons above to import.",
            "fx.empty": "No effects",
            "fx.events": "Skeleton events",
            "fx.actions": "Bound actions",
            "fx.noEvents": "No events found, or no model loaded",
            "fx.bindHint": "* Bound effects play when the matching event fires",
            "fx.rescan": "🔄 Rescan events",
            "fx.scan": "🔍 Scan events",
            "fx.noEventsAlert": "No events found (plain motion, or events were not exported)",
            "fx.noEventsDetail": "No events on this skeleton<br><span style=\"font-size:10px\">(plain motion, or events were not exported)</span>",
            "fx.settings": "Settings",
            "fx.preview": "Preview",
            "fx.stop": "Stop",
            "fx.delete": "Delete",
            "fx.confirmDelete": "Delete effect {name}?",
            "fx.frames": "{name} ({n} frames)",
            "fx.scaleX": "Scale X",
            "fx.scaleY": "Scale Y",
            "fx.rotation": "Rotation",
            "fx.offX": "Offset X",
            "fx.offY": "Offset Y",
            "fx.fps": "FPS",
            "fx.layer": "Z",
            "fx.zTitle": "Z-index",
            "fx.times": "×",
            "fx.playCount": "Play count",
            "fx.loop": "Infinite loop",
            "fx.body": "🧍 Character",
            "fx.addBind": "Add effect binding",
            "fx.analyzing": "Analyzing files...",
            "fx.loadingN": "Loading {n} effects...",
            "fx.noneFound": "No image sequence found.",
            "fx.importedN": "Imported {n} effects.",
            "fx.loadFail": "Load failed: {msg}",
            "fx.sliceFail": "Slice failed: {msg}",
            "file.addFolder": "📂 Add folder",
            "file.addOne": "＋ Add files",
            "file.addOneTip": "Select the .json or .skel together with its .atlas and textures. Files you leave unselected cannot be read.",
            "file.clear": "Clear list",
            "file.loaded": "Loaded skeletons (adding more appends):",
            "file.all": "All files",
            "file.fav": "★ Favorites",
            "file.search": "🔍 Search file names...",
            "file.view": "Toggle list / preview",
            "file.favToggle": "Favorite",
            "file.count": "{n}",
            "file.none": "None",
            "file.engine": "Connected to the local engine",
            "file.openFail": "Could not open: {msg}",
            "file.switchVer": "Switching to {v}...",
            "file.cleared": "List cleared",
            "file.incomplete": "Incomplete Spine files.\nNeed a .json/.skel plus .atlas and textures.\nWhen adding files, select the whole set at once.",
            "file.dup": "Already listed, skipped {n} duplicate skeletons",
            "file.noNew": "No new skeletons",
            "file.addedSkip": "Added {a}, skipped {s} duplicates",
            "file.added": "Added {n} skeletons",
            "export.label": "Export frames:",
            "export.prefix": "Prefix",
            "export.format": "Format:",
            "export.png": "PNG sequence (default)",
            "export.gif": "GIF (with transparency)",
            "export.scale": "Scale:",
            "export.batch": "Batch:",
            "export.batchAll": "Export all animations",
            "export.choose": "📂 Choose folder and export",
            "export.exporting": "Exporting frames...",
            "export.init": "Preparing...",
            "export.progress": "Processing ({i}/{n}): {name}",
            "export.done": "Export complete",
            "export.fail": "Export failed: {msg}",
            "export.running": "Exporting {name}...",
            "export.noSkel": "No skeleton data",
            "export.noWebCodecs": "This browser has no WebCodecs API (use a current Chrome or Edge)",
            "export.codec": "Video encoder error: {msg}",
            "anim.title": "🎬 Animation",
            "anim.track0": "Main animation (Track 0)",
            "anim.addTrack": "➕ Add track",
            "anim.skin": "Skin",
            "anim.pma": "Premultiply alpha (PMA)",
            "anim.pmaTip": "Textures are already premultiplied. Skip premultiply on load and use One blending.",
            "anim.unpackTip": "Let WebGL multiply alpha on load. Use this for straight (non-premultiplied) textures.",
            "anim.needModel": "Load a model first.",
            "track.alpha": "Mix weight",
            "track.remove": "Remove track",
            "bone.title": "💀 Bones",
            "bone.show": "Show bones",
            "bone.color": "Bone color",
            "bone.width": "Bone width",
            "hier.title": "🌳 Hierarchy",
            "hier.hint": "Click a bone to mark it. Click again to clear.",
            "hier.empty": "No skeleton loaded",
            "event.title": "⚡ Events",
            "event.manage": "✨ Manage effects",
            "event.toasts": "Show toasts",
            "event.clear": "Clear",
            "event.color": "Color:",
            "event.yellow": "Yellow",
            "event.red": "Red",
            "event.green": "Green",
            "event.blue": "Blue",
            "event.white": "White",
            "event.waiting": "Waiting for an event...",
            "bg.title": "🖼️ Reference",
            "bg.color": "Background color",
            "bg.checker": "Transparent / checker",
            "bg.image": "Background image",
            "bg.show": "Show",
            "bg.choose": "📂 Choose",
            "bg.reset": "Reset",
            "bg.remove": "Remove",
            "bg.x": "X offset",
            "bg.y": "Y offset",
            "bg.size": "Size",
            "bg.opacity": "Opacity",
            "color.title": "🎨 Color",
            "color.hue": "Hue",
            "color.sat": "Saturation",
            "color.light": "Lightness",
            "color.tint": "Tint",
            "color.reset": "Reset",
            "play.speed": "Speed",
            "play.fps": "FPS",
            "play.reset": "Reset view",
            "play.stepBack": "Step back one frame",
            "play.stepFwd": "Step forward one frame",
            "nav.github": "Open this repository on GitHub",
            "version.auto": "Auto",
            "version.detected": "Detected: {v}",
            "sheet.title": "📐 Sprite sheet",
            "sheet.rows": "Rows:",
            "sheet.cols": "Columns:",
            "sheet.total": "Total frames:",
            "sheet.all": "All frames",
            "sheet.cancel": "Cancel",
            "sheet.confirm": "Import",
            "physics.reset": "💥 Reset physics",
            "status.prepare": "Preparing preview…",
            "status.loadingSpine": "Loading Spine {v}…",
            "status.script": "Could not load script: {msg}",
            "status.missingAdapter": "Missing version adapter: {entry}",
            "status.webglLost": "Load failed: WebGL context was lost",
            "status.version": "Version: {v}",
            "status.loaded": "Loaded",
            "status.loadFail": "Load failed: {msg}",
            "status.textureFail": "Texture decode failed",
            "status.decoding": "Decoding textures…",
            "status.viewReset": "View reset",
            "status.physicsReset": "Physics reset",
            "status.missingFiles": "Missing files: need .json/.skel + .atlas + .png",
            "status.initFail": "Init failed: {msg}",
            "status.loading42": "Loading Spine 4.2...",
            "status.parseBin": "Parsing binary...",
            "status.parseJson": "Parsing JSON...",
            "status.webglOff": "WebGL is unavailable",
            "status.bin37": "The official Spine 3.7 WebGL runtime cannot read binary (.skel) files.\nExport JSON instead.",
            "status.bin37log": "Load failed: 3.7 has no binary support, use JSON",
            "status.err37": "3.7 load error: {msg}",
            "status.err36": "3.6 load error: {msg}",
            "status.err38": "3.8 load error: {msg}",
            "status.err40": "4.0 load error: {msg}",
            "status.err41": "4.1 load error: {msg}",
            "status.bin36": "Load failed.\n\nOfficial Spine JavaScript runtimes only read binary (.skel) from 3.8 onward.\nThe 3.6 web runtime accepts JSON only.\n\nRe-export the animation as JSON from the Spine editor.",
            "status.bin36log": "Load failed: 3.6 has no binary support, use JSON",
            "status.bin36err": "3.6 binary error: {msg}\nUse JSON instead."
        }
    };

    function format(str, vars) {
        if (!vars) return str;
        return String(str).replace(/\{(\w+)\}/g, function (_, k) {
            return vars[k] == null ? "" : String(vars[k]);
        });
    }

    function readLang() {
        try {
            var saved = localStorage.getItem(KEY);
            if (saved === "en" || saved === "zh") return saved;
        } catch (e) {}
        return "zh";
    }

    window.t = function (key, vars) {
        var lang = window.viewerLang === "en" ? "en" : "zh";
        var table = STR[lang] || STR.zh;
        var str = table[key];
        if (str == null) str = STR.zh[key];
        if (str == null) str = key;
        return format(str, vars);
    };

    window.applyI18n = function (root) {
        var scope = root || document;
        scope.querySelectorAll("[data-i18n]").forEach(function (el) {
            el.textContent = window.t(el.getAttribute("data-i18n"));
        });
        scope.querySelectorAll("[data-i18n-html]").forEach(function (el) {
            el.innerHTML = window.t(el.getAttribute("data-i18n-html"));
        });
        scope.querySelectorAll("[data-i18n-title]").forEach(function (el) {
            el.title = window.t(el.getAttribute("data-i18n-title"));
        });
        scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
            el.placeholder = window.t(el.getAttribute("data-i18n-placeholder"));
        });
        scope.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
            el.setAttribute("aria-label", window.t(el.getAttribute("data-i18n-aria")));
        });
    };

    function paintSwitcher(lang) {
        document.querySelectorAll("#lang-switch [data-lang]").forEach(function (btn) {
            btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
        });
    }

    function refreshLive() {
        window.applyI18n(document);
        var ver = document.getElementById("version-select");
        if (ver && ver.options[0] && ver.options[0].dataset.detected) {
            ver.options[0].textContent = window.t("version.detected", { v: ver.options[0].dataset.detected });
        }
        var log = document.getElementById("log");
        if (log && log.dataset.i18nKey) {
            var vars = {};
            try { vars = JSON.parse(log.dataset.i18nVars || "{}"); } catch (e) {}
            log.textContent = window.t(log.dataset.i18nKey, vars);
        } else if (log && !log.dataset.touched) {
            log.textContent = window.t("status.wait");
        }
        var phy = document.getElementById("btn-reset-phy");
        if (phy) phy.textContent = window.t("physics.reset");
        if (window.filterSpineFiles) {
            var input = document.getElementById("spine-file-search");
            window.filterSpineFiles(input ? input.value : "");
        }
        if (window.refreshBoneTree) window.refreshBoneTree();
        if (window.effectSystem) {
            if (typeof window.effectSystem.updateResList === "function") window.effectSystem.updateResList();
            if (typeof window.effectSystem.refreshBindList === "function") {
                try { window.effectSystem.refreshBindList(); } catch (e) {}
            }
        }
        paintSwitcher(window.viewerLang);
    }

    window.setLang = function (lang) {
        window.viewerLang = lang === "en" ? "en" : "zh";
        try { localStorage.setItem(KEY, window.viewerLang); } catch (e) {}
        document.documentElement.lang = window.viewerLang === "en" ? "en" : "zh-CN";
        document.title = window.t("app.title");
        refreshLive();
    };

    window.viewerLang = readLang();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { window.setLang(window.viewerLang); });
    } else {
        window.setLang(window.viewerLang);
    }

    document.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest ? e.target.closest("#lang-switch [data-lang]") : null;
        if (!btn) return;
        window.setLang(btn.getAttribute("data-lang"));
    });
})();
