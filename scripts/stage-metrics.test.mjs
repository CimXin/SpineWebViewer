// node scripts/stage-metrics.test.mjs
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function loadScripts(document) {
    const sandbox = {
        window: null,
        document,
        console,
        innerWidth: 1200,
        innerHeight: 900,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const file of ["src/state/globals.js", "src/viewer/debug-renderer.js"]) {
        vm.runInContext(fs.readFileSync(root + file, "utf8"), sandbox, { filename: file });
    }
    return sandbox;
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function nearly(a, b, eps = 1e-6) {
    assert(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);
}

function cssPoint(stageMetrics, worldX, worldY, camX, camY, zoom, backingW, backingH, cssW, cssH) {
    const p = stageMetrics.project(worldX, worldY, camX, camY, zoom, backingW, backingH);
    return { x: p.x * (cssW / backingW), y: p.y * (cssH / backingH) };
}

function make2d() {
    const stack = [];
    let m = [1, 0, 0, 1, 0, 0];
    const texts = [];
    function multiply(a, b, c, d, e, f) {
        const na = m[0] * a + m[2] * b;
        const nb = m[1] * a + m[3] * b;
        const nc = m[0] * c + m[2] * d;
        const nd = m[1] * c + m[3] * d;
        const ne = m[0] * e + m[2] * f + m[4];
        const nf = m[1] * e + m[3] * f + m[5];
        m = [na, nb, nc, nd, ne, nf];
    }
    return {
        texts,
        save() { stack.push(m.slice()); },
        restore() { m = stack.pop() || [1, 0, 0, 1, 0, 0]; },
        translate(x, y) { multiply(1, 0, 0, 1, x, y); },
        scale(x, y) { multiply(x, 0, 0, y, 0, 0); },
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        stroke() {},
        fill() {},
        arc(x, y) {
            texts.push({
                kind: "arc",
                x: m[0] * x + m[2] * y + m[4],
                y: m[1] * x + m[3] * y + m[5],
            });
        },
        strokeText() {},
        fillText(text, x, y) { texts.push({ kind: "text", text, x, y }); },
        set lineWidth(_v) {},
        set strokeStyle(_v) {},
        set fillStyle(_v) {},
        set font(_v) {},
        set lineJoin(_v) {},
    };
}

function makeCanvas(width, height) {
    const ctx = make2d();
    return {
        width,
        height,
        _ctx: ctx,
        getContext() { return ctx; },
    };
}

const wrapper = {
    width: 0,
    height: 0,
    cssWidth: 800.4,
    cssHeight: 600.6,
    getBoundingClientRect() {
        return { width: this.cssWidth, height: this.cssHeight, left: 0, top: 0 };
    },
};

const gl = makeCanvas(300, 150);
const debug = makeCanvas(1200, 900);
gl.getBoundingClientRect = () => ({ width: wrapper.cssWidth, height: wrapper.cssHeight, left: 0, top: 0 });

const document = {
    getElementById(id) {
        if (id === "canvas-wrapper") return wrapper;
        if (id === "canvas") return gl;
        if (id === "debug-canvas") return debug;
        return null;
    },
    addEventListener() {},
};

const sandbox = loadScripts(document);
const { stageMetrics, syncStageCanvas, stageDragDelta, stagePointerScale, debugRenderer, viewerConfig } = sandbox;

// Page zoom leaves a stale debug buffer. Both canvases must adopt the layout box.
syncStageCanvas(gl);
syncStageCanvas(debug);
assert(gl.width === 800 && gl.height === 601, `webgl backing ${gl.width}x${gl.height}`);
assert(debug.width === gl.width && debug.height === gl.height, "debug backing diverged from webgl");

viewerConfig.isExporting = true;
gl.width = 64;
gl.height = 32;
syncStageCanvas(gl);
assert(gl.width === 64 && gl.height === 32, "export must keep the encoder canvas size");
viewerConfig.isExporting = false;
syncStageCanvas(gl);

// Stale overlay vs synced overlay, same CSS box. Only the stale one drifts as the root leaves the camera.
const world = { x: 180, y: 90 };
const cam = { x: 20, y: -15 };
const zoom = 1.25;
const cssW = wrapper.cssWidth;
const cssH = wrapper.cssHeight;
const mesh = cssPoint(stageMetrics, world.x, world.y, cam.x, cam.y, zoom, gl.width, gl.height, cssW, cssH);
const synced = cssPoint(stageMetrics, world.x, world.y, cam.x, cam.y, zoom, debug.width, debug.height, cssW, cssH);
const stale = cssPoint(stageMetrics, world.x, world.y, cam.x, cam.y, zoom, 1200, 900, cssW, cssH);
nearly(mesh.x, synced.x);
nearly(mesh.y, synced.y);
assert(Math.abs(mesh.x - stale.x) > 20, "stale debug buffer should visibly drift");

// A fresh 300×150 webgl canvas must not yank the overlay off the stage.
debug.width = 800;
debug.height = 601;
gl.width = 300;
gl.height = 150;
viewerConfig.debugCanvas = debug;
viewerConfig.debugCtx = debug._ctx;
viewerConfig.showOrigin = true;
viewerConfig.showBones = false;
debugRenderer.drawBones(null, 0, 0, 1, 0);
assert(debug.width === 800 && debug.height === 601, "default canvas size leaked into the overlay");

// Once the runtime has sized the webgl canvas, the origin dot uses that buffer.
gl.width = 800;
gl.height = 601;
const skeleton = { x: world.x, y: world.y, bones: [{}], slots: [] };
debugRenderer.drawBones(skeleton, cam.x, cam.y, zoom, gl.height);
assert(debug.width === 800 && debug.height === 601, "overlay did not copy the webgl buffer");
const expected = stageMetrics.project(world.x, world.y, cam.x, cam.y, zoom, debug.width, debug.height);
const arc = debug._ctx.texts.filter((t) => t.kind === "arc").pop();
nearly(arc.x, expected.x, 1e-4);
nearly(arc.y, expected.y, 1e-4);
const label = debug._ctx.texts.filter((t) => t.kind === "text" && t.text === "X").pop();
nearly(label.x - 48, expected.x, 1e-4);
nearly(label.y - 4, expected.y, 1e-4);

// 4.0/4.1 OrthoCamera.zoom is a frustum scale. Overlay magnification is its inverse.
const orthoZoom = 2;
const mag = stageMetrics.overlayZoom(orthoZoom, "ortho");
nearly(mag, 0.5);
const orthoScreen = stageMetrics.project(100, 0, 0, 0, mag, 800, 600);
nearly(orthoScreen.x, 400 + 100 / orthoZoom);

// Mouse deltas: clientX is CSS pixels, the camera is in backing-store pixels.
const scale = stagePointerScale(gl);
nearly(scale.x, gl.width / cssW);
const dxCss = 36;
const dyCss = -18;
const drag = stageDragDelta(gl, { clientX: dxCss, clientY: dyCss }, 0, 0);
nearly(drag.x, dxCss * scale.x);
nearly(drag.y, dyCss * scale.y);

function displayed(dxBacking, zoomValue, backingW, cssWidth) {
    return dxBacking * (cssWidth / backingW);
}

// 3.6–3.8 / 4.2 magnification pan moves the camera by dx / zoom.
// On screen that is one backing pixel per scaled mouse pixel, then CSS stretch.
const magnifyZoom = 1.6;
const panCss = displayed(drag.x, magnifyZoom, gl.width, cssW);
nearly(panCss, dxCss);

// 4.2 also shifts skeleton.x by the same amount, so the root moves twice as far
// as the cursor. Page zoom must not change that ratio.
const bothCss = displayed(drag.x * 2, magnifyZoom, gl.width, cssW);
nearly(bothCss, dxCss * 2);

// 4.0/4.1: world delta = dx * orthoZoom, screen backing delta = world / orthoZoom.
const orthoCss = displayed(drag.x, orthoZoom, gl.width, cssW);
nearly(orthoCss, dxCss);

// At 100% the ratio is 1, so deltas stay raw clientX deltas.
gl.width = 1000;
gl.height = 800;
wrapper.cssWidth = 1000;
wrapper.cssHeight = 800;
const identity = stageDragDelta(gl, { clientX: 12, clientY: 7 }, 2, 4);
nearly(identity.x, 10);
nearly(identity.y, 3);

console.log("stage-metrics tests passed");
