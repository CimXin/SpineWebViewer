// 用页面查询串里的 http(s) 地址自动加载 Spine。
// `spine` 的值是一整段 URL。解析时只按原始查询串的 & 切分，先不解码，
// 这样值里面编码过的 %26 不会被当成查看器自己的参数（dir、name 属于本地服务）。

var REMOTE_QUERY_KEYS = { spine: 1, skel: 1, json: 1, atlas: 1 };
var NAME_QUERY_KEYS = ["name", "file", "filename"];
var remoteErrorState = null;
var remoteErrorDismissed = false;

function remoteFail(code, extra) {
    var err = new Error(code);
    err.code = code;
    if (extra) {
        Object.keys(extra).forEach(function (key) {
            err[key] = extra[key];
        });
    }
    return err;
}

function decodeQueryComponent(raw) {
    var text = String(raw == null ? "" : raw).replace(/\+/g, "%2B");
    try {
        return decodeURIComponent(text);
    } catch (e) {
        return String(raw == null ? "" : raw);
    }
}

function parseViewerQuery(search) {
    var raw = String(search || "");
    if (raw.charAt(0) === "?") raw = raw.slice(1);
    var out = { spine: "", skel: "", json: "", atlas: "" };
    if (!raw) return out;
    var parts = raw.split("&");
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part) continue;
        var eq = part.indexOf("=");
        var key = decodeQueryComponent(eq === -1 ? part : part.slice(0, eq)).toLowerCase();
        if (!REMOTE_QUERY_KEYS[key] || out[key]) continue;
        out[key] = eq === -1 ? "" : decodeQueryComponent(part.slice(eq + 1)).trim();
    }
    return out;
}

function remoteJobFromQuery(query) {
    var spine = query && query.spine ? String(query.spine).trim() : "";
    if (spine) return { mode: "spine", spine: spine };
    var skel = query && query.skel ? String(query.skel).trim() : "";
    var json = query && query.json ? String(query.json).trim() : "";
    var atlas = query && query.atlas ? String(query.atlas).trim() : "";
    var data = skel || json;
    if (data && atlas) return { mode: "pair", data: data, atlas: atlas, kind: skel ? "skel" : "json" };
    if (data) return { mode: "spine", spine: data };
    if (atlas) return { mode: "spine", spine: atlas };
    return null;
}

function assertHttpUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) throw remoteFail("bad-url", { url: raw });
    var url;
    try {
        url = new URL(raw);
    } catch (e) {
        throw remoteFail("bad-url", { url: raw });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw remoteFail("bad-scheme", { scheme: url.protocol, url: raw });
    }
    return url.href;
}

function leafName(name) {
    var text = String(name || "").trim().replace(/\\/g, "/");
    var q = text.indexOf("?");
    if (q !== -1) text = text.slice(0, q);
    var hash = text.indexOf("#");
    if (hash !== -1) text = text.slice(0, hash);
    var parts = text.split("/");
    return parts.length ? parts[parts.length - 1] : "";
}

function kindOfName(name) {
    var n = String(name || "").toLowerCase();
    if (n.endsWith(".atlas.txt") || n.endsWith(".atlas")) return "atlas";
    if (n.endsWith(".json.txt") || n.endsWith(".json")) return "json";
    if (n.endsWith(".skel.bytes") || n.endsWith(".skel")) return "skel";
    if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp")) return "image";
    if (n.endsWith(".zip")) return "zip";
    return "";
}

function stripSpineExt(name) {
    var n = String(name || "");
    var lower = n.toLowerCase();
    var suffixes = [".atlas.txt", ".json.txt", ".skel.bytes", ".atlas", ".json", ".skel", ".png", ".jpg", ".jpeg", ".webp", ".zip"];
    for (var i = 0; i < suffixes.length; i++) {
        if (lower.endsWith(suffixes[i])) return n.slice(0, n.length - suffixes[i].length);
    }
    return n;
}

function suffixFor(name, kind) {
    var n = String(name || "").toLowerCase();
    if (kind === "atlas") return n.endsWith(".atlas.txt") ? ".atlas.txt" : ".atlas";
    if (kind === "json") return n.endsWith(".json.txt") ? ".json.txt" : ".json";
    if (kind === "skel") return n.endsWith(".skel.bytes") ? ".skel.bytes" : ".skel";
    if (kind === "image") {
        if (n.endsWith(".jpeg")) return ".jpeg";
        if (n.endsWith(".jpg")) return ".jpg";
        if (n.endsWith(".webp")) return ".webp";
        return ".png";
    }
    return "";
}

