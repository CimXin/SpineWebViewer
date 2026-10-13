/* Track 0 mix, queue, loop / once / ping-pong, timeline marks, setup pose, and side-by-side skeletons. */
(function () {
    var mode = "loop";
    var extras = [];
    var markName = null;

    function t(key, vars) {
        return window.t ? window.t(key, vars) : key;
    }

    function state() {
        return window.animationState || null;
    }

    function skeleton() {
        return window.skeleton || null;
    }

    function currentEntry() {
        var st = state();
        if (!st) return null;
        try {
            if (typeof st.getCurrent === "function") return st.getCurrent(0);
        } catch (e) {}
        return st.tracks ? st.tracks[0] : null;
    }

    function mixSeconds() {
        var el = document.getElementById("mix-duration");
        var n = el ? parseFloat(el.value) : 0;
        if (!isFinite(n) || n < 0) n = 0;
        if (n > 5) n = 5;
        return n;
    }

    function readMode() {
        var el = document.getElementById("play-mode");
        mode = el && el.value ? el.value : "loop";
        return mode;
    }

    function loopFor(kind) {
        return (kind || mode) === "loop";
    }

    function applyMix(entry) {
        if (!entry) return entry;
        var mix = mixSeconds();
        if (isFinite(mix) && mix >= 0) entry.mixDuration = mix;
        return entry;
    }

    function animationNames(data) {
        var list = data && data.animations ? data.animations : [];
        var names = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].name) names.push(list[i].name);
        }
        return names;
    }

    function fillSelect(el, names, selected) {
        if (!el) return;
        var keep = selected != null ? selected : el.value;
        el.replaceChildren();
        for (var i = 0; i < names.length; i++) {
            var opt = document.createElement("option");
            opt.value = names[i];
            opt.textContent = names[i];
            el.appendChild(opt);
        }
        if (keep && names.indexOf(keep) >= 0) el.value = keep;
    }

    function fillQueueSelect() {
        var sk = skeleton();
        fillSelect(document.getElementById("queue-anim"), animationNames(sk && sk.data));
    }

    function refreshQueue() {
        var el = document.getElementById("queue-list");
        if (!el) return;
        el.replaceChildren();
        var entry = currentEntry();
        var next = entry && entry.next;
        var any = false;
        while (next) {
            any = true;
            var row = document.createElement("div");
            row.className = "queue-name";
            var anim = next.animation;
            row.textContent = anim && anim.name ? anim.name : "";
            el.appendChild(row);
            next = next.next;
        }
        if (!any) {
            var empty = document.createElement("p");
            empty.className = "debug-hint";
            empty.textContent = t("anim.queueEmpty");
            el.appendChild(empty);
        }
    }

    function addMark(box, pct, kind, title) {
        var el = document.createElement("span");
        el.className = "tl-mark " + kind;
        var p = Math.max(0, Math.min(1, pct)) * 100;
        el.style.left = p + "%";
        if (title) el.title = title;
        box.appendChild(el);
    }

    function refreshMarks() {
        var box = document.getElementById("timeline-marks");
        if (!box) return;
        box.replaceChildren();
        var entry = currentEntry();
        var anim = entry && entry.animation;
        if (!anim || !(anim.duration > 0) || !anim.timelines) return;
        var duration = anim.duration;
        var seen = {};
        var n = 0;
        var timelines = anim.timelines;
        for (var ti = 0; ti < timelines.length && n < 140; ti++) {
            var tl = timelines[ti];
            if (!tl) continue;
            if (tl.events && tl.events.length) {
                for (var ei = 0; ei < tl.events.length && n < 140; ei++) {
                    var ev = tl.events[ei];
                    if (!ev) continue;
                    var et = typeof ev.time === "number" ? ev.time : (tl.frames ? tl.frames[ei] : null);
                    if (typeof et !== "number") continue;
                    var en = (ev.data && ev.data.name) || "";
                    addMark(box, et / duration, "event", en);
                    n++;
                }
                continue;
            }
            var frames = tl.frames;
            if (!frames || !frames.length) continue;
            var entries = 1;
            if (typeof tl.getFrameEntries === "function") {
                try { entries = tl.getFrameEntries() || 1; } catch (e) { entries = 1; }
            } else if (typeof tl.getFrameCount === "function") {
                var countGuess = 0;
                try { countGuess = tl.getFrameCount(); } catch (e2) { countGuess = 0; }
                if (countGuess > 0 && frames.length >= countGuess) entries = Math.max(1, Math.round(frames.length / countGuess));
            }
            var count = Math.floor(frames.length / entries);
            for (var f = 0; f < count && n < 140; f++) {
                var time = frames[f * entries];
                if (typeof time !== "number" || time < 0 || time > duration + 0.02) continue;
                var key = Math.round((time / duration) * 1000);
                if (seen[key]) continue;
                seen[key] = 1;
                addMark(box, time / duration, "key", "");
                n++;
            }
        }
    }

    function updateWorld(sk) {
        if (!sk || typeof sk.updateWorldTransform !== "function") return;
        try {
            if (window.spine && spine.Physics) {
                var pose = spine.Physics.pose != null ? spine.Physics.pose : spine.Physics.update;
                sk.updateWorldTransform(pose);
                return;
            }
        } catch (e) {}
        try { sk.updateWorldTransform(); } catch (e2) {}
    }

    function boundsWidth(sk) {
        if (!sk || typeof sk.getBounds !== "function") return 180;
        try {
            var offset = { x: 0, y: 0, set: function (x, y) { this.x = x; this.y = y; } };
            var size = { x: 0, y: 0, set: function (x, y) { this.x = x; this.y = y; } };
            sk.getBounds(offset, size, []);
            if (size.x > 1) return size.x;
        } catch (e) {}
        return 180;
    }

    function rowSpacing() {
        var w = boundsWidth(skeleton());
        for (var i = 0; i < extras.length; i++) w = Math.max(w, boundsWidth(extras[i].skeleton));
        return w + Math.max(24, w * 0.12);
    }

    function boundsCenterX(sk) {
        if (!sk || typeof sk.getBounds !== "function") return sk ? (sk.x || 0) : 0;
        try {
            var offset = { x: 0, y: 0, set: function (x, y) { this.x = x; this.y = y; } };
            var size = { x: 0, y: 0, set: function (x, y) { this.x = x; this.y = y; } };
            sk.getBounds(offset, size, []);
            if (size.x > 1) return offset.x + size.x / 2;
        } catch (e) {}
        return sk.x || 0;
    }

    function stageView(canvasW) {
        var left = 378;
        var right = (canvasW || window.innerWidth) - 332;
        var panel = document.getElementById("file-panel");
        var inspector = document.getElementById("ui");
        if (panel) {
            var pr = panel.getBoundingClientRect();
            if (pr.width > 40) left = pr.right + 8;
        }
        if (inspector && inspector.style.display !== "none") {
            var ir = inspector.getBoundingClientRect();
            if (ir.width > 40) right = ir.left - 8;
        }
        if (right < left + 80) right = left + 80;
        return { left: left, right: right, width: right - left, centerX: (left + right) / 2 };
    }

    function pushExtra(item) {
        if (extras.length >= 4) extras.shift();
        extras.push(item);
        refreshStage();
    }

    function refreshStage() {
        var el = document.getElementById("stage-list");
        if (!el) return;
        el.replaceChildren();
        if (!extras.length) {
            var empty = document.createElement("p");
            empty.className = "debug-hint";
            empty.textContent = t("stage.empty");
            el.appendChild(empty);
            return;
        }
        for (var i = 0; i < extras.length; i++) {
            (function (extra, index) {
                var row = document.createElement("div");
                row.className = "stage-row";
                var label = document.createElement("span");
                label.className = "debug-name";
                label.textContent = extra.label || t("stage.copy", { n: index + 1 });
                label.title = label.textContent;
                var sel = document.createElement("select");
                var names = animationNames(extra.skeleton && extra.skeleton.data);
                fillSelect(sel, names, extra.anim);
                sel.onchange = function () {
                    extra.anim = sel.value;
                    if (!extra.state) return;
                    try {
                        var entry = extra.state.setAnimation(0, sel.value, loopFor(readMode()));
                        applyMix(entry);
                        if (readMode() === "pingpong" && entry) entry.loop = false;
                    } catch (e) {}
                };
                var btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = t("stage.remove");
                btn.onclick = function () {
                    extras.splice(index, 1);
                    refreshStage();
                };
                row.appendChild(label);
                row.appendChild(sel);
                row.appendChild(btn);
                el.appendChild(row);
            })(extras[i], i);
        }
    }

    function makeSkeleton(data) {
        var sk = new spine.Skeleton(data);
        try { sk.setToSetupPose(); } catch (e) {}
        var primary = skeleton();
        if (primary && primary.skin && typeof sk.setSkin === "function") {
            try { sk.setSkin(primary.skin); } catch (e2) {}
        }
        updateWorld(sk);
        var animState = new spine.AnimationState(new spine.AnimationStateData(data));
        var names = animationNames(data);
        var anim = names.length ? names[0] : "";
        if (anim) {
            try { animState.setAnimation(0, anim, true); } catch (e3) {}
        }
        return { skeleton: sk, state: animState, anim: anim };
    }

    function classify(files) {
        var map = { atlas: null, image: null, main: null };
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (!file || !file.name) continue;
            var name = file.name.toLowerCase();
            if (name.endsWith(".atlas") || name.endsWith(".atlas.txt")) map.atlas = file;
            else if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp")) map.image = file;
            else if (name.endsWith(".skel") || name.endsWith(".skel.bytes") || name.endsWith(".json") || name.endsWith(".json.txt")) map.main = file;
        }
        return map;
    }

    function loadImage(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("image"));
            };
            img.src = url;
        });
    }

    function makeTexture(gl, img) {
        var Ctor = spine.GLTexture || (spine.webgl && spine.webgl.GLTexture);
        if (!Ctor) throw new Error("texture");
        try { return new Ctor(gl, img, false); } catch (e) { return new Ctor(gl, img); }
    }

    async function loadExtraFiles(files, label) {
        if (!window.spine) throw new Error("runtime");
        var gl = window.spineInstance && window.spineInstance.gl;
        if (!gl) throw new Error("gl");
        var map = classify(files);
        if (!map.atlas || !map.image || !map.main) throw new Error("files");
        var atlasText = await window.readFileAsText(map.atlas);
        var img = await loadImage(map.image);
        var unpack = !!(window.viewerConfig && window.viewerConfig.unpackEnabled);
        try { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, unpack); } catch (e) {}
        var texture = makeTexture(gl, img);
        if (texture.setFilters) {
            try {
                texture.setFilters(gl.LINEAR, gl.LINEAR);
                texture.setWraps(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
            } catch (e2) {}
        }
        var atlas = new spine.TextureAtlas(atlasText, function () { return texture; });
        if (atlas.pages) {
            for (var p = 0; p < atlas.pages.length; p++) {
                atlas.pages[p].texture = texture;
                atlas.pages[p].width = img.width;
                atlas.pages[p].height = img.height;
            }
        }
        var loader = new spine.AtlasAttachmentLoader(atlas);
        var lower = map.main.name.toLowerCase();
        var data;
        if (lower.endsWith(".skel") || lower.endsWith(".skel.bytes")) {
            var buffer = await window.readFileAsArrayBuffer(map.main);
            var bin = new spine.SkeletonBinary(loader);
            bin.scale = 1;
            data = bin.readSkeletonData(new Uint8Array(buffer));
        } else {
            var text = await window.readFileAsText(map.main);
            var json = new spine.SkeletonJson(loader);
            json.scale = 1;
            var parsed = JSON.parse(text);
            try { data = json.readSkeletonData(parsed); }
            catch (e3) { data = json.readSkeletonData(text); }
        }
        var made = makeSkeleton(data);
        made.label = label || map.main.name;
        return made;
    }

    function onComplete(entry) {
        if (readMode() !== "pingpong" || !entry || entry.trackIndex) return;
        if (entry.next) return;
        var anim = entry.animation;
        if (!anim || !(anim.duration > 0)) return;
        var live = currentEntry();
        if (live && live !== entry) return;
        if ("reverse" in entry) {
            entry.reverse = !entry.reverse;
            entry.loop = false;
            entry.trackTime = 0;
            entry.trackLast = -1;
            entry.animationLast = -1;
            if ("nextAnimationLast" in entry) entry.nextAnimationLast = -1;
            return;
        }
        var scale = Math.abs(entry.timeScale || 1) || 1;
        if ((entry.timeScale || 1) >= 0) {
            entry.timeScale = -scale;
            entry.trackTime = anim.duration;
            entry.animationLast = anim.duration;
            entry.trackLast = anim.duration;
        }
    }

    function pingpongTick(entry) {
        var ctrl = window.animControl;
        if (!ctrl || !ctrl.isPlaying || ctrl.isScrubbing) return;
        if (readMode() !== "pingpong" || !entry || entry.next) return;
        if ("reverse" in entry) return;
        if ((entry.timeScale || 1) < 0 && entry.trackTime <= 0.0001) {
            entry.timeScale = Math.abs(entry.timeScale || 1) || 1;
            entry.trackTime = 0;
            entry.animationLast = -1;
            entry.trackLast = 0;
        }
    }

    var api = {
        mixSeconds: mixSeconds,
        attach: function () {
            var st = state();
            if (st && !st.__animDirector && typeof st.addListener === "function") {
                st.__animDirector = true;
                st.addListener({ complete: onComplete });
            }
            fillQueueSelect();
            refreshQueue();
            refreshStage();
            markName = null;
            refreshMarks();
        },
        playPrimary: function (name) {
            var st = state();
            if (!st || !name) return null;
            readMode();
            var entry = null;
            try { entry = st.setAnimation(0, name, loopFor()); }
            catch (e) { return null; }
            applyMix(entry);
            if (mode === "pingpong" && entry) {
                entry.loop = false;
                if ("reverse" in entry) entry.reverse = false;
                if (entry.timeScale < 0) entry.timeScale = Math.abs(entry.timeScale || 1);
            }
            if (window.animControl) window.animControl.releaseHold();
            markName = null;
            refreshMarks();
            refreshQueue();
            return entry;
        },
        enqueue: function () {
            var st = state();
            var sel = document.getElementById("queue-anim");
            if (!st || !sel || !sel.value) return;
            readMode();
            var entry = null;
            try { entry = st.addAnimation(0, sel.value, loopFor(), 0); }
            catch (e) { return; }
            applyMix(entry);
            if (mode === "pingpong" && entry) entry.loop = false;
            refreshQueue();
        },
        clearQueue: function () {
            var st = state();
            var entry = currentEntry();
            if (!st || !entry) {
                refreshQueue();
                return;
            }
            try {
                if (typeof st.clearNext === "function") st.clearNext(entry);
                else entry.next = null;
            } catch (e) { entry.next = null; }
            refreshQueue();
        },
        setMode: function (next) {
            mode = next || readMode();
            var entry = currentEntry();
            if (!entry) return;
            entry.loop = mode === "loop";
            if (mode !== "pingpong") {
                if ("reverse" in entry) entry.reverse = false;
                if (entry.timeScale < 0) entry.timeScale = Math.abs(entry.timeScale || 1);
            } else {
                entry.loop = false;
            }
        },
        setupPose: function () {
            var sk = skeleton();
            var st = state();
            if (!sk) return;
            try { if (st && st.clearTracks) st.clearTracks(); } catch (e) {}
            try { sk.setToSetupPose(); } catch (e2) {}
            try { if (sk.setSlotsToSetupPose) sk.setSlotsToSetupPose(); } catch (e3) {}
            updateWorld(sk);
            if (window.animControl) {
                window.animControl.pauseForStep();
                window.animControl.releaseHold();
                window.animControl.currentTime = 0;
                window.animControl.duration = 0;
                window.animControl.updateUI(0, 0);
            }
            markName = null;
            refreshMarks();
            refreshQueue();
        },
        tick: function () {
            var entry = currentEntry();
            var anim = entry && entry.animation;
            var name = anim && anim.name ? anim.name : "";
            if (name !== markName) {
                markName = name;
                refreshMarks();
                refreshQueue();
            }
            pingpongTick(entry);
        },
        refresh: function () {
            fillQueueSelect();
            refreshQueue();
            refreshStage();
            refreshMarks();
        },
        onComplete: onComplete
    };

    window.animDirector = api;

    window.stageCompare = {
        clear: function () {
            extras = [];
            this._cam = null;
            this._savedCam = null;
            refreshStage();
        },
        beforeDraw: function (cam) {
            this._cam = null;
            this._savedCam = null;
            var primary = skeleton();
            if (!primary || !extras.length) return;
            if (window.viewerConfig && window.viewerConfig.isExporting) return;
            this._spacing = rowSpacing();
            if (!cam || !(cam.zoom > 0)) return;
            var canvasW = cam.canvasW || window.innerWidth;
            var view = stageView(canvasW);
            var primaryW = boundsWidth(primary);
            var last = extras[extras.length - 1].skeleton;
            var lastW = boundsWidth(last);
            var span = extras.length * this._spacing + primaryW / 2 + lastW / 2;
            var fit = span > 1 ? (view.width * 0.92) / span : cam.zoom;
            var zoom = cam.zoom;
            if (fit > 0.05 && fit < zoom) zoom = fit;
            var mid = boundsCenterX(primary) + (extras.length * this._spacing) / 2;
            var pixelBias = view.centerX - canvasW / 2;
            this._savedCam = { x: cam.x, zoom: cam.zoom };
            this._cam = cam;
            cam.zoom = zoom;
            cam.x = mid - pixelBias / zoom;
        },
        afterDraw: function () {
            if (this._cam && this._savedCam) {
                this._cam.x = this._savedCam.x;
                this._cam.zoom = this._savedCam.zoom;
            }
            this._cam = null;
            this._savedCam = null;
        },
        addClone: function () {
            var sk = skeleton();
            if (!sk || !sk.data || !window.spine) {
                alert(t("anim.needModel"));
                return;
            }
            var made = makeSkeleton(sk.data);
            var chosen = document.getElementById("anim-select");
            if (chosen && chosen.value && made.state) {
                try {
                    var entry = made.state.setAnimation(0, chosen.value, true);
                    made.anim = chosen.value;
                    if (entry) entry.loop = true;
                } catch (e) {}
            }
            made.label = t("stage.copy", { n: extras.length + 1 });
            pushExtra(made);
        },
        addFromList: async function (index) {
            var groups = window.spineFileGroups || [];
            var group = groups[index];
            if (!group) return;
            if (!skeleton()) {
                if (window.switchSpineFile) window.switchSpineFile(index);
                return;
            }
            if (index === window.spineActiveIndex) {
                this.addClone();
                return;
            }
            try {
                var made = await loadExtraFiles(group.files, group.displayName || group.name);
                made.label = group.displayName || group.name || made.label;
                pushExtra(made);
            } catch (e) {
                var msg = e && e.message ? e.message : String(e);
                if (window.log) window.log(t("stage.fail", { msg: msg }), "stage.fail", { msg: msg });
            }
        },
        draw: function (drawOne, dt) {
            if (!extras.length || typeof drawOne !== "function") return;
            if (window.viewerConfig && window.viewerConfig.isExporting) return;
            var primary = skeleton();
            var ctrl = window.animControl;
            var step = ctrl && ctrl.isPlaying && !ctrl.isScrubbing ? (dt || 0) : 0;
            var spacing = this._spacing || rowSpacing();
            var base = primary ? (primary.x || 0) : 0;
            var y = primary ? (primary.y || 0) : 0;
            for (var i = 0; i < extras.length; i++) {
                var extra = extras[i];
                var sk = extra.skeleton;
                if (!sk) continue;
                try {
                    if (extra.state) {
                        extra.state.update(step);
                        extra.state.apply(sk);
                    }
                    sk.y = y;
                    sk.x = base + (i + 1) * spacing;
                    updateWorld(sk);
                    drawOne(sk);
                } catch (e) {}
            }
        }
    };

    function bind() {
        var modeEl = document.getElementById("play-mode");
        if (modeEl) modeEl.addEventListener("change", function () { api.setMode(modeEl.value); });
        var queueBtn = document.getElementById("btn-queue");
        if (queueBtn) queueBtn.addEventListener("click", function () { api.enqueue(); });
        var clearBtn = document.getElementById("btn-queue-clear");
        if (clearBtn) clearBtn.addEventListener("click", function () { api.clearQueue(); });
        var setupBtn = document.getElementById("btn-setup-pose");
        if (setupBtn) setupBtn.addEventListener("click", function () { api.setupPose(); });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
    else bind();
})();
