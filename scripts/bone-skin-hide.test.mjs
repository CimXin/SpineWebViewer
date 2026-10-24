// node scripts/bone-skin-hide.test.mjs
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
}

function createElement(tag) {
    const el = {
        tagName: String(tag || "div").toUpperCase(),
        children: [],
        parent: null,
        attrs: {},
        style: {},
        hidden: false,
        listeners: {},
        nodeType: 1,
        id: "",
        title: "",
        type: "",
        value: "",
        checked: false,
    };
    const classes = new Set();
    el.classList = {
        add() {
            for (let i = 0; i < arguments.length; i++) if (arguments[i]) classes.add(arguments[i]);
        },
        remove() {
            for (let i = 0; i < arguments.length; i++) classes.delete(arguments[i]);
        },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
            const on = force === undefined ? !classes.has(name) : !!force;
            if (on) classes.add(name);
            else classes.delete(name);
            return on;
        },
    };
    Object.defineProperty(el, "className", {
        get() { return Array.from(classes).join(" "); },
        set(value) {
            classes.clear();
            String(value || "").split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
        },
    });
    Object.defineProperty(el, "textContent", {
        get() {
            return el.children.map((child) => (child.nodeType === 3 ? child.data : child.textContent)).join("");
        },
        set(value) {
            el.children.forEach((child) => { child.parent = null; });
            el.children = [];
            const text = { nodeType: 3, data: value == null ? "" : String(value), parent: el, children: [] };
            Object.defineProperty(text, "textContent", { get() { return text.data; } });
            el.children.push(text);
        },
    });
    el.appendChild = (child) => {
        if (!child) return child;
        if (child.parent && child.parent.children) {
            child.parent.children = child.parent.children.filter((item) => item !== child);
        }
        child.parent = el;
        el.children.push(child);
        return child;
    };
    el.replaceChildren = (...nodes) => {
        el.children.forEach((child) => { child.parent = null; });
        el.children = [];
        nodes.forEach((node) => { if (node) el.appendChild(node); });
    };
    el.setAttribute = (key, value) => { el.attrs[key] = String(value); };
    el.getAttribute = (key) => (Object.prototype.hasOwnProperty.call(el.attrs, key) ? el.attrs[key] : null);
    el.addEventListener = (type, fn) => {
        if (!el.listeners[type]) el.listeners[type] = [];
        el.listeners[type].push(fn);
    };
    el.closest = (sel) => {
        let node = el;
        while (node) {
            if (sel === "[data-slot]" && node.attrs && Object.prototype.hasOwnProperty.call(node.attrs, "data-slot")) return node;
            node = node.parent;
        }
        return null;
    };
    return el;
}

function loadViewer() {
    const ids = {};
    const document = {
        readyState: "complete",
        documentElement: createElement("html"),
        body: createElement("body"),
        createElement,
        getElementById(id) { return ids[id] || null; },
        addEventListener() {},
        querySelectorAll() { return []; },
    };
    function register(id, tag) {
        const el = createElement(tag || "div");
        el.id = id;
        ids[id] = el;
        return el;
    }
    register("debug-slot-list");
    register("bone-tree");
    register("bone-skin-bar");
    register("bone-skin-label", "span");
    register("bone-skin-note", "p");
    register("bone-skin-toggle", "button");

    const strings = {
        "hier.hideSkin": "隐藏皮肤",
        "hier.showSkin": "显示皮肤",
        "hier.skinOf": "选中 {name}",
        "hier.skinTip": "隐藏这个骨骼和它下面子骨骼上的插槽",
        "hier.skinAncestor": "上级骨骼已经藏了皮肤",
        "hier.skinMark": "藏",
        "hier.skinMarkTip": "这个骨骼上的皮肤已隐藏",
        "hier.empty": "未加载骨架",
    };
    const sandbox = {
        console,
        document,
        setTimeout,
        clearTimeout,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.viewerConfig = { highlightBone: null, debugPoints: false, showStats: false };
    sandbox.t = (key, vars) => {
        const str = strings[key] || key;
        if (!vars) return str;
        return str.replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? "" : String(vars[name])));
    };
    vm.createContext(sandbox);
    for (const file of ["src/viewer/debug-tools.js", "src/viewer/bone-tree.js"]) {
        vm.runInContext(fs.readFileSync(root + file, "utf8"), sandbox, { filename: file });
    }
    return { sandbox, document };
}