function nameQueryKey(url) {
    var parts = url.pathname.split("/").filter(Boolean);
    var last = parts.length ? parts[parts.length - 1] : "";
    if (kindOfName(last)) return "";
    for (var i = 0; i < NAME_QUERY_KEYS.length; i++) {
        if (url.searchParams.has(NAME_QUERY_KEYS[i])) return NAME_QUERY_KEYS[i];
    }
    return "";
}

function joinRel(dir, rel) {
    var parts = String(dir || "").concat(String(rel || "")).split("/");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part || part === ".") continue;
        if (part === "..") out.pop();
        else out.push(part);
    }
    return out.join("/");
}

function resolveRelatedSpineUrl(baseUrl, fileName) {
    var rawName = String(fileName || "").trim().replace(/\\/g, "/");
    if (!rawName) throw remoteFail("incomplete", { url: String(baseUrl || "") });
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawName) || rawName.indexOf("//") === 0) {
        var absolute = rawName.indexOf("//") === 0 ? new URL(baseUrl).protocol + rawName : rawName;
        return assertHttpUrl(absolute);
    }
    var url = new URL(assertHttpUrl(baseUrl));
    var key = nameQueryKey(url);
    if (key) {
        var current = url.searchParams.get(key) || "";
        var slash = current.lastIndexOf("/");
        var dir = slash >= 0 ? current.slice(0, slash + 1) : "";
        url.searchParams.set(key, joinRel(dir, rawName));
        return url.href;
    }
    var path = url.pathname;
    var dirPath = path.endsWith("/") ? path : path.slice(0, path.lastIndexOf("/") + 1);
    var resolved = new URL(rawName, url.origin + dirPath);
    resolved.search = url.search;
    resolved.hash = "";
    return assertHttpUrl(resolved.href);
}

function resolveAtlasPageUrl(atlasUrl, pageName) {
    return resolveRelatedSpineUrl(atlasUrl, pageName);
}

function stemFromUrl(raw) {
    var url = new URL(assertHttpUrl(raw));
    var key = nameQueryKey(url);
    if (key) {
        var named = url.searchParams.get(key) || "";
        if (named) return stripSpineExt(leafName(named)) || "skeleton";
    }
    var dir = url.searchParams.get("dir") || "";
    if (dir) {
        var dirLeaf = dir.replace(/\\/g, "/").split("/").filter(Boolean).pop();
        if (dirLeaf) return stripSpineExt(dirLeaf);
    }
    var parts = url.pathname.split("/").filter(Boolean);
    var last = parts.length ? parts[parts.length - 1] : "";
    if (last && kindOfName(last)) return stripSpineExt(last);
    if (last && last !== "spine-file") return stripSpineExt(last);
    return "skeleton";
}

function filenameFromDisposition(header) {
    var text = String(header || "");
    if (!text) return "";
    var star = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(text);
    if (star) {
        try { return decodeURIComponent(star[2].trim()); } catch (e) { return star[2].trim(); }
    }
    var quoted = /filename\s*=\s*"([^"]+)"/i.exec(text);
    if (quoted) return quoted[1];
    var plain = /filename\s*=\s*([^;]+)/i.exec(text);
    return plain ? plain[1].trim() : "";
}

function decodeUtf8(bytes) {
    var data = bytes || new Uint8Array();
    if (typeof TextDecoder === "function") return new TextDecoder("utf-8").decode(data);
    var text = "";
    for (var i = 0; i < data.length; i++) text += String.fromCharCode(data[i]);
    return text;
}

function toBytes(raw) {
    if (!raw) return new Uint8Array();
    if (typeof raw.byteLength === "number" && typeof raw.byteOffset === "number") {
        var copy = new Uint8Array(raw.byteLength);
        copy.set(raw);
        return copy;
    }
    return new Uint8Array(raw);
}

