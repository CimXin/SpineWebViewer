// node scripts/missing-regions.test.mjs
// A skeleton may name atlas regions that were never packed. The viewer should
// skip those attachments and warn, instead of aborting the load.
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const reproDir = root + "scripts/fixtures/region-miss/";
const multiDir = root + "scripts/fixtures/multi-atlas/";
const reproAtlas = fs.readFileSync(reproDir + "skeleton.atlas", "utf8");
const reproSkel = new Uint8Array(fs.readFileSync(reproDir + "skeleton.skel"));
const multiAtlas = fs.readFileSync(multiDir + "skeleton.atlas", "utf8");
const multiSkel = new Uint8Array(fs.readFileSync(multiDir + "skeleton.skel"));

function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
}

function loadScript(filename, sandbox) {
    vm.runInContext(fs.readFileSync(root + filename, "utf8"), sandbox, { filename });
    return sandbox;
}

function freshSandbox() {
    const nodes = {};
    function createElement(tag) {
        const el = {
            tagName: String(tag || "div").toUpperCase(),
            children: [],
            parent: null,
            attrs: {},
            style: {},
            hidden: false,
            textContent: "",
            className: "",
            type: "",
            dataset: {},
            listeners: {},
            setAttribute(name, value) { this.attrs[name] = String(value); },
            getAttribute(name) { return this.attrs[name]; },
            appendChild(child) {
                this.children.push(child);
                child.parent = this;
                return child;
            },
            addEventListener(type, fn) { this.listeners[type] = fn; },
            querySelector(sel) { return query(this, sel); },
            querySelectorAll(sel) { return queryAll(this, sel); },
        };
        Object.defineProperty(el, "id", {
            get() { return this._id || ""; },
            set(value) {
                this._id = value || "";
                if (value) nodes[value] = el;
            },
        });
        return el;
    }
    function matches(el, sel) {
        if (!sel) return false;
        if (sel.startsWith(".")) return (el.className || "").split(/\s+/).includes(sel.slice(1));
        if (sel.startsWith("#")) return el.id === sel.slice(1);
        if (sel.startsWith("[")) {
            const attr = sel.slice(1, -1);
            return Object.prototype.hasOwnProperty.call(el.attrs, attr);
        }
        return el.tagName === sel.toUpperCase();
    }
    function query(el, sel) {
        if (matches(el, sel)) return el;
        for (const child of el.children) {
            const hit = query(child, sel);
            if (hit) return hit;
        }
        return null;
    }
    function queryAll(el, sel) {
        const out = [];
        const walk = (node) => {
            if (matches(node, sel)) out.push(node);
            for (const child of node.children) walk(child);
        };
        walk(el);
        out.forEach = Array.prototype.forEach;
        return out;
    }
    const body = createElement("body");
    const sandbox = {
        console,
        window: null,
        self: null,
        localStorage: {
            store: {},
            getItem(key) { return this.store[key] || null; },
            setItem(key, value) { this.store[key] = String(value); },
        },
        document: {
            readyState: "complete",
            title: "",
            documentElement: { lang: "zh-CN" },
            body,
            addEventListener() {},
            createElement,
            getElementById(id) { return nodes[id] || null; },
            querySelector(sel) { return query(body, sel); },
            querySelectorAll(sel) { return queryAll(body, sel); },
        },
        alerts: [],
    };
    sandbox.alert = (msg) => { sandbox.alerts.push(String(msg)); };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    return sandbox;
}

function Fake(w, h) {
    this.w = w;
    this.h = h;
}
Fake.prototype.getImage = function () { return { width: this.w, height: this.h }; };
Fake.prototype.setFilters = function () {};
Fake.prototype.setWraps = function () {};
Fake.prototype.dispose = function () {};