function bone(name, parent) {
    const node = { data: { name }, name, parent: parent || null, children: [] };
    if (parent) parent.children.push(node);
    return node;
}

function makeSkeleton() {
    const rootBone = bone("root");
    const torso = bone("torso", rootBone);
    const arm = bone("arm", torso);
    const hand = bone("hand", arm);
    const leg = bone("leg", rootBone);
    const slots = {};
    function add(name, owner) {
        const setup = { r: 1, g: 1, b: 1, a: 1 };
        const slot = {
            data: { name, color: setup },
            bone: owner,
            color: { r: 1, g: 1, b: 1, a: 1 },
            setToSetupPose() {
                this.color.r = setup.r;
                this.color.g = setup.g;
                this.color.b = setup.b;
                this.color.a = setup.a;
            },
        };
        slots[name] = slot;
        return slot;
    }
    return {
        skeleton: {
            bones: [rootBone, torso, arm, hand, leg],
            slots: [add("root-slot", rootBone), add("torso-slot", torso), add("arm-slot", arm), add("hand-slot", hand), add("leg-slot", leg)],
        },
        slots,
        bones: { root: rootBone, torso, arm, hand, leg },
    };
}

function walk(el, visit) {
    if (!el || el.nodeType === 3) return;
    visit(el);
    const children = el.children || [];
    for (let i = 0; i < children.length; i++) walk(children[i], visit);
}

function boneButtons(document) {
    const found = [];
    walk(document.getElementById("bone-tree"), (el) => {
        if (el.classList && el.classList.contains("bone-tree-node")) found.push(el);
    });
    return found;
}

function buttonLabel(btn) {
    const text = (btn.children || []).find((child) => child.nodeType === 3);
    return text ? text.data : btn.textContent;
}

function buttonNamed(document, name) {
    const found = boneButtons(document).find((btn) => buttonLabel(btn) === name);
    assert(found, "missing bone button " + name);
    return found;
}

function slotRow(document, name) {
    const list = document.getElementById("debug-slot-list");
    const row = (list.children || []).find((child) => child.attrs && child.attrs["data-slot"] === name);
    assert(row, "missing slot row " + name);
    return row;
}

function slotCheckbox(document, name) {
    const row = slotRow(document, name);
    const box = (row.children || []).find((child) => child.classList && child.classList.contains("debug-vis"));
    assert(box, "missing visibility checkbox " + name);
    return box;
}

function emitChange(document, input) {
    const list = document.getElementById("debug-slot-list");
    const handlers = list.listeners.change || [];
    assert(handlers.length > 0, "slot list has no change listener");
    handlers.forEach((fn) => fn({ target: input }));
}

function click(el) {
    const handlers = (el.listeners && el.listeners.click) || [];
    handlers.forEach((fn) => fn({ target: el }));
}

function alpha(slot) {
    return slot.color.a;
}

const { sandbox, document } = loadViewer();
const made = makeSkeleton();
const copy = makeSkeleton();
sandbox.skeleton = made.skeleton;
sandbox.viewerConfig.highlightBone = "arm";
sandbox.debugTools.refresh();

assert(document.getElementById("bone-skin-bar").hidden === false, "selected bone shows the skin bar");
assert(document.getElementById("bone-skin-label").textContent === "选中 arm", "bar names the selected bone");
assert(document.getElementById("bone-skin-toggle").textContent === "隐藏皮肤", "hide action is offered");
assert(document.getElementById("bone-skin-note").hidden === true, "no ancestor note yet");
assert(buttonNamed(document, "arm").classList.contains("active"), "selected bone stays highlighted");