function headerValue(headers, name) {
    if (!headers) return "";
    if (typeof headers.get === "function") return headers.get(name) || "";
    var lower = name.toLowerCase();
    if (headers[lower] != null) return String(headers[lower]);
    if (headers[name] != null) return String(headers[name]);
    return "";
}

async function pullRemote(url, fetchImpl) {
    var safe = assertHttpUrl(url);
    var res;
    try {
        res = await fetchImpl(safe, { method: "GET", mode: "cors", credentials: "omit" });
    } catch (e) {
        throw remoteFail("network", { url: safe, message: e && e.message ? e.message : String(e) });
    }
    var buf = new Uint8Array();
    if (res && typeof res.arrayBuffer === "function") buf = toBytes(await res.arrayBuffer());
    return {
        url: (res && res.url) || safe,
        requestedUrl: safe,
        ok: !!(res && res.ok),
        status: res && res.status ? res.status : 0,
        buf: buf,
        type: headerValue(res && res.headers, "content-type").toLowerCase(),
        disposition: headerValue(res && res.headers, "content-disposition")
    };
}

function nameHint(res) {
    return leafName(filenameFromDisposition(res.disposition))
        || (kindOfName(leafName(res.url)) ? leafName(res.url) : "")
        || (kindOfName(leafName(res.requestedUrl)) ? leafName(res.requestedUrl) : "");
}

function looksLikeSkel(bytes) {
    if (!bytes || bytes.length < 8) return false;
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return false;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return false;
    var headLen = Math.min(bytes.length, 96);
    var nonPrint = 0;
    var text = "";
    for (var i = 0; i < headLen; i++) {
        var c = bytes[i];
        if (c >= 32 && c <= 126) text += String.fromCharCode(c);
        else {
            text += " ";
            nonPrint++;
        }
    }
    return nonPrint > 0 && /\d+\.\d+\.\d+/.test(text);
}

function isZipBytes(bytes, type, hint) {
    if (hint === "zip") return true;
    if (type && type.indexOf("zip") !== -1) return true;
    return !!(bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) && (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08));
}

function isImageBytes(bytes, type) {
    if (type && type.indexOf("image/") === 0) return true;
    if (!bytes || bytes.length < 4) return false;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;
    return false;
}

