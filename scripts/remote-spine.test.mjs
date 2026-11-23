// node scripts/remote-spine.test.mjs
// Query-string auto load: keep a nested spine URL intact, reject non-http(s),
// resolve atlas pages against that URL, and fetch a set without a file picker.
import fs from "node:fs";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const skelBytes = new Uint8Array(fs.readFileSync(root + "scripts/fixtures/multi-atlas/skeleton.skel"));
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const USER_SPINE = "http://127.0.0.1:8932/spine-file?dir=remoteAssets%2Foperation%2Fcn%2Fspine%2FshiJi&name=";
const USER_SEARCH = "?spine=http%3A%2F%2F127.0.0.1%3A8932%2Fspine-file%3Fdir%3DremoteAssets%252Foperation%252Fcn%252Fspine%252FshiJi%26name%3D";

function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
}

function atlasText(pages) {
    return pages.map((name) => [
        name,
        "size: 8, 8",
        "format: RGBA8888",
        "filter: Linear,Linear",
        "repeat: none",
        "box",
        "  rotate: false",
        "  xy: 0, 0",
        "  size: 1, 1",
        "  orig: 1, 1",
        "  offset: 0, 0",
        "  index: -1",
        "",
    ].join("\n")).join("\n");
}

const atlasBytes = new TextEncoder().encode(atlasText(["shiJi.png", "shiJi2.png"]));
const heroAtlasBytes = new TextEncoder().encode(atlasText(["hero.png", "hero2.png"]));

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
        if (sel.startsWith("[")) return Object.prototype.hasOwnProperty.call(el.attrs, sel.slice(1, -1));
        return el.tagName === sel.toUpperCase();
    }
    function query(el, sel) {
        if (matches(el, sel)) return el;
        for (const child of el.children || []) {
            const hit = query(child, sel);
            if (hit) return hit;
        }
        return null;
    }
    function queryAll(el, sel) {
        const out = [];
        const walk = (node) => {
            if (matches(node, sel)) out.push(node);
            for (const child of node.children || []) walk(child);
        };
        walk(el);
        return out;
    }
    const body = createElement("body");
    const sandbox = {
        console,
        URL,
        TextEncoder,
        TextDecoder,
        Uint8Array,
        DataView,
        File,
        Blob,
        Response,
        DecompressionStream,
        location: { search: "" },
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
        handled: null,
        fetchCalls: [],
    };
    sandbox.handleFiles = async (files) => { sandbox.handled = files; };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    return sandbox;
}

function responseFor(spec) {
    const body = spec.body || new Uint8Array();
    const headers = spec.headers || {};
    const status = spec.status || 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        url: spec.url,
        headers: {
            get(name) {
                const key = String(name || "").toLowerCase();
                return headers[key] || headers[name] || "";
            },
        },
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    };
}

function installFetch(sandbox, handler) {
    sandbox.fetchCalls = [];
    sandbox.fetch = async (url) => {
        sandbox.fetchCalls.push(String(url));
        const spec = await handler(String(url));
        spec.url = String(url);
        return responseFor(spec);
    };
}

function namesOf(files) {
    return (files || []).map((file) => file.name).sort();
}

function u16(n) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(n);
    return buf;
}

function u32(n) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(n >>> 0);
    return buf;
}

function makeZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name, "utf8");
        const raw = Buffer.from(entry.data);
        const method = entry.method || 0;
        const stored = method === 8 ? zlib.deflateRawSync(raw) : raw;
        const crc = zlib.crc32(raw);
        const local = Buffer.concat([
            u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
            u32(crc), u32(stored.length), u32(raw.length), u16(name.length), u16(0),
            name, stored,
        ]);
        const central = Buffer.concat([
            u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
            u32(crc), u32(stored.length), u32(raw.length), u16(name.length), u16(0), u16(0),
            u16(0), u16(0), u32(0), u32(offset), name,
        ]);
        locals.push(local);
        centrals.push(central);
        offset += local.length;
    }
    const centralDir = Buffer.concat(centrals);
    const eocd = Buffer.concat([
        u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
        u32(centralDir.length), u32(offset), u16(0),
    ]);
    return new Uint8Array(Buffer.concat([...locals, centralDir, eocd]));
}

const sandbox = freshSandbox();
loadScript("src/i18n/i18n.js", sandbox);
loadScript("src/loader/atlas-pages.js", sandbox);
loadScript("src/loader/remote-spine.js", sandbox);

