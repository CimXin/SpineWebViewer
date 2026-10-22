// 多页 atlas：按页文件名绑定贴图。3.x 的 TextureAtlas 在解析时同步调用 textureLoader，
// 并用该贴图的像素尺寸重算 UV；4.x 忽略回调，要在解析后对每一页 setTexture。

function atlasPageNames(atlasText) {
    var lines = String(atlasText || "").split(/\r\n|\r|\n/);
    var pages = [];
    var pageKeys = { size: 1, format: 1, filter: 1, repeat: 1, pma: 1 };
    for (var i = 0; i < lines.length; i++) {
        var raw = lines[i];
        if (!raw || !raw.trim()) continue;
        if (raw.charAt(0) === " " || raw.charAt(0) === "\t") continue;
        var line = raw.trim();
        if (line.indexOf(":") !== -1) continue;
        var j = i + 1;
        while (j < lines.length && !String(lines[j]).trim()) j++;
        if (j >= lines.length) continue;
        var next = String(lines[j]).trim();
        var colon = next.indexOf(":");
        if (colon === -1) continue;
        var key = next.slice(0, colon).trim().toLowerCase();
        if (pageKeys[key]) pages.push(line);
    }
    return pages;
}

function fileLeaf(name) {
    return String(name || "").trim().replace(/\\/g, "/").split("/").pop().toLowerCase();
}

function isAtlasImageName(name) {
    var n = fileLeaf(name);
    return n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp");
}

function imageFilesIn(files) {
    var out = [];
    var list = files || [];
    for (var i = 0; i < list.length; i++) {
        var file = list[i];
        if (file && file.name && isAtlasImageName(file.name)) out.push(file);
    }
    return out;
}

function matchAtlasPageFile(pageName, imageFiles) {
    var leaf = fileLeaf(pageName);
    if (!leaf) return null;
    var images = imageFiles || [];
    var i;
    for (i = 0; i < images.length; i++) {
        if (fileLeaf(images[i].name) === leaf) return images[i];
    }
    var want = String(pageName || "").trim().replace(/\\/g, "/").toLowerCase();
    for (i = 0; i < images.length; i++) {
        var rel = String(images[i].webkitRelativePath || "").replace(/\\/g, "/").toLowerCase();
        if (rel && (rel === want || rel.endsWith("/" + leaf))) return images[i];
    }
    return null;
}

function pairAtlasPages(atlasText, files) {
    var images = imageFilesIn(files);
    var names = atlasPageNames(atlasText);
    var pairs = [];
    var i;
    for (i = 0; i < names.length; i++) {
        var file = matchAtlasPageFile(names[i], images);
        if (!file && names.length === 1 && images.length) file = images[images.length - 1];
        pairs.push({ name: names[i], file: file || null });
    }
    if (!pairs.length && images.length) {
        var only = images[images.length - 1];
        pairs.push({ name: only.name, file: only });
    }
    return pairs;
}

function textureForAtlasPath(pages, textures, pagePath) {
    var want = fileLeaf(pagePath);
    var list = pages || [];
    for (var i = 0; i < list.length; i++) {
        if (fileLeaf(list[i].name) === want) return textures[i];
    }
    return null;
}

function bindAtlasPageTextures(atlas, pages, textures) {
    if (!atlas || !atlas.pages) return;
    for (var i = 0; i < atlas.pages.length; i++) {
        var page = atlas.pages[i];
        var texture = textureForAtlasPath(pages, textures, page.name);
        if (!texture) {
            var missing = new Error(page.name || "page");
            missing.missingPages = [page.name || "page"];
            throw missing;
        }
        if (typeof page.setTexture === "function") page.setTexture(texture);
        else if (!page.texture) page.texture = texture;
        var image = pages[i] && pages[i].image;
        if (image && (!page.width || !page.height)) {
            page.width = image.width || image.naturalWidth || page.width;
            page.height = image.height || image.naturalHeight || page.height;
        }
    }
}

function makeSpineAtlas(spineNs, atlasText, pages, textures) {
    var atlas = new spineNs.TextureAtlas(atlasText, function (path) {
        var texture = textureForAtlasPath(pages, textures, path);
        if (!texture) {
            var missing = new Error(path);
            missing.missingPages = [String(path || "")];
            throw missing;
        }
        return texture;
    });
    bindAtlasPageTextures(atlas, pages, textures);
    return atlas;
}

function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            var err = new Error(file && file.name ? file.name : "image");
            err.textureFailed = true;
            reject(err);
        };
        img.src = url;
    });
}

async function loadAtlasPageImages(files, atlasText) {
    var pairs = pairAtlasPages(atlasText, files);
    var missing = [];
    var i;
    for (i = 0; i < pairs.length; i++) {
        if (!pairs[i].file) missing.push(pairs[i].name);
    }
    if (!pairs.length) {
        var empty = new Error("image");
        empty.textureFailed = true;
        throw empty;
    }
    if (missing.length) {
        var err = new Error(missing.join(", "));
        err.missingPages = missing;
        throw err;
    }
    var pages = [];
    for (i = 0; i < pairs.length; i++) {
        var image = await loadImageElement(pairs[i].file);
        pages.push({ name: pairs[i].name, file: pairs[i].file, image: image });
    }
    return pages;
}

function buildSpineAtlas(spineNs, gl, atlasText, pages, TextureCtor) {
    var textures = [];
    for (var i = 0; i < pages.length; i++) {
        textures.push(new TextureCtor(gl, pages[i].image));
    }
    return {
        pages: pages,
        textures: textures,
        atlas: makeSpineAtlas(spineNs, atlasText, pages, textures)
    };
}

function reportAtlasImageError(err) {
    var missing = err && err.missingPages;
    if (missing && missing.length && window.t) {
        var pages = missing.join(", ");
        var msg = window.t("status.missingPages", { pages: pages });
        if (window.log) window.log(msg, "status.missingPages", { pages: pages });
        if (window.alert) window.alert(msg);
        return true;
    }
    if (err && err.textureFailed && window.t) {
        var fail = window.t("status.textureFail");
        if (window.log) window.log(fail, "status.textureFail");
        if (window.alert) window.alert(fail);
        return true;
    }
    return false;
}

async function readAtlasPagesOrReport(files, atlasText, loadId) {
    try {
        if (window.log && window.t) window.log(window.t("status.decoding"), "status.decoding");
        var pages = await loadAtlasPageImages(files, atlasText);
        if (loadId != null && window.viewerConfig && window.viewerConfig.currentLoadId !== loadId) return null;
        return pages;
    } catch (err) {
        if (loadId != null && window.viewerConfig && window.viewerConfig.currentLoadId !== loadId) return null;
        if (reportAtlasImageError(err)) return null;
        throw err;
    }
}

window.atlasPageNames = atlasPageNames;
window.pairAtlasPages = pairAtlasPages;
window.fileLeaf = fileLeaf;
window.textureForAtlasPath = textureForAtlasPath;
window.makeSpineAtlas = makeSpineAtlas;
window.loadAtlasPageImages = loadAtlasPageImages;
window.buildSpineAtlas = buildSpineAtlas;
window.reportAtlasImageError = reportAtlasImageError;
window.readAtlasPagesOrReport = readAtlasPagesOrReport;
