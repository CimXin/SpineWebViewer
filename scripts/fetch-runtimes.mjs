/**
 * Download official Spine WebGL runtimes into public/vendor/spine/.
 *
 * 3.6–3.8: prebuilt spine-ts/build/spine-webgl.js from EsotericSoftware/spine-runtimes git tags.
 * 4.0–4.2: IIFE build published as @esotericsoftware/spine-webgl on npm (unpkg).
 *
 * Usage: node scripts/fetch-runtimes.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "public", "vendor", "spine");

const RUNTIMES = [
  {
    version: "3.6",
    package: "EsotericSoftware/spine-runtimes@3.6.53",
    file: "spine-webgl.js",
    url: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.6.53/spine-ts/build/spine-webgl.js",
    licenseUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.6.53/spine-ts/LICENSE",
    notes: "Git tag 3.6.53, path spine-ts/build/spine-webgl.js. Exposes global `spine`.",
  },
  {
    version: "3.7",
    package: "EsotericSoftware/spine-runtimes@3.7.94",
    file: "spine-webgl.js",
    url: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.7.94/spine-ts/build/spine-webgl.js",
    licenseUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.7.94/spine-ts/LICENSE",
    notes: "Git tag 3.7.94, path spine-ts/build/spine-webgl.js. Exposes global `spine`.",
  },
  {
    version: "3.8",
    package: "EsotericSoftware/spine-runtimes@3.8.95",
    file: "spine-webgl.js",
    url: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.8.95/spine-ts/build/spine-webgl.js",
    licenseUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.8.95/spine-ts/LICENSE",
    notes: "Git tag 3.8.95, path spine-ts/build/spine-webgl.js. Exposes global `spine`.",
  },
  {
    version: "4.0",
    package: "@esotericsoftware/spine-webgl@4.0.31",
    file: "spine-webgl.js",
    url: "https://unpkg.com/@esotericsoftware/spine-webgl@4.0.31/dist/iife/spine-webgl.js",
    licenseUrl: "https://unpkg.com/@esotericsoftware/spine-webgl@4.0.31/LICENSE",
    notes: "npm IIFE bundle dist/iife/spine-webgl.js. Exposes global `spine`.",
  },
  {
    version: "4.1",
    package: "@esotericsoftware/spine-webgl@4.1.55",
    file: "spine-webgl.js",
    url: "https://unpkg.com/@esotericsoftware/spine-webgl@4.1.55/dist/iife/spine-webgl.js",
    licenseUrl: "https://unpkg.com/@esotericsoftware/spine-webgl@4.1.55/LICENSE",
    notes: "npm IIFE bundle dist/iife/spine-webgl.js. Exposes global `spine`.",
  },
  {
    version: "4.2",
    package: "@esotericsoftware/spine-webgl@4.2.119",
    file: "spine-webgl.js",
    url: "https://unpkg.com/@esotericsoftware/spine-webgl@4.2.119/dist/iife/spine-webgl.js",
    licenseUrl: "https://unpkg.com/@esotericsoftware/spine-webgl@4.2.119/LICENSE",
    notes: "npm IIFE bundle dist/iife/spine-webgl.js. Exposes global `spine`.",
  },
];

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const manifest = [];

for (const item of RUNTIMES) {
  const dir = path.join(outRoot, item.version);
  await mkdir(dir, { recursive: true });
  process.stdout.write(`fetch ${item.version} ... `);
  const js = await download(item.url);
  const cleaned = Buffer.from(
    js.toString("utf8").replace(/\/\/# sourceMappingURL=spine-webgl\.js\.map\s*$/u, "").trimEnd() + "\n",
    "utf8"
  );
  if (cleaned.length < 50_000 || !cleaned.includes(Buffer.from("spine"))) {
    throw new Error(`runtime for ${item.version} looks invalid (${cleaned.length} bytes)`);
  }
  await writeFile(path.join(dir, "spine-webgl.js"), cleaned);
  const license = await download(item.licenseUrl);
  await writeFile(path.join(dir, "LICENSE"), license);
  manifest.push({
    version: item.version,
    package: item.package,
    url: item.url,
    licenseUrl: item.licenseUrl,
    bytes: cleaned.length,
    notes: item.notes,
  });
  process.stdout.write(`${js.length} bytes\n`);
}

await writeFile(
  path.join(outRoot, "versions.json"),
  JSON.stringify(
    {
      updated: new Date().toISOString().slice(0, 10),
      upstream: "https://github.com/EsotericSoftware/spine-runtimes",
      runtimes: manifest,
    },
    null,
    2
  ) + "\n"
);

console.log("wrote public/vendor/spine/versions.json");
