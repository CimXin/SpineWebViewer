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
    btn.onclick = function () {
        if (!window.viewerConfig) return;
        window.viewerConfig.highlightBone = window.viewerConfig.highlightBone === name ? null : name;
        window.refreshBoneTree();
    };
    li.appendChild(btn);
    const kids = childrenOf(bone, skeleton);
    if (kids.length) {
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
        root.textContent = "未加载骨架";
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
};