const parsed = sandbox.parseViewerQuery(USER_SEARCH);
assert(parsed.spine === USER_SPINE, "nested spine URL was split: " + parsed.spine);
assert(parsed.spine.includes("?dir=remoteAssets%2Foperation%2Fcn%2Fspine%2FshiJi&name="), parsed.spine);
assert(!Object.prototype.hasOwnProperty.call(parsed, "name"), "name leaked into viewer params");
const decodedThenSplit = decodeURIComponent(USER_SEARCH.slice(1)).split("&");
assert(decodedThenSplit.length > 1, "fixture should contain an encoded ampersand");
assert(!parsed.spine.endsWith("dir=remoteAssets%2Foperation%2Fcn%2Fspine%2FshiJi"), "dir was cut off from name");

const plus = sandbox.parseViewerQuery("?spine=https%3A%2F%2Fcdn.example%2Fa%2Bb%2Fhero.skel&atlas=https%3A%2F%2Fcdn.example%2Fa.atlas");
assert(plus.spine === "https://cdn.example/a+b/hero.skel", plus.spine);
assert(plus.atlas === "https://cdn.example/a.atlas", plus.atlas);
const plusJob = sandbox.remoteJobFromQuery(plus);
assert(plusJob.mode === "spine" && plusJob.spine === plus.spine, "spine must win when both forms are present");

assert(sandbox.remoteJobFromQuery({ spine: "", skel: "", json: "", atlas: "" }) === null, "empty query built a job");

const staticAtlas = "https://cdn.example/spine/hero/hero.atlas?v=1";
assert(sandbox.resolveAtlasPageUrl(staticAtlas, "hero.png") === "https://cdn.example/spine/hero/hero.png?v=1", "page 1");
assert(sandbox.resolveAtlasPageUrl(staticAtlas, "hero2.png") === "https://cdn.example/spine/hero/hero2.png?v=1", "page 2");
assert(sandbox.resolveAtlasPageUrl(staticAtlas, "images/hero2.png") === "https://cdn.example/spine/hero/images/hero2.png?v=1", "nested page");

const apiPage = new URL(sandbox.resolveAtlasPageUrl(USER_SPINE, "shiJi.png"));
assert(apiPage.searchParams.get("dir") === "remoteAssets/operation/cn/spine/shiJi", apiPage.href);
assert(apiPage.searchParams.get("name") === "shiJi.png", apiPage.href);
const apiPage2 = new URL(sandbox.resolveAtlasPageUrl(USER_SPINE, "shiJi2.png"));
assert(apiPage2.searchParams.get("name") === "shiJi2.png", apiPage2.href);
assert(apiPage2.searchParams.get("dir") === "remoteAssets/operation/cn/spine/shiJi", "dir was dropped");
const namedAtlas = USER_SPINE.replace("name=", "name=shiJi.atlas");
const nestedApi = new URL(sandbox.resolveAtlasPageUrl(namedAtlas, "textures/shiJi2.png"));
assert(nestedApi.searchParams.get("name") === "textures/shiJi2.png", nestedApi.href);

let schemeRejected = false;
try {
    sandbox.resolveAtlasPageUrl(USER_SPINE, "javascript:alert(1).png");
} catch (err) {
    schemeRejected = err && err.code === "bad-scheme" && err.scheme === "javascript:";
}
assert(schemeRejected, "javascript page URL was accepted");

async function runAuto(search, handler) {
    sandbox.location.search = search;
    sandbox.handled = null;
    sandbox.fetchCalls = [];
    installFetch(sandbox, handler);
    const ok = await sandbox.autoLoadSpineFromQuery();
    return ok;
}

const manifestOk = await runAuto(USER_SEARCH, (url) => {
    const current = new URL(url);
    if (current.href === new URL(USER_SPINE).href) {
        const body = new TextEncoder().encode(JSON.stringify(["shiJi.skel", "shiJi.atlas", "shiJi.png", "shiJi2.png"]));
        return { body, headers: { "content-type": "application/json" } };
    }
    const name = current.searchParams.get("name");
    if (name === "shiJi.skel") return { body: skelBytes, headers: { "content-type": "application/octet-stream" } };
    if (name === "shiJi.atlas") return { body: atlasBytes, headers: { "content-type": "text/plain" } };
    if (name === "shiJi.png" || name === "shiJi2.png") return { body: pngBytes, headers: { "content-type": "image/png" } };
    return { status: 404, body: new Uint8Array() };
});
assert(manifestOk === true, "manifest auto-load failed");
assert(namesOf(sandbox.handled).join(",") === "shiJi.atlas,shiJi.png,shiJi.skel,shiJi2.png", namesOf(sandbox.handled).join(","));
assert(sandbox.fetchCalls[0] === USER_SPINE, "first fetch was not the intact spine URL: " + sandbox.fetchCalls[0]);
for (const name of ["shiJi.skel", "shiJi.atlas", "shiJi.png", "shiJi2.png"]) {
    const hit = sandbox.fetchCalls.map((url) => new URL(url)).find((url) => url.searchParams.get("name") === name);
    assert(hit, "missing fetch for " + name);
    assert(hit.searchParams.get("dir") === "remoteAssets/operation/cn/spine/shiJi", name + " lost dir");
}
assert(!sandbox.fetchCalls.some((url) => url.startsWith("javascript:") || url.startsWith("file:")), "unsafe fetch");

