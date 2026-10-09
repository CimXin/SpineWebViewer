import { defineConfig } from "vite";

function pagesBase(command) {
  const fromEnv = process.env.PAGES_BASE;
  if (fromEnv) {
    return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
  }
  return command === "build" ? "./" : "/";
}

export default defineConfig(({ command }) => ({
  // 发布压缩包用相对路径，解压到任意目录都能打开。
  // GitHub Pages 工作流设置 PAGES_BASE=/SpineWebViewer/，站点挂在仓库子路径下。
  base: pagesBase(command),
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },
}));
