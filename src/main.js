import "./styles/app.css";

import i18nUrl from "./i18n/i18n.js?url";
import globalsUrl from "./state/globals.js?url";
import uiUtilsUrl from "./ui/ui-utils.js?url";
import debugUrl from "./viewer/debug-renderer.js?url";
import boneTreeUrl from "./viewer/bone-tree.js?url";
import animControlUrl from "./viewer/anim-control.js?url";
import viewUrl from "./viewer/view-manager.js?url";
import configUrl from "./config/config-manager.js?url";
import filesUrl from "./files/file-handler.js?url";
import loaderUrl from "./loader/spine-loader.js?url";
import tracksUrl from "./viewer/animation-manager.js?url";
import effectsUrl from "./effects/effect-system.js?url";
import eventsUrl from "./effects/event-system.js?url";
import webmUrl from "./export/webm-muxer.js?url";
import exportUrl from "./export/export-manager.js?url";
import bootUrl from "./boot.js?url";

window.__ASSET_BASE__ = import.meta.env.BASE_URL;

function loadClassic(src) {
    return new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.async = false;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(window.t ? window.t("status.script", { msg: src }) : src));
        document.body.appendChild(el);
    });
}

const scripts = [
    i18nUrl,
    globalsUrl,
    uiUtilsUrl,
    debugUrl,
    boneTreeUrl,
    animControlUrl,
    viewUrl,
    configUrl,
    filesUrl,
    loaderUrl,
    tracksUrl,
    effectsUrl,
    eventsUrl,
    webmUrl,
    exportUrl,
    bootUrl,
];

async function start() {
    for (const src of scripts) {
        await loadClassic(src);
    }
}

start().catch((err) => {
    console.error(err);
    const log = document.getElementById("log");
    if (log) log.textContent = err.message || String(err);
});