const rawOk = await runAuto(USER_SEARCH, (url) => {
    const current = new URL(url);
    const name = current.searchParams.get("name");
    if (!name) {
        return {
            body: skelBytes,
            headers: {
                "content-type": "application/octet-stream",
                "content-disposition": 'attachment; filename="shiJi.skel"',
            },
        };
    }
    if (name === "shiJi.atlas") return { body: atlasBytes, headers: { "content-type": "text/plain" } };
    if (name === "shiJi.png" || name === "shiJi2.png") return { body: pngBytes, headers: { "content-type": "image/png" } };
    return { status: 404, body: new Uint8Array() };
});
assert(rawOk === true, "raw skel response did not complete");
assert(sandbox.handled.some((file) => file.name === "shiJi.skel"), "raw response lost the skeleton name");
assert(sandbox.fetchCalls.filter((url) => new URL(url).searchParams.get("name") === "shiJi.atlas").length === 1, "atlas was not requested from name=");

const probeOk = await runAuto(USER_SEARCH, (url) => {
    const name = new URL(url).searchParams.get("name");
    if (!name) return { status: 404, body: new Uint8Array() };
    if (name === "shiJi.skel") return { body: skelBytes };
    if (name === "shiJi.atlas") return { body: atlasBytes, headers: { "content-type": "text/plain" } };
    if (name === "shiJi.png" || name === "shiJi2.png") return { body: pngBytes, headers: { "content-type": "image/png" } };
    return { status: 404, body: new Uint8Array() };
});
assert(probeOk === true, "404 on empty name did not probe shiJi.*");
assert(namesOf(sandbox.handled).includes("shiJi2.png"), "probed set missed the second atlas page");

const staticSearch = "?spine=" + encodeURIComponent("https://cdn.example/hero/hero.skel");
const staticOk = await runAuto(staticSearch, (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/hero.skel")) return { body: skelBytes };
    if (path.endsWith("/hero.atlas")) return { body: heroAtlasBytes, headers: { "content-type": "text/plain" } };
    if (path.endsWith("/hero.png") || path.endsWith("/hero2.png")) return { body: pngBytes, headers: { "content-type": "image/png" } };
    return { status: 404, body: new Uint8Array() };
});
assert(staticOk === true, "static skeleton URL did not load siblings");
assert(sandbox.fetchCalls.some((url) => url === "https://cdn.example/hero/hero2.png"), sandbox.fetchCalls.join("\n"));

const pairSearch = "?skel=" + encodeURIComponent("https://cdn.example/a/hero.skel")
    + "&atlas=" + encodeURIComponent("https://cdn.example/b/hero.atlas");
const pairOk = await runAuto(pairSearch, (url) => {
    const path = new URL(url).pathname;
    if (path === "/a/hero.skel") return { body: skelBytes };
    if (path === "/b/hero.atlas") return { body: heroAtlasBytes, headers: { "content-type": "text/plain" } };
    if (path === "/b/hero.png" || path === "/b/hero2.png") return { body: pngBytes, headers: { "content-type": "image/png" } };
    return { status: 404, body: new Uint8Array() };
});
assert(pairOk === true, "explicit skel+atlas did not load");
assert(sandbox.fetchCalls.some((url) => url === "https://cdn.example/b/hero.png"), "page was not resolved against the atlas");
assert(sandbox.fetchCalls.some((url) => url === "https://cdn.example/b/hero2.png"), "second page missing");
assert(!sandbox.fetchCalls.some((url) => url.startsWith("https://cdn.example/a/hero.png")), "page used the skeleton directory");