sandbox.debugTools.setBoneSkinHidden("arm", true);
assert(alpha(made.slots["arm-slot"]) === 0, "arm slot hidden");
assert(alpha(made.slots["hand-slot"]) === 0, "descendant hand slot hidden");
assert(alpha(made.slots["torso-slot"]) === 1, "parent torso slot stays visible");
assert(alpha(made.slots["leg-slot"]) === 1, "sibling leg slot stays visible");
assert(alpha(made.slots["root-slot"]) === 1, "root slot stays visible");
assert(slotCheckbox(document, "arm-slot").checked === false, "debug list reflects the arm hide");
assert(slotCheckbox(document, "hand-slot").checked === false, "debug list reflects the hand hide");
assert(slotCheckbox(document, "leg-slot").checked === true, "unrelated slot stays checked");
assert(buttonNamed(document, "arm").classList.contains("skin-hidden"), "arm row marks hidden skin");
assert(buttonNamed(document, "hand").classList.contains("skin-hidden"), "descendant row marks hidden skin");
assert(!buttonNamed(document, "torso").classList.contains("skin-hidden"), "parent row is not marked");
assert(document.getElementById("bone-skin-toggle").textContent === "显示皮肤", "toggle switches to show");
assert(document.getElementById("bone-skin-toggle").getAttribute("aria-pressed") === "true", "toggle pressed state");

made.slots["arm-slot"].color.a = 1;
made.slots["hand-slot"].color.a = 1;
sandbox.debugTools.afterApply(made.skeleton);
assert(alpha(made.slots["arm-slot"]) === 0 && alpha(made.slots["hand-slot"]) === 0, "afterApply puts the hide back");

copy.slots["arm-slot"].color.a = 1;
copy.slots["hand-slot"].color.a = 1;
sandbox.debugTools.afterApply(copy.skeleton);
assert(alpha(copy.slots["arm-slot"]) === 1 && alpha(copy.slots["hand-slot"]) === 1, "side-by-side skeleton is not hidden");
assert(alpha(made.slots["arm-slot"]) === 0, "focused skeleton stays hidden");

sandbox.debugTools.refresh();
assert(sandbox.debugTools.isBoneSkinHidden("arm"), "refresh keeps the hide on the same skeleton");
assert(alpha(made.slots["arm-slot"]) === 0, "refresh does not show the slot again");

sandbox.debugTools.setBoneSkinHidden("arm", false);
assert(alpha(made.slots["arm-slot"]) === 1 && alpha(made.slots["hand-slot"]) === 1, "showing the bone restores descendants");
assert(!buttonNamed(document, "arm").classList.contains("skin-hidden"), "mark clears when skin is shown");

sandbox.debugTools.setBoneSkinHidden("torso", true);
assert(alpha(made.slots["torso-slot"]) === 0, "torso slot hidden");
assert(alpha(made.slots["arm-slot"]) === 0 && alpha(made.slots["hand-slot"]) === 0, "torso hide covers descendants");
assert(alpha(made.slots["leg-slot"]) === 1 && alpha(made.slots["root-slot"]) === 1, "torso hide stops at that subtree");
assert(document.getElementById("bone-skin-note").hidden === false, "arm selection explains the ancestor hide");
assert(document.getElementById("bone-skin-note").textContent.indexOf("上级骨骼") >= 0, "ancestor note is shown");
assert(document.getElementById("bone-skin-toggle").textContent === "隐藏皮肤", "arm itself is not the hidden root yet");

const handBox = slotCheckbox(document, "hand-slot");
handBox.checked = true;
emitChange(document, handBox);
assert(alpha(made.slots["hand-slot"]) === 1, "explicit debug show restores that slot");
sandbox.debugTools.afterApply(made.skeleton);
assert(alpha(made.slots["hand-slot"]) === 1, "explicit show wins over the bone hide");
assert(alpha(made.slots["arm-slot"]) === 0, "other slots under the bone stay hidden");

sandbox.debugTools.setBoneSkinHidden("torso", false);
sandbox.debugTools.setBoneSkinHidden("torso", true);
const handAgain = slotCheckbox(document, "hand-slot");
assert(handAgain.checked === true, "explicit show is kept when the bone is hidden again");
assert(alpha(made.slots["hand-slot"]) === 1, "explicit show still wins");
assert(slotCheckbox(document, "arm-slot").checked === false, "arm follows the bone again");

const legBox = slotCheckbox(document, "leg-slot");
legBox.checked = false;
emitChange(document, legBox);
sandbox.debugTools.afterApply(made.skeleton);
assert(alpha(made.slots["leg-slot"]) === 0, "debug checkbox still hides a single slot");
sandbox.debugTools.setBoneSkinHidden("torso", false);
sandbox.debugTools.afterApply(made.skeleton);
assert(alpha(made.slots["leg-slot"]) === 0, "explicit slot hide survives showing a bone");
assert(alpha(made.slots["arm-slot"]) === 1, "bone show restores slots without an explicit override");

