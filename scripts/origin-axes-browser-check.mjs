// Headless check: after a layout-size change (what browser page zoom does to CSS pixels),
// the origin dot is painted in the same backing-store pixel as the WebGL projection.
import { spawn } from "node:child_process";

const appUrl = process.env.APP_URL || "http://127.0.0.1:5173/";
const chromeBin = process.env.CHROME_BIN || "google-chrome";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, label) {
    let last;
    for (let i = 0; i < 50; i++) {
        try {
            return await fn();
        } catch (err) {
            last = err;
            await sleep(200);
        }
    }
    throw new Error(`${label}: ${last && last.message ? last.message : last}`);
}

class Cdp {
    constructor(ws) {
        this.ws = ws;
        this.next = 1;
        this.pending = new Map();
        this.ws.addEventListener("message", (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        });
    }
    send(method, params = {}) {
        const id = this.next++;
        const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
        this.ws.send(JSON.stringify({ id, method, params }));
        return result;
    }
}

const chrome = spawn(chromeBin, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=9222",
    "--remote-allow-origins=*",
    "--user-data-dir=/tmp/chrome-origin-axes",
    "about:blank",
], { stdio: "ignore" });

let failed = false;
try {
    const version = await waitFor(async () => {
        const res = await fetch("http://127.0.0.1:9222/json/version");
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
    }, "chrome devtools");
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve);
        ws.addEventListener("error", () => reject(new Error("devtools websocket failed")));
    });
    const cdp = new Cdp(ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const sessionId = attached.sessionId;
    const send = (method, params) => cdp.send(method, { ...params, sessionId });
    // flatten: true delivers session commands on the same socket without sessionId wrapping
    // when using flatten, the sessionId must be on the message root, not in params.
    async function call(method, params = {}) {
        const id = cdp.next++;
        const result = new Promise((resolve, reject) => cdp.pending.set(id, { resolve, reject }));
        cdp.ws.send(JSON.stringify({ id, method, params, sessionId }));
        return result;
    }
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Page.navigate", { url: appUrl });
    await waitFor(async () => {
        const evaled = await call("Runtime.evaluate", {
            expression: "!!(window.debugRenderer && window.stageMetrics && document.getElementById('debug-canvas'))",
            returnByValue: true,
        });
        if (!evaled.result || !evaled.result.value) throw new Error("viewer not ready");
        return true;
    }, "viewer boot");

    const expression = `(() => {
        const wrapper = document.getElementById('canvas-wrapper');
        const gl = document.getElementById('canvas');
        const dbg = document.getElementById('debug-canvas');
        wrapper.style.width = '800.4px';
        wrapper.style.height = '600.6px';
        // Stale buffer from before the page zoom, while WebGL has already been resized.
        dbg.width = 1200;
        dbg.height = 900;
        window.syncStageCanvas(gl);
        window.viewerConfig.showOrigin = true;
        window.viewerConfig.showBones = false;
        window.viewerConfig.highlightBone = null;
        window.viewerConfig.isExporting = false;
        const skeleton = { x: 180, y: 90, bones: [{}], slots: [] };
        const camX = 20, camY = -15, zoom = 1.25;
        window.debugRenderer.drawBones(skeleton, camX, camY, zoom, gl.height);
        const p = window.stageMetrics.project(skeleton.x, skeleton.y, camX, camY, zoom, gl.width, gl.height);
        const ctx = dbg.getContext('2d');
        const sample = (x, y) => {
            const ix = Math.round(x);
            const iy = Math.round(y);
            if (ix < 0 || iy < 0 || ix >= dbg.width || iy >= dbg.height) return null;
            return Array.from(ctx.getImageData(ix, iy, 1, 1).data);
        };
        const rect = gl.getBoundingClientRect();
        const drag = window.stageDragDelta(gl, { clientX: rect.left + 40, clientY: rect.top + 10 }, rect.left, rect.top);
        const cssDx = drag.x * (rect.width / gl.width);
        return {
            gl: [gl.width, gl.height],
            debug: [dbg.width, dbg.height],
            rect: [rect.width, rect.height],
            projected: [p.x, p.y],
            center: sample(p.x, p.y),
            nearby: sample(p.x - 1, p.y),
            staleWouldBe: [1200 / 2 + (180 - 20) * 1.25, 900 / 2 - (90 - -15) * 1.25],
            cssDx,
            dragX: drag.x
        };
    })()`;

    const evaled = await call("Runtime.evaluate", { expression, returnByValue: true });
    if (evaled.exceptionDetails) {
        throw new Error(JSON.stringify(evaled.exceptionDetails));
    }
    const value = evaled.result.value;
    const white = (px) => px && px[0] > 200 && px[1] > 200 && px[2] > 200 && px[3] > 200;
    if (value.gl[0] !== value.debug[0] || value.gl[1] !== value.debug[1]) {
        throw new Error(`backing stores diverged ${JSON.stringify(value)}`);
    }
    if (Math.abs(value.gl[0] - value.rect[0]) > 1 || Math.abs(value.gl[1] - value.rect[1]) > 1) {
        throw new Error(`backing store left the CSS box ${JSON.stringify(value)}`);
    }
    if (!white(value.center) && !white(value.nearby)) {
        throw new Error(`origin dot missing at projected pixel ${JSON.stringify(value)}`);
    }
    if (Math.abs(value.cssDx - 40) > 0.6) {
        throw new Error(`mouse delta did not survive page-scale sizing ${JSON.stringify(value)}`);
    }
    console.log(JSON.stringify(value, null, 2));

    const zoomed = await call("Runtime.evaluate", {
        expression: `(() => {
            document.documentElement.style.zoom = "1.5";
            const gl = document.getElementById("canvas");
            const dbg = document.getElementById("debug-canvas");
            dbg.width = 1200;
            dbg.height = 900;
            window.syncStageCanvas(gl);
            const skeleton = { x: 40, y: -25, bones: [{}], slots: [] };
            window.debugRenderer.drawBones(skeleton, 0, 0, 2, gl.height);
            const p = window.stageMetrics.project(40, -25, 0, 0, 2, gl.width, gl.height);
            const ctx = dbg.getContext("2d");
            const ix = Math.round(p.x), iy = Math.round(p.y);
            const pix = (ix >= 0 && iy >= 0 && ix < dbg.width && iy < dbg.height)
                ? Array.from(ctx.getImageData(ix, iy, 1, 1).data) : null;
            const rect = gl.getBoundingClientRect();
            const drag = window.stageDragDelta(gl, { clientX: rect.left + 25, clientY: rect.top }, rect.left, rect.top);
            return {
                gl: [gl.width, gl.height],
                debug: [dbg.width, dbg.height],
                rect: [rect.width, rect.height],
                dpr: window.devicePixelRatio,
                pix,
                cssDx: drag.x * (rect.width / gl.width)
            };
        })()`,
        returnByValue: true,
    });
    if (zoomed.exceptionDetails) throw new Error(JSON.stringify(zoomed.exceptionDetails));
    const z = zoomed.result.value;
    const zoomWhite = z.pix && z.pix[0] > 200 && z.pix[1] > 200 && z.pix[2] > 200;
    if (z.gl[0] !== z.debug[0] || z.gl[1] !== z.debug[1] || !zoomWhite || Math.abs(z.cssDx - 25) > 0.75) {
        throw new Error(`css page zoom case failed ${JSON.stringify(z)}`);
    }
    console.log(JSON.stringify(z, null, 2));
    console.log("origin axes browser check passed");
    ws.close();
} catch (err) {
    failed = true;
    console.error(err);
} finally {
    chrome.kill("SIGKILL");
}
process.exit(failed ? 1 : 0);
