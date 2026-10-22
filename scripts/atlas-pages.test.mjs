// node scripts/atlas-pages.test.mjs
// Multi-page atlas pages must keep their own texture and pixel size.
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtureDir = root + "scripts/fixtures/multi-atlas/";
const atlasText = fs.readFileSync(fixtureDir + "skeleton.atlas", "utf8");
const skelBytes = new Uint8Array(fs.readFileSync(fixtureDir + "skeleton.skel"));

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function nearly(a, b, eps = 1e-4) {
    assert(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);
}

function loadScript(filename, sandbox) {
    vm.runInContext(fs.readFileSync(root + filename, "utf8"), sandbox, { filename });
    return sandbox;
}

function freshSandbox() {
    const sandbox = { console, window: null, self: null };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    return sandbox;
}

function loadHelpers() {
    return loadScript("src/loader/atlas-pages.js", freshSandbox());
}

function loadRuntime(version) {
    const sandbox = freshSandbox();
    loadScript("src/loader/atlas-pages.js", sandbox);
    loadScript(`public/vendor/spine/${version}/spine-webgl.js`, sandbox);
    assert(sandbox.spine && sandbox.spine.TextureAtlas, `${version} runtime did not load`);
    return sandbox;
}

function Fake(name, w, h) {
    this.name = name;
    this.w = w;
    this.h = h;
}
Fake.prototype.getImage = function () { return { width: this.w, height: this.h }; };
Fake.prototype.setFilters = function () {};
Fake.prototype.setWraps = function () {};
Fake.prototype.dispose = function () {};

function fileOf(name) {
    return { name, size: name.length, lastModified: 1 };
}

function pageRegion(name, region) {
    return [
        name,
        "size: 8, 8",
        "format: RGBA8888",
        "filter: Linear,Linear",
        "repeat: none",
        region,
        "  rotate: false",
        "  xy: 0, 0",
        "  size: 1, 1",
        "  orig: 1, 1",
        "  offset: 0, 0",
        "  index: -1",
        "",
    ].join("\n");
}

function bindRealAtlas(sandbox) {
    const pages = [
        { name: "skeleton.png", image: { width: 2047, height: 2047 } },
        { name: "skeleton2.png", image: { width: 1992, height: 1992 } },
    ];
    const textures = [
        new Fake("skeleton.png", 2047, 2047),
        new Fake("skeleton2.png", 1992, 1992),
    ];
    const atlas = sandbox.makeSpineAtlas(sandbox.spine, atlasText, pages, textures);
    return { atlas, textures };
}

function assertPageBinding(version, atlas) {
    assert(atlas.pages.length === 2, `${version} page count ${atlas.pages.length}`);
    const first = atlas.pages[0];
    const second = atlas.pages[1];
    assert(first.name === "skeleton.png", version);
    assert(second.name === "skeleton2.png", version);
    assert(first.texture && first.texture.name === "skeleton.png", `${version} page 1 texture`);
    assert(second.texture && second.texture.name === "skeleton2.png", `${version} page 2 texture`);
    assert(first.texture !== second.texture, `${version} pages share one texture`);
    assert(first.width === 2047 && first.height === 2047, `${version} page 1 size ${first.width}x${first.height}`);
    assert(second.width === 1992 && second.height === 1992, `${version} page 2 size ${second.width}x${second.height}`);

    const region = atlas.findRegion("fz2_000");
    assert(region && region.page === second, `${version} fz2_000 page`);
    assert(region.page.texture === second.texture, `${version} fz2_000 texture`);
    if (region.texture) assert(region.texture === second.texture, `${version} region.texture`);
    nearly(region.u, 1509 / 1992);

    const rotated = atlas.findRegion("jlizi_002");
    assert(rotated && rotated.page === second, `${version} jlizi_002 page`);
    nearly(rotated.u2, (2 + 455) / 1992);

    const onFirst = atlas.findRegion("bw1_001");
    assert(onFirst && onFirst.page === first, `${version} bw1_001 page`);
    nearly(onFirst.u, 1110 / 2047);
}

const helpers = loadHelpers();

const names = helpers.atlasPageNames(atlasText);
assert(names.length === 2 && names[0] === "skeleton.png" && names[1] === "skeleton2.png", "page names " + names.join(","));

const pairs = helpers.pairAtlasPages(atlasText, [
    fileOf("skeleton2.png"),
    fileOf("notes.txt"),
    fileOf("skeleton.png"),
]);
assert(pairs[0].file.name === "skeleton.png", "page 1 file");
assert(pairs[1].file.name === "skeleton2.png", "page 2 file");
assert(pairs[0].file !== pairs[1].file, "pages collapsed to one file");

const prefixed = helpers.pairAtlasPages(
    "\n" + pageRegion("images/skeleton2.png", "r2"),
    [fileOf("skeleton2.png")]
);
assert(prefixed.length === 1 && prefixed[0].file.name === "skeleton2.png", "directory prefix");

const cased = helpers.pairAtlasPages(
    "\n" + pageRegion("Skeleton.PNG", "r"),
    [fileOf("skeleton.png")]
);
assert(cased[0].file.name === "skeleton.png", "case");

