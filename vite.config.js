import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // 生产包使用相对路径，解压到任意目录后用本地静态服务打开即可。
  base: command === "build" ? "./" : "/",
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