const indexHtml = "<!DOCTYPE HTML><html><body>"
    + "<a href=\"../\">parent</a>"
    + "<a href=\"shiJi.skel\">shiJi.skel</a>"
    + "<a href=\"shiJi.atlas\">shiJi.atlas</a>"
    + "<a href=\"shiJi.png\">shiJi.png</a>"
    + "<a href=\"shiJi2.png\">shiJi2.png</a>"
    + "</body></html>";
const indexOk = await runAuto("?spine=" + encodeURIComponent("http://127.0.0.1:8932/hero/"), (url) => {
    const path = new URL(url).pathname;
    if (path === "/hero/") return { body: new TextEncoder().encode(indexHtml), headers: { "content-type": "text/html" } };
    if (path.endsWith("/shiJi.skel")) return { body: skelBytes };
    if (path.endsWith("/shiJi.atlas")) return { body: atlasBytes, headers: { "content-type": "text/plain" } };
    if (path.endsWith("/shiJi.png") || path.endsWith("/shiJi2.png")) return { body: pngBytes, headers: { "content-type": "image/png" } };
    return { status: 404, body: new Uint8Array() };
});
assert(indexOk === true, "HTML listing did not load");
assert(sandbox.fetchCalls.some((url) => url === "http://127.0.0.1:8932/hero/shiJi2.png"), sandbox.fetchCalls.join("\n"));

const zipBytes = makeZip([
    { name: "hero/hero.skel", data: skelBytes, method: 0 },
    { name: "hero/hero.atlas", data: heroAtlasBytes, method: 0 },
    { name: "hero/hero.png", data: pngBytes, method: 8 },
    { name: "hero/hero2.png", data: pngBytes, method: 0 },
]);
const zipFiles = await sandbox.collectRemoteSpineFiles(
    { mode: "spine", spine: "https://cdn.example/packs/hero.zip" },
    async () => responseFor({
        url: "https://cdn.example/packs/hero.zip",
        body: zipBytes,
        headers: { "content-type": "application/zip" },
    })
);
assert(namesOf(zipFiles).join(",") === "hero.atlas,hero.png,hero.skel,hero2.png", namesOf(zipFiles).join(","));
assert(zipFiles.find((file) => file.name === "hero.skel").relativePath === "hero/hero.skel", "zip path dropped");

sandbox.location.search = "";
sandbox.handled = null;
sandbox.fetchCalls = [];
installFetch(sandbox, () => { throw new Error("fetch should not run"); });
const idle = await sandbox.autoLoadSpineFromQuery();
assert(idle === false, "empty query started a load");
assert(sandbox.fetchCalls.length === 0, "empty query fetched");
assert(sandbox.handled == null, "empty query called handleFiles");

for (const bad of ["file:///tmp/hero.skel", "javascript:alert(1)", "blob:https://cimxin.github.io/id"]) {
    sandbox.handled = null;
    const ok = await runAuto("?spine=" + encodeURIComponent(bad), () => {
        throw new Error("rejected scheme was fetched: " + bad);
    });
    assert(ok === false, bad + " was accepted");
    assert(sandbox.fetchCalls.length === 0, bad + " was fetched");
    const banner = sandbox.document.getElementById("remote-warning");
    assert(banner && banner.hidden === false, bad + " banner hidden");
    const text = banner.querySelector(".region-warning-text").textContent;
    assert(text.includes("http"), text);
    assert(!text.includes(bad), "banner echoed the rejected URL: " + text);
}

sandbox.handled = null;
const corsOk = await runAuto(USER_SEARCH, () => {
    throw new TypeError("Failed to fetch");
});
assert(corsOk === false, "CORS failure was treated as success");
assert(sandbox.handled == null, "CORS failure still previewed files");
const corsBanner = sandbox.document.getElementById("remote-warning");
assert(corsBanner && corsBanner.hidden === false, "CORS banner missing");
let corsText = corsBanner.querySelector(".region-warning-text").textContent;
assert(corsText.includes("Access-Control-Allow-Origin"), corsText);
assert(corsText.includes("https://cimxin.github.io"), corsText);
assert(corsText.includes("127.0.0.1:8932"), "banner hid the failing URL");
sandbox.setLang("en");
corsText = corsBanner.querySelector(".region-warning-text").textContent;
assert(corsText.includes("Access-Control-Allow-Origin") && corsText.includes("https://cimxin.github.io"), corsText);
assert(/could not load/i.test(corsText), corsText);
const close = corsBanner.querySelector(".region-warning-close");
close.listeners.click();
assert(corsBanner.hidden === true, "dismiss did not hide the banner");
sandbox.setLang("zh");
assert(corsBanner.hidden === true, "dismissed banner came back on language change");

console.log("remote spine URL tests passed");
