// 图集缺区域时，官方 AtlasAttachmentLoader 会抛错，整份骨架都加载失败。
// 3.6–4.2 的 SkeletonJson / SkeletonBinary 已经把 newRegionAttachment、
// newMeshAttachment 返回 null 当成“跳过这个附件”。这里只拦这一处：
// 缺的区域记下来并返回 null，读完后再给出非阻断提示。

var missingRegionDismissed = false;

function rememberMissingAtlasRegion(path) {
    var name = path == null ? "" : String(path).trim();
    if (!name) return;
    var list = window.__missingAtlasRegions;
    if (!list) {
        list = [];
        window.__missingAtlasRegions = list;
    }
    if (list.indexOf(name) === -1) list.push(name);
}

function hasAtlasRegion(atlas, path) {
    if (!atlas || typeof atlas.findRegion !== "function") return false;
    return !!atlas.findRegion(path);
}

function collectMissingRegionPaths(atlas, path, sequence) {
    var missing = [];
    if (sequence && sequence.regions && typeof sequence.getPath === "function") {
        for (var i = 0; i < sequence.regions.length; i++) {
            var seqPath = sequence.getPath(path, i);
            if (!hasAtlasRegion(atlas, seqPath)) missing.push(seqPath || path || "");
        }
        return missing;
    }
    if (!hasAtlasRegion(atlas, path)) missing.push(path || "");
    return missing;
}

function noteMissingRegionPaths(missing, fallback) {
    var noted = false;
    for (var i = 0; i < missing.length; i++) {
        var label = missing[i] || fallback;
        if (!label) continue;
        rememberMissingAtlasRegion(label);
        noted = true;
    }
    if (!noted && fallback) rememberMissingAtlasRegion(fallback);
}

function isMissingRegionError(err) {
    var msg = err && err.message ? String(err.message) : String(err || "");
    return msg.indexOf("Region not found in atlas:") !== -1;
}

function regionNameFromError(err, fallback) {
    var msg = err && err.message ? String(err.message) : "";
    var match = msg.match(/Region not found in atlas:\s*([^()]+?)\s*(?:\(|$)/);
    if (match && match[1] && match[1].trim()) return match[1].trim();
    return fallback || "";
}

function skipMissingRegionAttachment(loader, path, sequence, fallback) {
    var missing = collectMissingRegionPaths(loader.atlas, path, sequence);
    if (!missing.length) return false;
    noteMissingRegionPaths(missing, fallback || path);
    return true;
}

function guardAttachmentMethod(proto, methodName) {
    var orig = proto[methodName];
    if (typeof orig !== "function") return;
    proto[methodName] = function (skin, name, path, sequence) {
        if (skipMissingRegionAttachment(this, path, sequence, path || name)) return null;
        try {
            return orig.apply(this, arguments);
        } catch (err) {
            if (!isMissingRegionError(err)) throw err;
            rememberMissingAtlasRegion(regionNameFromError(err, path || name));
            return null;
        }
    };
}

function wrapSkeletonRead(Ctor) {
    var proto = Ctor && Ctor.prototype;
    if (!proto || proto.__missingRegionWrapped || typeof proto.readSkeletonData !== "function") return;
    var orig = proto.readSkeletonData;
    proto.readSkeletonData = function () {
        if (window.resetMissingAtlasRegions) window.resetMissingAtlasRegions();
        var data = orig.apply(this, arguments);
        if (window.reportMissingAtlasRegions) window.reportMissingAtlasRegions();
        return data;
    };
    proto.__missingRegionWrapped = true;
}

function ensureRegionWarning() {
    if (typeof document === "undefined" || !document || !document.body || !document.createElement || !document.getElementById) return null;
    var el = document.getElementById("region-warning");
    if (el) return el;
    el = document.createElement("div");
    el.id = "region-warning";
    el.className = "region-warning";
    el.hidden = true;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    var text = document.createElement("p");
    text.className = "region-warning-text";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "region-warning-close";
    btn.setAttribute("data-i18n", "status.missingRegionsClose");
    btn.textContent = window.t ? window.t("status.missingRegionsClose") : "关闭";
    btn.addEventListener("click", function () {
        missingRegionDismissed = true;
        el.hidden = true;
    });
    el.appendChild(text);
    el.appendChild(btn);
    document.body.appendChild(el);
    return el;
}

window.installMissingRegionGuard = function (spineNs) {
    var Loader = spineNs && spineNs.AtlasAttachmentLoader;
    if (!Loader || !Loader.prototype) return;
    if (!Loader.prototype.__missingRegionGuard) {
        guardAttachmentMethod(Loader.prototype, "newRegionAttachment");
        guardAttachmentMethod(Loader.prototype, "newMeshAttachment");
        Loader.prototype.__missingRegionGuard = true;
    }
    wrapSkeletonRead(spineNs.SkeletonBinary);
    wrapSkeletonRead(spineNs.SkeletonJson);
};

window.resetMissingAtlasRegions = function () {
    window.__missingAtlasRegions = [];
    window.__reportedMissingAtlasRegions = [];
    missingRegionDismissed = false;
    var el = typeof document !== "undefined" && document && document.getElementById && document.getElementById("region-warning");
    if (el) el.hidden = true;
};

window.paintMissingAtlasRegions = function () {
    var names = window.__reportedMissingAtlasRegions || [];
    var el = ensureRegionWarning();
    if (!el) return;
    if (!names.length || missingRegionDismissed) {
        el.hidden = true;
        return;
    }
    el.hidden = false;
    if (el.dataset) el.dataset.regions = names.join("\n");
    var regions = names.join(", ");
    var text = el.querySelector ? el.querySelector(".region-warning-text") : null;
    if (text) text.textContent = window.t ? window.t("status.missingRegions", { regions: regions }) : regions;
    var btn = el.querySelector ? el.querySelector(".region-warning-close") : null;
    if (btn && window.t) btn.textContent = window.t("status.missingRegionsClose");
};

window.reportMissingAtlasRegions = function () {
    var names = (window.__missingAtlasRegions || []).slice();
    window.__reportedMissingAtlasRegions = names;
    missingRegionDismissed = false;
    window.paintMissingAtlasRegions();
    if (names.length) console.warn(window.t ? window.t("status.missingRegions", { regions: names.join(", ") }) : names.join(", "));
    return names;
};
