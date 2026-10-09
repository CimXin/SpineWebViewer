# Spine Web Viewer

本地预览 Spine 动画的静态网页查看器。界面和播放逻辑改编自 Spine 播放器 3.0：打开文件夹、骨架列表（搜索 / 收藏）、播放与拖动时间轴、镜头平移缩放、皮肤混搭、多轨道、骨骼调试、事件、序列帧特效绑定、背景参考图、调色，以及 PNG 序列帧 / GIF / WebM 导出。

运行时不是把旧压缩包里的 `spine-webgl-*.js` 原样塞进仓库，而是按版本从 Esoteric Software 的官方发布拉取。版本适配器（`public/runtime/logic/`）仍沿用参考播放器里针对各版本 WebGL API 的加载与渲染代码。

## 下载后直接使用

发布包：<https://github.com/CimXin/SpineWebViewer/releases/download/v1.0.7/SpineWebViewer-v1.0.7.zip>

1. 下载 `SpineWebViewer-v1.0.7.zip` 并解压。
2. 不要直接双击 `index.html`。Chrome 等浏览器会拦截 `file://` 下的模块脚本，导出功能也只允许在 localhost 里选择保存目录。
3. 用解压目录里的启动脚本打开（脚本会在本机起一个页面并自动打开浏览器）：
   - Windows：双击 `Start-Windows.bat`。有 Python 就用 Python；没有则用系统自带的 PowerShell，不用再安装 Node。
   - macOS：双击 `Start-Mac.command`（若被拦截，右键该文件再选“打开”）。
   - Linux：在解压目录执行 `bash Start-Linux.sh`。
4. 在页面里点 **打开动画文件夹**，选中包含 `.json` 或 `.skel`、`.atlas` 和贴图的整个文件夹。再次打开会追加到左侧列表；点 **清空列表** 才会清掉。加载之后，左侧的 **添加单个** 可以再追加一套，用法见下面「加载本地动画」。

关掉启动脚本那个窗口即停止服务。压缩包里的 `OPEN.txt` 是同样的说明。

自己从源码打这个压缩包：

```bash
npm install
npm run package
```

`npm run build` 会生成相对路径的 `dist/`（含 Spine 运行时和启动脚本）。`npm run package` 再把它打成 `release/SpineWebViewer-v1.0.7.zip`。

## 环境

从源码开发时需要 Node.js 18 或更高。只使用上面的发布压缩包时不需要安装 Node。

请用 Chrome 或 Edge。文件夹选择和导出目录使用浏览器文件 API，必须通过启动脚本、`npm run dev` 或其它本地静态服务打开。

## 安装与运行

```bash
npm install
npm run dev
```

浏览器打开终端里给出的地址（默认 `http://localhost:5173`）。

生产构建：

```bash
npm run build
npm run preview
```

`dist/` 是可部署的静态站点，资源使用相对路径，并带有 `Start-Windows.bat`、`Start-Mac.command`、`Start-Linux.sh`。用任意静态服务器托管即可，例如：

```bash
npx vite preview
# 或
npx serve dist
```

