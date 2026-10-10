# Spine Web Viewer

## Documentation

- English: this file (README.en.md)
- 中文：[README.md](./README.md)

A static web viewer for previewing Spine animations locally. The interface is a black-and-white TypeSafe-style layout. Playback is adapted from Spine Player 3.0: open a folder, a skeleton list (search / favorites), play and scrub the timeline, step forward / back one frame, pan and zoom the camera, mix skins, extra tracks, bone debug draw, events, frame-sequence effect bindings, a reference background, color controls, and PNG sequence / GIF / WebM export. A switch at the bottom-left of the page toggles Chinese and English. Chinese is the default.

The runtimes are not the old `spine-webgl-*.js` files dropped in from a previous archive. Each version is fetched from Esoteric Software’s official releases. The version adapters (`public/runtime/logic/`) still use the reference player’s load and render code for each WebGL API.

## Online preview

<https://cimxin.github.io/SpineWebViewer/>

After a push to `main`, GitHub Actions (`.github/workflows/pages.yml`) runs `npm ci` and `npm run build`, then deploys `dist/` to GitHub Pages. That build sets the Vite `base` to `/SpineWebViewer/`, so scripts, styles, and the Spine runtimes load from that subpath. A local `npm run build` and the release zip do not set `PAGES_BASE`. They keep the relative base `./`, so the unpacked folder can be opened with the start script from any directory.

If the deployment succeeds but the site does not open, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

## Download and run

Release archive: <https://github.com/CimXin/SpineWebViewer/releases/download/v1.0.14/SpineWebViewer-v1.0.14.zip>

The current GitHub Release archive is v1.0.14. This document describes the viewer in the repository source (TypeSafe UI, Chinese/English switch, frame-step buttons, and the origin-axes icon). The v1.0.14 zip is the files from that release. The public site updates when Pages deploys `main`. Editing the docs alone does not replace that archive.

1. Download `SpineWebViewer-v1.0.14.zip` and unpack it.
2. Do not open `index.html` by double-clicking it. Chrome and similar browsers block module scripts on `file://`, and the export flow can pick a save folder only on localhost.
3. Open the page with the start script in the unpacked folder (it serves the page locally and opens a browser):
   - Windows: double-click `Start-Windows.bat`. It uses Python when Python is installed, otherwise the built-in PowerShell. Node is not required.
   - macOS: double-click `Start-Mac.command` (if the system blocks it, right-click the file and choose Open).
   - Linux: from the unpacked folder, run `bash Start-Linux.sh`.
4. In the page, click **Open animation folder** and select the folder that contains the `.json` or `.skel`, the `.atlas`, and the textures. Opening another folder appends to the list on the left. **Clear list** removes those entries. After something is loaded, **Add files** on the left can append one more set. See “Load a local animation” below.

Close the start-script window to stop the server. `OPEN.txt` in the archive is the same note.

Build that zip from source:

```bash
npm install
npm run package
```

`npm run build` writes a relative-path `dist/` (Spine runtimes and the start scripts). `npm run package` packs it as `release/SpineWebViewer-v1.0.14.zip`.

## Environment

Developing from source needs Node.js 18 or newer. The release archive above does not need Node.

Use Chrome or Edge. Folder picking and the export directory use the browser file APIs, so the page must be opened through the start script, `npm run dev`, or another local static server.

## Install and run

```bash
npm install
npm run dev
```