const tint = (slotRow(document, "arm-slot").children || []).find((child) => child.classList && child.classList.contains("debug-tint"));
assert(tint, "tint control still exists");
tint.value = "#ff0000";
emitChange(document, tint);
sandbox.debugTools.setBoneSkinHidden("arm", true);
assert(alpha(made.slots["arm-slot"]) === 0, "tinted slot can still be hidden with the bone");
assert(made.slots["arm-slot"].color.r === 1 && made.slots["arm-slot"].color.g === 0, "tint stays applied while hidden");
sandbox.debugTools.setBoneSkinHidden("arm", false);
assert(alpha(made.slots["arm-slot"]) === 1, "showing the bone reveals the tinted slot");
assert(made.slots["arm-slot"].color.r === 1 && made.slots["arm-slot"].color.g === 0, "tint survives the bone show");

sandbox.debugTools.resetSlots();
sandbox.debugTools.setBoneSkinHidden("hand", true);
sandbox.debugTools.setBoneSkinHidden("arm", true);
sandbox.debugTools.setBoneSkinHidden("arm", false);
assert(sandbox.debugTools.isBoneSkinHidden("hand"), "child hide is its own flag");
assert(alpha(made.slots["hand-slot"]) === 0, "child subtree stays hidden after the parent is shown");
assert(alpha(made.slots["arm-slot"]) === 1, "parent slot comes back when only the child stays hidden");

sandbox.viewerConfig.highlightBone = "hand";
sandbox.refreshBoneTree();
assert(document.getElementById("bone-skin-toggle").textContent === "显示皮肤", "selected child offers show");
click(document.getElementById("bone-skin-toggle"));
assert(!sandbox.debugTools.isBoneSkinHidden("hand"), "bar toggles the selected bone");
assert(alpha(made.slots["hand-slot"]) === 1, "bar show restores that subtree");

buttonNamed(document, "hand").onclick();
assert(sandbox.viewerConfig.highlightBone === null, "clicking the selected bone still clears the highlight");
assert(document.getElementById("bone-skin-bar").hidden === true, "skin bar hides without a selection");

sandbox.viewerConfig.highlightBone = "torso";
sandbox.debugTools.setBoneSkinHidden("torso", true);
sandbox.debugTools.resetSlots();
assert(!sandbox.debugTools.isBoneSkinHidden("torso"), "reset clears hierarchy hides");
assert(alpha(made.slots["torso-slot"]) === 1 && alpha(made.slots["arm-slot"]) === 1, "reset restores hidden slots");
assert(alpha(made.slots["leg-slot"]) === 1, "reset also clears an explicit slot hide");
sandbox.debugTools.afterApply(made.skeleton);
assert(alpha(made.slots["hand-slot"]) === 1, "reset drops the explicit show as well");
sandbox.debugTools.setBoneSkinHidden("torso", true);
assert(alpha(made.slots["hand-slot"]) === 0, "after reset the hand follows the bone again");

const next = makeSkeleton();
sandbox.skeleton = next.skeleton;
sandbox.debugTools.refresh();
assert(!sandbox.debugTools.isBoneSkinHidden("torso"), "a new skeleton does not inherit the hide");
sandbox.debugTools.afterApply(next.skeleton);
assert(alpha(next.slots["torso-slot"]) === 1 && alpha(next.slots["arm-slot"]) === 1, "new skeleton slots stay visible");

const i18n = fs.readFileSync(root + "src/i18n/i18n.js", "utf8");
for (const key of ["hier.hideSkin", "hier.showSkin", "hier.skinOf", "hier.skinTip", "hier.skinAncestor", "hier.skinMark", "hier.skinMarkTip"]) {
    const count = i18n.split('"' + key + '"').length - 1;
    assert(count >= 2, key + " should exist in Chinese and English");
}
assert(i18n.includes("层级里藏起的皮肤也从这里恢复"), "Chinese slot hint mentions hierarchy skin");
assert(i18n.includes("Skin hidden from the hierarchy is cleared here too."), "English slot hint mentions hierarchy skin");

const html = fs.readFileSync(root + "index.html", "utf8");
assert(html.includes('id="bone-skin-toggle"'), "hierarchy exposes the skin toggle");
assert(html.includes('id="bone-skin-bar"'), "skin bar is in the hierarchy panel");

console.log("bone-skin-hide.test.mjs ok");