function loadRuntime(version, extraScripts) {
    const sandbox = freshSandbox();
    for (const file of extraScripts || []) loadScript(file, sandbox);
    loadScript(`public/vendor/spine/${version}/spine-webgl.js`, sandbox);
    assert(sandbox.spine && sandbox.spine.AtlasAttachmentLoader, `${version} runtime did not load`);
    return sandbox;
}

function atlasText(names) {
    const lines = [
        "page.png",
        "size: 64, 64",
        "format: RGBA8888",
        "filter: Linear,Linear",
        "repeat: none",
    ];
    for (const name of names) {
        lines.push(
            name,
            "  rotate: false",
            "  xy: 0, 0",
            "  size: 8, 8",
            "  orig: 8, 8",
            "  offset: 0, 0",
            "  index: -1",
        );
    }
    lines.push("");
    return lines.join("\n");
}

function makeAtlas(spine, text, w, h) {
    const texture = new Fake(w, h);
    return new spine.TextureAtlas(text, () => texture);
}

function skeletonJson(version, skins) {
    const legacy = version === "3.6" || version === "3.7";
    return {
        skeleton: { spine: version + ".0", width: 32, height: 32 },
        bones: [{ name: "root" }],
        slots: [{ name: "slot", bone: "root", attachment: "gone" }],
        skins: legacy ? { default: skins } : [{ name: "default", attachments: skins }],
        animations: {
            idle: {
                slots: {
                    slot: {
                        attachment: [
                            { time: 0, name: "ok" },
                            { time: 0.2, name: "gone" },
                            { time: 0.4, name: "ok" },
                        ],
                    },
                },
            },
        },
    };
}

const regionSkins = {
    slot: {
        ok: { type: "region", path: "have", width: 8, height: 8, x: 1, y: 2 },
        gone: { type: "region", path: "missing", width: 8, height: 8 },
        hole: { type: "mesh", path: "missing-mesh" },
    },
};

function eachAttachment(data, fn) {
    for (const skin of data.skins || []) {
        const slots = skin.attachments || [];
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (!slot) continue;
            for (const name of Object.keys(slot)) fn(slot[name], name, skin);
        }
    }
}

function pose(spine, skeleton) {
    skeleton.setToSetupPose();
    if (spine.Physics) skeleton.updateWorldTransform(spine.Physics.update);
    else skeleton.updateWorldTransform();
}

function play(spine, data, skeleton) {
    const stateData = new spine.AnimationStateData(data);
    const state = new spine.AnimationState(stateData);
    const anims = data.animations || [];
    if (!anims.length) {
        pose(spine, skeleton);
        return;
    }
    for (const anim of anims) {
        state.setAnimation(0, anim.name, false);
        const duration = Math.min(anim.duration || 0.2, 1.5);
        const steps = Math.max(1, Math.ceil(duration / 0.05));
        for (let i = 0; i < steps; i++) {
            state.update(0.05);
            state.apply(skeleton);
            if (spine.Physics) skeleton.updateWorldTransform(spine.Physics.update);
            else skeleton.updateWorldTransform();
        }
    }
}

function readJson(sandbox, atlas, json) {
    const loader = new sandbox.spine.AtlasAttachmentLoader(atlas);
    const reader = new sandbox.spine.SkeletonJson(loader);
    reader.scale = 1;
    return reader.readSkeletonData(json);
}

const bare = loadRuntime("3.8");
let threw = false;
try {
    const atlas = makeAtlas(bare.spine, reproAtlas, 1127, 189);
    const loader = new bare.spine.AtlasAttachmentLoader(atlas);
    new bare.spine.SkeletonBinary(loader).readSkeletonData(reproSkel);
} catch (err) {
    threw = String(err && err.message ? err.message : err).includes("saoguang_00014");
}
assert(threw, "unpatched 3.8 loader should still reject the repro skeleton");