Open the address printed in the terminal (by default `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

`dist/` is a deployable static site. Assets use relative paths, and the folder includes `Start-Windows.bat`, `Start-Mac.command`, and `Start-Linux.sh`. Host it with any static server, for example:

```bash
npx vite preview
# or
npx serve dist
```

The only dependency in `package.json` is Vite, used for development. There is no UI framework and no extra runtime npm package. GIF encoding uses [gif.js 0.2.0](https://github.com/jnordberg/gif.js), shipped with the reference player (`public/vendor/gif/`).

## Load a local animation

1. **Open animation folder** (or drop a folder on the page) scans every skeleton in that directory and appends them to the list on the left. The start page has only that button.
2. After a load, **Add files** on the left appends another set. In one file picker, select the skeleton data (`.json` / `.json.txt` or `.skel` / `.skel.bytes`) together with that set’s `.atlas` (or `.atlas.txt`) and textures. The browser does not hand the page files you left unselected, so a skeleton file alone cannot be matched to an atlas and textures. If that selection contains one skeleton, the selected atlas and textures are used even when the names do not match exactly. If it contains several skeletons, atlases and textures are matched by file name.
3. Each set needs at least:
   - Skeleton data: `.json` / `.json.txt`, or `.skel` / `.skel.bytes`
   - Atlas: `.atlas` or `.atlas.txt`
   - Textures: `.png` / `.jpg` / `.webp`
4. Adding more files does not clear skeletons already in the list. An entry with the same path, file name, size, and modification time is skipped. **Clear list** on the left removes everything.
5. The list can be searched, and the star marks a favorite. Click an item to preview it.
6. The version is read from the JSON `skeleton.spine` field or from the binary header. The control at the bottom-right can also force 3.6, 3.7, 3.8, 4.0, 4.1, or 4.2.

Playback: the bottom buttons or the space bar pause and resume. Drag the timeline, and change speed or frame rate. **Step back** and **Step forward** sit on either side of the play button and move exactly one frame at the current frame rate. If playback is running, a step pauses first, moves one frame, and stays there. Press play again to continue from that frame. Hold the left mouse button to pan, use the wheel to zoom, and **Reset view** restores the camera. The skeleton origin axes (red X, green Y) are drawn by default. A round axes button at the top of the stage, flush with the right edge of the file list, shows or hides them. It starts on. Premultiply alpha (PMA) is off by default; turn it on in the animation panel on the right when needed. **Hierarchy** on the right lists the current skeleton’s bones as a parent/child tree. Click a bone to mark it in yellow on the stage, and click it again to clear the mark. Switching skeletons in the left list rebuilds the tree.

Language: **中文 | EN** is at the bottom-left of the page. The first visit is Chinese. The choice is stored in `localStorage` under `spine-viewer-lang` and kept across reloads. The browser tab title is 「Spine查看器」 in Chinese and “Spine Viewer” in English.

Exporting a PNG sequence or a GIF asks the browser for a save folder (File System Access API). Keep this tab in the foreground while the export runs.

## Supported Spine versions

| Version | Source | Pinned release |
| --- | --- | --- |
| 3.6 | `spine-ts/build/spine-webgl.js` from a [spine-runtimes](https://github.com/EsotericSoftware/spine-runtimes) tag | `3.6.53` |
| 3.7 | same | `3.7.94` |
| 3.8 | same | `3.8.95` |
| 4.0 | `dist/iife/spine-webgl.js` from the npm package `@esotericsoftware/spine-webgl` | `4.0.31` |
| 4.1 | same | `4.1.55` |
| 4.2 | same | `4.2.119` |

Those files live in `public/vendor/spine/<version>/` next to a `LICENSE`. The manifest is `public/vendor/spine/versions.json`. On load, the official `spine-webgl.js` for that version is injected first (global `spine`), then `public/runtime/logic/logic_<version>.js`.

The official web runtimes for 3.6 and 3.7 do not include a full binary parser. Export JSON for those versions. From 3.8 upward, both JSON and binary work.

## Update the runtimes

Edit the tag or npm version in `scripts/fetch-runtimes.mjs` (a patch on the same major line, for example replacing `4.2.119` with a newer `4.2.x`), then:

```bash
npm run fetch-runtimes
```

The script downloads the IIFE / prebuilt files and the licenses again, and rewrites `versions.json`. Export formats stay compatible within one major version. If Esoteric renames WebGL classes, update the `spine.*` calls in `public/runtime/logic/logic_*.js` to match.

Official repository: <https://github.com/EsotericSoftware/spine-runtimes>  
Browser package notes for 4.x: <https://github.com/EsotericSoftware/spine-runtimes/blob/4.2/spine-ts/README.md>

## Directory

```
index.html                 page entry
src/main.js                Vite entry; loads modules in order
src/i18n/i18n.js           Chinese and English strings, language switch
src/styles/app.css         UI styles
src/state/globals.js       shared config, colors, and the log
src/files/file-handler.js  folder scan, drag-and-drop, favorites
src/loader/spine-loader.js version detection and official runtime loading
src/viewer/                playback, camera, background, bone debug, extra tracks
src/effects/               events and frame-sequence effects
src/export/                PNG / GIF / WebM export
src/config/                saved local settings
src/boot.js                UI setup at startup
public/vendor/spine/       official spine-webgl runtimes
public/runtime/logic/      per-version load and render adapters
public/vendor/gif/         gif.js and its worker
```

## License

The viewer code is adapted from the reference player. Spine runtimes use the [Spine Runtimes License](http://esotericsoftware.com/spine-runtimes-license). Each version directory includes a `LICENSE`. Using those runtimes means following Esoteric Software’s terms (typically a valid Spine editor license). gif.js is published under the MIT license in its own repository.