const singleNamed = [
    "hero.png",
    "size: 32, 16",
    "format: RGBA8888",
    "filter: Linear,Linear",
    "repeat: none",
    "box",
    "  rotate: false",
    "  xy: 1, 2",
    "  size: 4, 5",
    "  orig: 4, 5",
    "  offset: 0, 0",
    "  index: -1",
    "",
].join("\n");
const loose = helpers.pairAtlasPages(singleNamed, [fileOf("only.png")]);
assert(loose.length === 1 && loose[0].name === "hero.png" && loose[0].file.name === "only.png", "single page fallback");
const exact = helpers.pairAtlasPages(singleNamed, [fileOf("preview.png"), fileOf("hero.png")]);
assert(exact[0].file.name === "hero.png", "single page keeps the named texture");

const missing = helpers.pairAtlasPages(atlasText, [fileOf("skeleton.png")]);
assert(missing[1].file === null, "missing page 2 was filled with page 1");

let threw = false;
try {
    helpers.makeSpineAtlas({
        TextureAtlas: function (_text, loader) {
            this.pages = ["skeleton.png", "skeleton2.png"].map((name) => ({
                name,
                texture: loader(name),
                width: 1,
                height: 1,
            }));
        },
    }, atlasText, [
        { name: "skeleton.png" },
        { name: "skeleton2.png" },
    ], [new Fake("skeleton.png", 1, 1)]);
} catch (err) {
    threw = !!(err && err.missingPages && err.missingPages.length);
}
assert(threw, "missing page texture must not fall back to page 1");

for (const version of ["3.6", "3.7", "3.8", "4.0", "4.1", "4.2"]) {
    const sandbox = loadRuntime(version);
    const { atlas } = bindRealAtlas(sandbox);
    assertPageBinding(version, atlas);
}

const spine38 = loadRuntime("3.8");
const bound = bindRealAtlas(spine38);
const singlePages = [{ name: "hero.png", image: { width: 32, height: 16 } }];
const singleTex = [new Fake("only.png", 32, 16)];
const singleAtlas = spine38.makeSpineAtlas(spine38.spine, singleNamed, singlePages, singleTex);
assert(singleAtlas.pages.length === 1, "single page count");
assert(singleAtlas.pages[0].texture === singleTex[0], "single page texture");
assert(singleAtlas.pages[0].width === 32 && singleAtlas.pages[0].height === 16, "single page size");
const box = singleAtlas.findRegion("box");
assert(box, "single page region");
nearly(box.u, 1 / 32);
nearly(box.v, 2 / 16);

const loader = new spine38.spine.AtlasAttachmentLoader(bound.atlas);
const binary = new spine38.spine.SkeletonBinary(loader);
binary.scale = 1;
const data = binary.readSkeletonData(skelBytes);
assert(String(data.version).startsWith("3.8"), "fixture version " + data.version);
const counts = {};
for (const skin of data.skins) {
    const slots = skin.attachments || [];
    for (const slot of slots) {
        if (!slot) continue;
        const list = Array.isArray(slot) ? slot : Object.values(slot);
        for (const att of list) {
            if (!att || !att.region || !att.region.page) continue;
            const pageName = att.region.page.name;
            const texName = att.region.texture && att.region.texture.name;
            assert(texName === pageName, `${att.name || "attachment"} on ${pageName} uses ${texName}`);
            assert(att.region.texture === att.region.page.texture, "attachment texture drifted from its page");
            counts[pageName] = (counts[pageName] || 0) + 1;
        }
    }
}
assert(counts["skeleton.png"] > 0 && counts["skeleton2.png"] > 0, "attachment counts " + JSON.stringify(counts));

function loadGrouping() {
    const sandbox = freshSandbox();
    sandbox.document = {
        body: { addEventListener() {} },
        getElementById() { return { addEventListener() {}, style: {} }; },
    };
    loadScript("src/loader/atlas-pages.js", sandbox);
    loadScript("src/files/file-handler.js", sandbox);
    return sandbox;
}

const grouping = loadGrouping();
const heroAtlas = fileOf("hero.atlas");
const petAtlas = fileOf("pet.atlas");
const heroText = "\n" + pageRegion("hero.png", "h") + pageRegion("fx_layer.png", "fx");
const petText = "\n" + pageRegion("pet.png", "p");
const uploaded = [
    fileOf("hero.skel"),
    fileOf("pet.skel"),
    heroAtlas,
    petAtlas,
    fileOf("hero.png"),
    fileOf("fx_layer.png"),
    fileOf("pet.png"),
    fileOf("other.png"),
];
const texts = new Map([[heroAtlas, heroText], [petAtlas, petText]]);
const groups = grouping.groupSpineFiles(uploaded, texts);
const byName = Object.fromEntries(groups.map((group) => [group.name, group.files.map((file) => file.name).sort()]));
assert(byName.hero.includes("fx_layer.png"), "hero dropped fx_layer.png: " + byName.hero);
assert(byName.hero.includes("hero.png"), "hero missing its first page");
assert(!byName.hero.includes("pet.png") && !byName.hero.includes("other.png"), "hero took unrelated images");
assert(byName.pet.includes("pet.png") && !byName.pet.includes("fx_layer.png"), "pet group " + byName.pet);

const withoutText = grouping.groupSpineFiles([
    fileOf("hero.skel"),
    heroAtlas,
    fileOf("hero.png"),
    fileOf("fx_layer.png"),
]);
assert(withoutText.length === 1, "basename group missing");
assert(!withoutText[0].files.some((file) => file.name === "fx_layer.png"), "basename match should not invent page names");

console.log("atlas-pages tests passed");