for (const version of ["3.6", "3.7", "3.8", "4.0", "4.1", "4.2"]) {
    const sandbox = loadRuntime(version, ["src/i18n/i18n.js", "src/loader/missing-regions.js"]);
    sandbox.installMissingRegionGuard(sandbox.spine);
    sandbox.installMissingRegionGuard(sandbox.spine);
    const atlas = makeAtlas(sandbox.spine, atlasText(["have"]), 64, 64);
    const data = readJson(sandbox, atlas, skeletonJson(version, regionSkins));
    const names = sandbox.__reportedMissingAtlasRegions || [];
    assert(names.includes("missing"), `${version} did not record region "missing": ${names.join(", ")}`);
    assert(names.includes("missing-mesh"), `${version} did not record mesh region: ${names.join(", ")}`);
    assert(!names.includes("have"), `${version} warned about a region that exists`);
    const found = [];
    eachAttachment(data, (att, name) => found.push(name + ":" + (att && att.path)));
    assert(found.some((item) => item.startsWith("ok:")), `${version} dropped the valid region: ${found.join(", ")}`);
    assert(!found.some((item) => item.includes("missing")), `${version} kept a missing attachment: ${found.join(", ")}`);
    const skeleton = new sandbox.spine.Skeleton(data);
    const state = new sandbox.spine.AnimationState(new sandbox.spine.AnimationStateData(data));
    state.setAnimation(0, "idle", false);
    state.update(0);
    state.apply(skeleton);
    if (sandbox.spine.Physics) skeleton.updateWorldTransform(sandbox.spine.Physics.update);
    else skeleton.updateWorldTransform();
    const shown = skeleton.slots[0].getAttachment ? skeleton.slots[0].getAttachment() : skeleton.slots[0].attachment;
    assert(shown && shown.path === "have" && shown.region, `${version} did not draw the region that exists`);
    state.update(0.25);
    state.apply(skeleton);
    const skipped = skeleton.slots[0].getAttachment ? skeleton.slots[0].getAttachment() : skeleton.slots[0].attachment;
    assert(!skipped, `${version} still attached ${skipped && (skipped.path || skipped.name)}`);
    pose(sandbox.spine, skeleton);
    const banner = sandbox.document.getElementById("region-warning");
    assert(banner && banner.hidden === false, `${version} warning banner hidden`);
    assert(sandbox.alerts.length === 0, `${version} used a blocking alert: ${sandbox.alerts.join(" | ")}`);
    const text = banner.querySelector(".region-warning-text").textContent;
    assert(text.includes("missing") && text.includes("missing-mesh"), `${version} banner text: ${text}`);

    if (sandbox.spine.Sequence) {
        const partial = makeAtlas(sandbox.spine, atlasText(["saoguang_00000"]), 64, 64);
        const seq = new sandbox.spine.Sequence(2);
        seq.start = 0;
        seq.digits = 5;
        sandbox.resetMissingAtlasRegions();
        const skipped = new sandbox.spine.AtlasAttachmentLoader(partial).newRegionAttachment(null, "seq", "saoguang_", seq);
        assert(skipped == null, `${version} sequence with a missing frame was kept`);
        assert((sandbox.__missingAtlasRegions || []).includes("saoguang_00001"), `${version} sequence warning ${sandbox.__missingAtlasRegions}`);
        const full = makeAtlas(sandbox.spine, atlasText(["saoguang_00000", "saoguang_00001"]), 64, 64);
        const seqOk = new sandbox.spine.Sequence(2);
        seqOk.start = 0;
        seqOk.digits = 5;
        sandbox.resetMissingAtlasRegions();
        const kept = new sandbox.spine.AtlasAttachmentLoader(full).newRegionAttachment(null, "seq", "saoguang_", seqOk);
        assert(kept && seqOk.regions[0] && seqOk.regions[1], `${version} complete sequence was skipped`);
        assert(!(sandbox.__missingAtlasRegions || []).length, `${version} complete sequence warned: ${sandbox.__missingAtlasRegions}`);
    }
}