`package.json` 里唯一的依赖是开发用的 Vite，没有 UI 框架，也没有额外的运行时 npm 包。GIF 编码使用随参考播放器附带的 [gif.js 0.2.0](https://github.com/jnordberg/gif.js)（`public/vendor/gif/`）。

## 加载本地动画

1. **打开动画文件夹**（或把文件夹拖进页面）会扫描目录里的全部骨架，并追加到左侧列表。开始页只有这一个按钮。
2. 加载之后，左侧的 **添加单个** 用来再追加一套。在同一次文件选择里选中骨架数据（`.json` / `.json.txt` 或 `.skel` / `.skel.bytes`），以及这一套的 `.atlas`（或 `.atlas.txt`）和贴图。浏览器不会把没选中的同目录文件交给页面，所以只点一个骨架文件时配不上图集和贴图。这一次如果只有一套骨架，会用上这次选中的那一张图集和这些贴图，文件名不完全一致也可以；一次选了多套时，按文件名把图集和贴图配给对应的骨架。
3. 每一套至少要有：
   - 骨架数据：`.json` / `.json.txt`，或 `.skel` / `.skel.bytes`
   - 图集：`.atlas` 或 `.atlas.txt`
   - 贴图：`.png` / `.jpg` / `.webp`
4. 再次添加不会清掉已经在列表里的骨架。路径、文件名、大小和修改时间都相同的条目会跳过。左侧 **清空列表** 用来全部移除。
5. 列表可以搜索，点星标收藏。点某一项开始预览。
6. 版本会从 JSON 的 `skeleton.spine` 或二进制文件头里自动判断。右下角也可以手动指定 3.6、3.7、3.8、4.0、4.1、4.2。

播放：底部按钮或空格键暂停 / 继续，拖动时间轴，切换倍速和帧率。画面上按住左键平移，滚轮缩放，**归位** 恢复镜头。预览时默认画出骨架原点的坐标轴（红 X、绿 Y）。右侧边栏顶部的 **原点坐标轴** 里，**显示** 开关默认打开，取消勾选即隐藏。预乘 Alpha（PMA）默认关闭，需要时在右侧动画面板里勾选。

导出 PNG 序列帧或 GIF 时，浏览器会要求选择一个保存目录（File System Access API）。导出过程中保持这个标签页在前台。

## 支持的 Spine 版本

| 版本 | 来源 | 当前钉住的发布 |
| --- | --- | --- |
| 3.6 | [spine-runtimes](https://github.com/EsotericSoftware/spine-runtimes) 标签里的 `spine-ts/build/spine-webgl.js` | `3.6.53` |
| 3.7 | 同上 | `3.7.94` |
| 3.8 | 同上 | `3.8.95` |
| 4.0 | npm `@esotericsoftware/spine-webgl` 的 `dist/iife/spine-webgl.js` | `4.0.31` |
| 4.1 | 同上 | `4.1.55` |
| 4.2 | 同上 | `4.2.119` |

这些文件在 `public/vendor/spine/<版本>/`，旁边有对应的 `LICENSE`。清单见 `public/vendor/spine/versions.json`。脚本加载时会先注入该版本的官方 `spine-webgl.js`（全局变量 `spine`），再注入 `public/runtime/logic/logic_<版本>.js`。

3.6 / 3.7 的官方 Web 运行时没有完整的二进制解析器。这两个版本请导出 JSON。3.8 及以上 JSON 和二进制都可以。

## 更新运行时

编辑 `scripts/fetch-runtimes.mjs` 里的标签或 npm 版本（同一条主版本线内的补丁，例如把 `4.2.119` 换成更新的 `4.2.x`），然后：

```bash
npm run fetch-runtimes
```

脚本会重新下载 IIFE / 预构建文件和许可证，并重写 `versions.json`。同一主版本的导出格式兼容；若 Esoteric 改了 WebGL 类名，需要对照 `public/runtime/logic/logic_*.js` 里的 `spine.*` 调用一起改。

官方仓库：<https://github.com/EsotericSoftware/spine-runtimes>  
4.x 的浏览器包说明：<https://github.com/EsotericSoftware/spine-runtimes/blob/4.2/spine-ts/README.md>

## 目录

```
index.html                 页面入口
src/main.js                Vite 入口，按顺序加载各模块
src/styles/app.css         界面样式
src/state/globals.js       全局配置与颜色 / 日志
src/files/file-handler.js  文件夹扫描、拖放、收藏数据
src/loader/spine-loader.js 版本识别，加载官方运行时
src/viewer/                播放、镜头背景、骨骼调试、多轨道
src/effects/               事件与序列帧特效
src/export/                PNG / GIF / WebM 导出
src/config/                本地设置记忆
src/boot.js                启动时的界面初始化
public/vendor/spine/       官方 spine-webgl 运行时
public/runtime/logic/      各版本加载与渲染适配
public/vendor/gif/         gif.js 与 worker
```

## 许可

查看器业务代码改编自参考播放器。Spine 运行时使用 [Spine Runtimes License](http://esotericsoftware.com/spine-runtimes-license)，每个版本目录下有一份 `LICENSE`。使用这些运行时需要遵守 Esoteric Software 的许可条款（通常需要有效的 Spine 编辑器许可）。gif.js 以其仓库中的 MIT 许可发布。
