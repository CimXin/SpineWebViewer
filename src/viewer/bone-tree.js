function boneName(bone) {
    if (!bone) return "";
    if (bone.data && bone.data.name) return bone.data.name;
    return bone.name || "";
}

function childrenOf(bone, skeleton) {
    if (bone.children && bone.children.length) return bone.children;
    if (!skeleton || !skeleton.bones) return [];
    return skeleton.bones.filter((child) => child.parent === bone);
}

function boneByName(skeleton, name) {
    const bones = skeleton && skeleton.bones;
    if (!name || !bones) return null;
    for (let i = 0; i < bones.length; i++) {
        if (boneName(bones[i]) === name) return bones[i];
    }
    return null;
}

function syncSkinBar() {
    const bar = document.getElementById("bone-skin-bar");
    if (!bar) return;
    const name = window.viewerConfig && window.viewerConfig.highlightBone;
    const bone = boneByName(window.skeleton, name);
    const tools = window.debugTools;
    if (!name || !bone || !tools) {
        bar.hidden = true;
        return;
    }
    bar.hidden = false;
    const label = document.getElementById("bone-skin-label");
    const note = document.getElementById("bone-skin-note");
    const btn = document.getElementById("bone-skin-toggle");
    const direct = !!tools.isBoneSkinHidden(name);
    if (label) label.textContent = window.t ? window.t("hier.skinOf", { name: name }) : name;
    if (btn) {
        const key = direct ? "hier.showSkin" : "hier.hideSkin";
        btn.textContent = window.t ? window.t(key) : (direct ? "显示皮肤" : "隐藏皮肤");
        btn.title = window.t ? window.t("hier.skinTip") : "";
        btn.setAttribute("aria-pressed", direct ? "true" : "false");
    }
    if (note) {
        const ancestor = !!(tools.ancestorHidesSkin && tools.ancestorHidesSkin(bone));
        note.hidden = !ancestor;
        note.textContent = ancestor && window.t ? window.t("hier.skinAncestor") : "";
    }
}

function bindSkinBar() {
    const btn = document.getElementById("bone-skin-toggle");
    if (!btn || btn.getAttribute("data-bound")) return;
    btn.setAttribute("data-bound", "1");
    btn.addEventListener("click", function () {
        const name = window.viewerConfig && window.viewerConfig.highlightBone;
        if (!name || !window.debugTools || !window.debugTools.setBoneSkinHidden) return;
        const hidden = window.debugTools.isBoneSkinHidden(name);
        window.debugTools.setBoneSkinHidden(name, !hidden);
    });
}

function appendBone(ul, bone, skeleton, used, highlight) {
    if (!bone || used.has(bone)) return;
    used.add(bone);
    const name = boneName(bone);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bone-tree-node";
    btn.textContent = name || "(unnamed)";
    if (highlight && name && highlight === name) btn.classList.add("active");
    if (name && window.debugTools && window.debugTools.boneHidesSkin && window.debugTools.boneHidesSkin(bone)) {
        btn.classList.add("skin-hidden");
        const mark = document.createElement("span");
        mark.className = "bone-skin-mark";
        mark.textContent = window.t ? window.t("hier.skinMark") : "藏";
        mark.title = window.t ? window.t("hier.skinMarkTip") : "";
        btn.appendChild(mark);
    }
    btn.onclick = function () {
        if (!window.viewerConfig) return;
        window.viewerConfig.highlightBone = window.viewerConfig.highlightBone === name ? null : name;
        window.refreshBoneTree();
    };
    li.appendChild(btn);
    const kids = childrenOf(bone, skeleton);
    if (kids.length) {
        li.classList.add("has-children");
        const childUl = document.createElement("ul");
        kids.forEach((child) => appendBone(childUl, child, skeleton, used, highlight));
        li.appendChild(childUl);
    }
    ul.appendChild(li);
}

window.refreshBoneTree = function () {
    const root = document.getElementById("bone-tree");
    if (!root) return;
    const skeleton = window.skeleton;
    const bones = skeleton && skeleton.bones ? skeleton.bones : null;
    root.replaceChildren();
    if (!bones || !bones.length) {
        root.textContent = window.t ? window.t("hier.empty") : "未加载骨架";
        syncSkinBar();
        return;
    }
    const names = new Set();
    bones.forEach((bone) => {
        const name = boneName(bone);
        if (name) names.add(name);
    });
    let highlight = window.viewerConfig && window.viewerConfig.highlightBone;
    if (highlight && !names.has(highlight)) {
        window.viewerConfig.highlightBone = null;
        highlight = null;
    }
    const used = new Set();
    const ul = document.createElement("ul");
    const roots = bones.filter((bone) => !bone.parent);
    (roots.length ? roots : [bones[0]]).forEach((bone) => appendBone(ul, bone, skeleton, used, highlight));
    bones.forEach((bone) => {
        if (!used.has(bone)) appendBone(ul, bone, skeleton, used, highlight);
    });
    root.appendChild(ul);
    syncSkinBar();
};

function bootBoneTree() {
    bindSkinBar();
    if (window.refreshBoneTree) window.refreshBoneTree();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootBoneTree);
else bootBoneTree();