const guarded = loadRuntime("3.8", ["src/i18n/i18n.js", "src/loader/missing-regions.js"]);
guarded.installMissingRegionGuard(guarded.spine);
const reproData = new guarded.spine.SkeletonBinary(new guarded.spine.AtlasAttachmentLoader(makeAtlas(guarded.spine, reproAtlas, 1127, 189))).readSkeletonData(reproSkel);
const missing = guarded.__reportedMissingAtlasRegions || [];
assert(missing.length === 1 && missing[0] === "saoguang_00014", "repro warning " + missing.join(", "));
const present = [];
eachAttachment(reproData, (att) => {
    if (att && (att.path === "saoguang_00014" || att.name === "saoguang_00014")) {
        throw new Error("repro kept saoguang_00014");
    }
    if (att && att.region) present.push(att.path || att.name);
});
assert(present.includes("saoguang_00000"), "repro dropped saoguang_00000: " + present.join(", "));
const reproSkeleton = new guarded.spine.Skeleton(reproData);
play(guarded.spine, reproData, reproSkeleton);
let reproDrawn = 0;
pose(guarded.spine, reproSkeleton);
for (const slot of reproSkeleton.slots) {
    const att = slot.getAttachment ? slot.getAttachment() : slot.attachment;
    if (att && att.region) reproDrawn++;
    if (att && (att.name === "saoguang_00014" || att.path === "saoguang_00014")) {
        throw new Error("repro setup pose still shows saoguang_00014");
    }
}
assert(reproDrawn > 0, "repro skeleton has nothing left to draw");
const reproBanner = guarded.document.getElementById("region-warning");
assert(reproBanner && !reproBanner.hidden, "repro banner missing");
assert(reproBanner.querySelector(".region-warning-text").textContent.includes("saoguang_00014"), reproBanner.querySelector(".region-warning-text").textContent);
assert(guarded.alerts.length === 0, "repro load opened an alert");
guarded.setLang("en");
const english = reproBanner.querySelector(".region-warning-text").textContent;
assert(english.includes("Atlas is missing regions") && english.includes("saoguang_00014"), english);
assert(reproBanner.querySelector(".region-warning-close").textContent === "Close", "english close label");
reproBanner.querySelector(".region-warning-close").listeners.click();
assert(reproBanner.hidden === true, "dismiss did not hide the banner");
guarded.setLang("zh");
assert(reproBanner.hidden === true, "dismissed banner came back on language change");

const clean = loadRuntime("3.8", ["src/i18n/i18n.js", "src/loader/missing-regions.js"]);
clean.installMissingRegionGuard(clean.spine);
const cleanPages = [
    { name: "skeleton.png", image: { width: 2047, height: 2047 } },
    { name: "skeleton2.png", image: { width: 1992, height: 1992 } },
];
const cleanTex = [new Fake(2047, 2047), new Fake(1992, 1992)];
loadScript("src/loader/atlas-pages.js", clean);
const cleanAtlas = clean.makeSpineAtlas(clean.spine, multiAtlas, cleanPages, cleanTex);
const cleanData = new clean.spine.SkeletonBinary(new clean.spine.AtlasAttachmentLoader(cleanAtlas)).readSkeletonData(multiSkel);
assert(!(clean.__reportedMissingAtlasRegions || []).length, "complete asset warned: " + (clean.__reportedMissingAtlasRegions || []).join(", "));
assert(clean.document.getElementById("region-warning").hidden === true, "complete asset showed a warning");
const pageCounts = {};
eachAttachment(cleanData, (att) => {
    if (!att || !att.region || !att.region.page) return;
    pageCounts[att.region.page.name] = (pageCounts[att.region.page.name] || 0) + 1;
});
assert(pageCounts["skeleton.png"] > 0 && pageCounts["skeleton2.png"] > 0, "complete asset lost page bindings " + JSON.stringify(pageCounts));
play(clean.spine, cleanData, new clean.spine.Skeleton(cleanData));

console.log("missing-region tests passed");