function imageSuffix(bytes, type, hint) {
    var fromName = suffixFor(hint, "image");
    if (kindOfName(hint) === "image" && fromName !== ".png") return fromName;
    if (type.indexOf("jpeg") !== -1 || type.indexOf("jpg") !== -1) return ".jpg";
    if (type.indexOf("webp") !== -1) return ".webp";
    if (bytes && bytes[0] === 0xff && bytes[1] === 0xd8) return ".jpg";
    if (bytes && bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return ".webp";
    return ".png";
}

function isHtml(type, text) {
    if (type && (type.indexOf("text/html") !== -1 || type.indexOf("application/xhtml") !== -1)) return true;
    var head = String(text || "").slice(0, 400).trim().toLowerCase();
    return head.indexOf("<!doctype html") === 0 || head.indexOf("<html") === 0 || head.indexOf("<head") === 0 || head.indexOf("<body") === 0;
}

function tryJson(text) {
    var trimmed = String(text || "").trim();
    if (!trimmed || (trimmed.charAt(0) !== "{" && trimmed.charAt(0) !== "[")) return null;
    try { return JSON.parse(trimmed); } catch (e) { return null; }
}

function isSkeletonJson(data) {
    return !!(data && typeof data === "object" && !Array.isArray(data) && data.skeleton && typeof data.skeleton === "object" && (data.skeleton.spine || data.bones || data.slots || data.skins));
}

function manifestEntries(data) {
    if (Array.isArray(data)) return data.filter(function (item) { return item != null && item !== ""; });
    if (!data || typeof data !== "object") return null;
    var listKeys = ["files", "assets", "entries", "list"];
    for (var i = 0; i < listKeys.length; i++) {
        if (Array.isArray(data[listKeys[i]])) return data[listKeys[i]];
    }
    var out = [];
    ["skel", "skeleton", "json", "data", "atlas"].forEach(function (key) {
        if (typeof data[key] === "string") out.push(data[key]);
    });
    ["images", "pngs", "pages", "textures"].forEach(function (key) {
        var value = data[key];
        if (typeof value === "string") out.push(value);
        else if (Array.isArray(value)) out.push.apply(out, value);
    });
    return out.length ? out : null;
}

function decodeHtmlAttr(value) {
    return String(value || "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

function htmlSpineEntries(html) {
    var text = String(html || "");
    var re = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
    var out = [];
    var match;
    while ((match = re.exec(text))) {
        var href = decodeHtmlAttr(match[1] || match[2] || match[3] || "").trim();
        if (!href || href.charAt(0) === "#" || href.charAt(0) === "?") continue;
        var path = href.split("#")[0].split("?")[0];
        if (!path || path === "/" || path.endsWith("/") || path.indexOf("..") !== -1) continue;
        if (!kindOfName(leafName(path))) continue;
        out.push(href);
    }
    return out;
}

function looksTextual(bytes, type, hintKind) {
    if (hintKind === "atlas" || hintKind === "json") return true;
    if (type && (type.indexOf("text/") !== -1 || type.indexOf("json") !== -1 || type.indexOf("html") !== -1 || type.indexOf("xml") !== -1)) return true;
    if (!bytes || !bytes.length || bytes.length > 1500000) return false;
    var sample = Math.min(bytes.length, 64);
    var weird = 0;
    for (var i = 0; i < sample; i++) {
        if (bytes[i] === 0 || bytes[i] < 9) weird++;
    }
    return weird === 0;
}

function looksLikeAtlas(text) {
    if (!text || window.atlasPageNames == null) return false;
    try {
        var names = window.atlasPageNames(text) || [];
        for (var i = 0; i < names.length; i++) {
            if (kindOfName(names[i]) === "image") return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

function classifyRemote(res) {
    var hint = nameHint(res);
    var hintKind = kindOfName(hint);
    var bytes = res.buf || new Uint8Array();
    var type = res.type || "";
    if (isZipBytes(bytes, type, hintKind)) return { type: "zip" };
    if (isImageBytes(bytes, type) || hintKind === "image") {
        return { type: "asset", kind: "image", ext: imageSuffix(bytes, type, hint) };
    }
    var text = "";
    if (looksTextual(bytes, type, hintKind)) text = decodeUtf8(bytes);
    if (text && isHtml(type, text)) {
        var links = htmlSpineEntries(text);
        if (links.length) return { type: "index", entries: links };
        return { type: "unknown" };
    }
    if (text) {
        var data = tryJson(text);
        if (data) {
            if (isSkeletonJson(data)) return { type: "asset", kind: "json", ext: ".json" };
            var entries = manifestEntries(data);
            if (entries && entries.length) return { type: "manifest", entries: entries };
            return { type: "unknown" };
        }
        if (looksLikeAtlas(text) || hintKind === "atlas") {
            return { type: "asset", kind: "atlas", ext: suffixFor(hint, "atlas") || ".atlas" };
        }
    }
    if (looksLikeSkel(bytes) || hintKind === "skel") return { type: "asset", kind: "skel", ext: suffixFor(hint, "skel") || ".skel" };
    if (hintKind === "json") return { type: "asset", kind: "json", ext: suffixFor(hint, "json") || ".json" };
    return { type: "unknown" };
}

function readU16(view, offset) {
    return view.getUint16(offset, true);
}

function readU32(view, offset) {
    return view.getUint32(offset, true);
}

function findZipEocd(bytes) {
    var min = Math.max(0, bytes.length - 22 - 65535);
    for (var i = bytes.length - 22; i >= min; i--) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
    }
    return -1;
}

async function inflateRawZip(bytes) {
    if (typeof window !== "undefined" && typeof window.inflateRawSpineZip === "function") {
        return toBytes(await window.inflateRawSpineZip(bytes));
    }
    if (typeof DecompressionStream !== "function" || typeof Blob !== "function" || typeof Response !== "function") {
        throw remoteFail("incomplete", { url: "zip" });
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return toBytes(await new Response(stream).arrayBuffer());
}

function safeZipPath(name) {
    var text = String(name || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!text || text.endsWith("/")) return "";
    var parts = text.split("/");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        if (!parts[i] || parts[i] === ".") continue;
        if (parts[i] === "..") return "";
        out.push(parts[i]);
    }
    text = out.join("/");
    if (!text || text.indexOf("__MACOSX/") === 0 || leafName(text).charAt(0) === ".") return "";
    if (!kindOfName(leafName(text))) return "";
    return text;
}

async function unzipSpineFiles(bytes) {
    var eocd = findZipEocd(bytes);
    if (eocd < 0) throw remoteFail("incomplete", { url: "zip" });
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var count = readU16(view, eocd + 10);
    var cdOffset = readU32(view, eocd + 16);
    var files = [];
    var cursor = cdOffset;
    for (var n = 0; n < count; n++) {
        if (cursor + 46 > bytes.length || readU32(view, cursor) !== 0x02014b50) break;
        var flags = readU16(view, cursor + 8);
        var method = readU16(view, cursor + 10);
        var compSize = readU32(view, cursor + 20);
        var nameLen = readU16(view, cursor + 28);
        var extraLen = readU16(view, cursor + 30);
        var commentLen = readU16(view, cursor + 32);
        var localOffset = readU32(view, cursor + 42);
        var nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLen);
        cursor += 46 + nameLen + extraLen + commentLen;
        if (flags & 1) continue;
        var path = safeZipPath(decodeUtf8(nameBytes));
        if (!path) continue;
        if (localOffset + 30 > bytes.length || readU32(view, localOffset) !== 0x04034b50) continue;
        var localNameLen = readU16(view, localOffset + 26);
        var localExtraLen = readU16(view, localOffset + 28);
        var dataStart = localOffset + 30 + localNameLen + localExtraLen;
        var slice = bytes.subarray(dataStart, dataStart + compSize);
        var data;
        if (method === 0) data = toBytes(slice);
        else if (method === 8) data = await inflateRawZip(slice);
        else continue;
        files.push({
            name: leafName(path),
            bytes: data,
            relativePath: path.indexOf("/") === -1 ? "" : path,
            sourceUrl: ""
        });
        if (files.length >= 80) break;
    }
    return files;
}

function fileRecord(res, ext, preferredName) {
    var name = leafName(preferredName || filenameFromDisposition(res.disposition) || "");
    if (!kindOfName(name)) {
        var fromUrl = nameHint(res);
        if (kindOfName(fromUrl)) name = fromUrl;
    }
    if (!kindOfName(name)) {
        var stem = stemFromUrl(res.requestedUrl || res.url);
        name = stem + (ext || "");
    }
    return {
        name: leafName(name),
        bytes: toBytes(res.buf),
        relativePath: "",
        sourceUrl: res.requestedUrl || res.url
    };
}

function findByKind(files, kinds) {
    for (var i = 0; i < files.length; i++) {
        var kind = kindOfName(files[i].name);
        if (kinds.indexOf(kind) !== -1) return files[i];
    }
    return null;
}

function stemsFor(baseUrl, files) {
    var stems = [];
    function add(stem) {
        stem = stripSpineExt(String(stem || "").trim());
        if (!stem || stem === "spine-file") return;
        if (stems.indexOf(stem) === -1) stems.push(stem);
    }
    (files || []).forEach(function (file) {
        var kind = kindOfName(file.name);
        if (kind === "skel" || kind === "json" || kind === "atlas") add(stripSpineExt(file.name));
    });
    try { add(stemFromUrl(baseUrl)); } catch (e) {}
    add("skeleton");
    return stems;
}

function candidateNames(baseUrl, files, kinds) {
    var stems = stemsFor(baseUrl, files);
    var out = [];
    stems.forEach(function (stem) {
        if (kinds.indexOf("skel") !== -1) out.push(stem + ".skel", stem + ".skel.bytes");
        if (kinds.indexOf("json") !== -1) out.push(stem + ".json", stem + ".json.txt");
        if (kinds.indexOf("atlas") !== -1) out.push(stem + ".atlas", stem + ".atlas.txt");
    });
    var seen = {};
    return out.filter(function (name) {
        var key = name.toLowerCase();
        if (seen[key]) return false;
        seen[key] = 1;
        return true;
    });
}

function entryName(entry) {
    if (typeof entry === "string") return leafName(entry);
    if (!entry || typeof entry !== "object") return "";
    var name = entry.name || entry.file || entry.filename || entry.path || "";
    if (!name) name = entry.url || entry.src || entry.href || "";
    return leafName(name);
}

function resolveEntryUrl(baseUrl, entry) {
    var href = "";
    var name = entryName(entry);
    if (typeof entry === "string") href = entry;
    else href = entry.url || entry.src || entry.href || entry.name || entry.file || entry.filename || entry.path || "";
    href = decodeHtmlAttr(href).trim();
    var url = resolveRelatedSpineUrl(baseUrl, href);
    return { url: url, name: name || leafName(href) };
}

function chooseBundleEntries(entries, baseUrl) {
    var list = entries || [];
    var datas = list.filter(function (entry) {
        var kind = kindOfName(entryName(entry));
        return kind === "skel" || kind === "json";
    });
    var atlases = list.filter(function (entry) { return kindOfName(entryName(entry)) === "atlas"; });
    var images = list.filter(function (entry) { return kindOfName(entryName(entry)) === "image"; });
    var stem = "";
    try { stem = stemFromUrl(baseUrl).toLowerCase(); } catch (e) {}
    var data = null;
    if (datas.length === 1) data = datas[0];
    else if (datas.length > 1) {
        data = datas.filter(function (entry) { return stripSpineExt(entryName(entry)).toLowerCase() === stem; })[0] || datas[0];
    }
    if (data) stem = stripSpineExt(entryName(data)).toLowerCase();
    var atlas = null;
    if (atlases.length === 1) atlas = atlases[0];
    else if (atlases.length > 1) {
        atlas = atlases.filter(function (entry) { return stripSpineExt(entryName(entry)).toLowerCase() === stem; })[0] || atlases[0];
    }
    var chosen = [];
    if (data) chosen.push(data);
    if (atlas) chosen.push(atlas);
    var relatedImages = images.filter(function (entry) {
        var base = stripSpineExt(entryName(entry)).toLowerCase();
        return !stem || base === stem || base.indexOf(stem) === 0;
    });
    if (!relatedImages.length && images.length && images.length <= 8) relatedImages = images;
    if (relatedImages.length > 16) relatedImages = relatedImages.slice(0, 16);
    return chosen.concat(relatedImages);
}

async function probeNamedFile(baseUrl, names, fetchImpl) {
    for (var i = 0; i < names.length; i++) {
        var url = resolveRelatedSpineUrl(baseUrl, names[i]);
        var res = await pullRemote(url, fetchImpl);
        if (!res.ok) continue;
        var kind = classifyRemote(res);
        if (kind.type !== "asset") continue;
        if (kindOfName(names[i]) && kindOfName(names[i]) !== kind.kind) continue;
        return fileRecord(res, kind.ext, names[i]);
    }
    return null;
}

async function fetchMissingPages(files, fetchImpl) {
    var atlas = findByKind(files, ["atlas"]);
    if (!atlas) return;
    var text = decodeUtf8(atlas.bytes);
    var pages = window.atlasPageNames ? window.atlasPageNames(text) : [];
    if (!pages || !pages.length) return;
    var have = {};
    files.forEach(function (file) { have[file.name.toLowerCase()] = 1; });
    var missing = [];
    for (var i = 0; i < pages.length; i++) {
        var pageLeaf = leafName(pages[i]).toLowerCase();
        if (pageLeaf && !have[pageLeaf]) missing.push(pages[i]);
    }
    if (!missing.length) return;
    if (!atlas.sourceUrl) throw remoteFail("incomplete", { url: atlas.name });
    for (var p = 0; p < missing.length; p++) {
        var pageUrl = resolveAtlasPageUrl(atlas.sourceUrl, missing[p]);
        var res = await pullRemote(pageUrl, fetchImpl);
        if (!res.ok) throw remoteFail("http", { url: pageUrl, status: res.status });
        var record = fileRecord(res, imageSuffix(res.buf, res.type, leafName(missing[p])), leafName(missing[p]));
        files.push(record);
        have[record.name.toLowerCase()] = 1;
    }
}

async function absorbListing(entries, baseUrl, files, fetchImpl) {
    var chosen = chooseBundleEntries(entries, baseUrl);
    var seen = {};
    for (var i = 0; i < chosen.length; i++) {
        var target = resolveEntryUrl(baseUrl, chosen[i]);
        if (seen[target.url]) continue;
        seen[target.url] = 1;
        var res = await pullRemote(target.url, fetchImpl);
        if (!res.ok) throw remoteFail("http", { url: target.url, status: res.status });
        var kind = classifyRemote(res);
        if (kind.type !== "asset") continue;
        files.push(fileRecord(res, kind.ext, target.name));
    }
}

async function absorbResponse(res, baseUrl, files, fetchImpl) {
    var kind = classifyRemote(res);
    if (kind.type === "zip") {
        var zipped = await unzipSpineFiles(res.buf);
        zipped.forEach(function (file) { files.push(file); });
        return;
    }
    if (kind.type === "manifest") {
        await absorbListing(kind.entries, baseUrl, files, fetchImpl);
        return;
    }
    if (kind.type === "index") {
        await absorbListing(kind.entries, res.url || baseUrl, files, fetchImpl);
        return;
    }
    if (kind.type === "asset") files.push(fileRecord(res, kind.ext));
}

function isCompleteSet(files) {
    return !!(findByKind(files, ["skel", "json"]) && findByKind(files, ["atlas"]) && findByKind(files, ["image"]));
}

async function ensureSpineSet(baseUrl, files, fetchImpl) {
    if (!findByKind(files, ["skel", "json"])) {
        var dataHit = await probeNamedFile(baseUrl, candidateNames(baseUrl, files, ["skel", "json"]), fetchImpl);
        if (dataHit) files.push(dataHit);
    }
    if (!findByKind(files, ["atlas"])) {
        var atlasHit = await probeNamedFile(baseUrl, candidateNames(baseUrl, files, ["atlas"]), fetchImpl);
        if (atlasHit) files.push(atlasHit);
    }
    await fetchMissingPages(files, fetchImpl);
}

async function collectSpineUrl(spineUrl, fetchImpl) {
    var safe = assertHttpUrl(spineUrl);
    var res = await pullRemote(safe, fetchImpl);
    var files = [];
    var softStatus = 0;
    if (res.ok) await absorbResponse(res, safe, files, fetchImpl);
    else if (res.status === 404 || res.status === 400 || res.status === 204 || res.status === 405) softStatus = res.status;
    else throw remoteFail("http", { url: safe, status: res.status });
    await ensureSpineSet(safe, files, fetchImpl);
    if (!isCompleteSet(files)) {
        if (softStatus) throw remoteFail("http", { url: safe, status: softStatus });
        throw remoteFail("incomplete", { url: safe });
    }
    return files;
}

async function collectPair(dataUrl, atlasUrl, kind, fetchImpl) {
    var dataSafe = assertHttpUrl(dataUrl);
    var atlasSafe = assertHttpUrl(atlasUrl);
    var dataRes = await pullRemote(dataSafe, fetchImpl);
    if (!dataRes.ok) throw remoteFail("http", { url: dataSafe, status: dataRes.status });
    var atlasRes = await pullRemote(atlasSafe, fetchImpl);
    if (!atlasRes.ok) throw remoteFail("http", { url: atlasSafe, status: atlasRes.status });
    var files = [
        fileRecord(dataRes, kind === "json" ? ".json" : ".skel"),
        fileRecord(atlasRes, ".atlas")
    ];
    await fetchMissingPages(files, fetchImpl);
    if (!isCompleteSet(files)) throw remoteFail("incomplete", { url: atlasSafe });
    return files;
}

async function collectRemoteSpineFiles(job, fetchImpl) {
    var fetchFn = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!fetchFn) throw remoteFail("network", { url: "", message: "fetch" });
    if (!job) throw remoteFail("incomplete", { url: "" });
    if (job.mode === "pair") return collectPair(job.data, job.atlas, job.kind, fetchFn);
    return collectSpineUrl(job.spine, fetchFn);
}

function toBrowserFile(entry) {
    var name = entry.name || "spine.bin";
    var bytes = entry.bytes || new Uint8Array();
    var file;
    if (typeof File === "function") file = new File([bytes], name);
    else {
        file = new Blob([bytes]);
        file.name = name;
    }
    if (entry.relativePath) {
        try {
            Object.defineProperty(file, "webkitRelativePath", { value: entry.relativePath, configurable: true });
        } catch (e) {
            try { file.webkitRelativePath = entry.relativePath; } catch (e2) {}
        }
    }
    return file;
}

function ensureRemoteWarning() {
    if (typeof document === "undefined" || !document || !document.body || !document.createElement || !document.getElementById) return null;
    var el = document.getElementById("remote-warning");
    if (el) return el;
    el = document.createElement("div");
    el.id = "remote-warning";
    el.className = "region-warning";
    el.hidden = true;
    el.setAttribute("role", "alert");
    var text = document.createElement("p");
    text.className = "region-warning-text";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "region-warning-close";
    btn.setAttribute("data-i18n", "remote.close");
    btn.textContent = window.t ? window.t("remote.close") : "关闭";
    btn.addEventListener("click", function () {
        remoteErrorDismissed = true;
        el.hidden = true;
    });
    el.appendChild(text);
    el.appendChild(btn);
    document.body.appendChild(el);
    return el;
}

function remoteDetail(state) {
    if (!state) return "";
    if (state.code === "network") return window.t ? window.t("remote.networkDetail") : "CORS";
    if (state.status) return "HTTP " + state.status;
    return state.message || "";
}

window.paintRemoteSpineError = function () {
    if (!remoteErrorState) {
        if (typeof document !== "undefined" && document.getElementById) {
            var existing = document.getElementById("remote-warning");
            if (existing) existing.hidden = true;
        }
        return;
    }
    var el = ensureRemoteWarning();
    if (!el) return;
    if (remoteErrorDismissed) {
        el.hidden = true;
        return;
    }
    el.hidden = false;
    var vars = {
        url: remoteErrorState.url || "",
        scheme: remoteErrorState.scheme || "",
        detail: remoteDetail(remoteErrorState)
    };
    var text = el.querySelector ? el.querySelector(".region-warning-text") : null;
    if (text) text.textContent = window.t ? window.t(remoteErrorState.key, vars) : remoteErrorState.key;
    var btn = el.querySelector ? el.querySelector(".region-warning-close") : null;
    if (btn && window.t) btn.textContent = window.t("remote.close");
};

function remoteErrorKey(err) {
    if (err && err.code === "bad-scheme") return "remote.badScheme";
    if (err && err.code === "bad-url") return "remote.badUrl";
    if (err && err.code === "incomplete") return "remote.incomplete";
    return "remote.fetchFail";
}

function showRemoteSpineError(err) {
    var error = err && err.code ? err : remoteFail("incomplete", {
        url: err && err.url || "",
        message: err && err.message ? err.message : ""
    });
    remoteErrorDismissed = false;
    remoteErrorState = {
        key: remoteErrorKey(error),
        code: error.code,
        url: error.url || "",
        scheme: error.scheme || "",
        status: error.status || 0,
        message: error.message || ""
    };
    window.paintRemoteSpineError();
    if (window.log && window.t) {
        var vars = {
            url: remoteErrorState.url,
            scheme: remoteErrorState.scheme,
            detail: remoteDetail(remoteErrorState)
        };
        window.log(window.t(remoteErrorState.key, vars), remoteErrorState.key, vars);
    }
}

function clearRemoteSpineError() {
    remoteErrorState = null;
    remoteErrorDismissed = false;
    if (window.paintRemoteSpineError) window.paintRemoteSpineError();
}

window.autoLoadSpineFromQuery = async function () {
    var search = window.location && window.location.search ? window.location.search : "";
    var job = remoteJobFromQuery(parseViewerQuery(search));
    if (!job) return false;
    clearRemoteSpineError();
    try {
        if (window.log && window.t) window.log(window.t("remote.loading"), "remote.loading");
        var files = await collectRemoteSpineFiles(job);
        if (typeof window.handleFiles !== "function") throw remoteFail("incomplete", { url: job.spine || job.atlas || job.data || "" });
        await window.handleFiles(files.map(toBrowserFile));
        return true;
    } catch (err) {
        showRemoteSpineError(err);
        return false;
    }
};

window.parseViewerQuery = parseViewerQuery;
window.resolveAtlasPageUrl = resolveAtlasPageUrl;
window.resolveRelatedSpineUrl = resolveRelatedSpineUrl;
window.collectRemoteSpineFiles = collectRemoteSpineFiles;
window.remoteJobFromQuery = remoteJobFromQuery;
