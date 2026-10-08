#!/usr/bin/env python3
"""把 dist/ 打成带顶层目录的发布压缩包。"""
import os
import stat
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
VERSION = "1.0.2"
NAME = f"SpineWebViewer-v{VERSION}"
OUT_DIR = ROOT / "release"
OUT = OUT_DIR / f"{NAME}.zip"

EXECUTABLE = {
    "Start-Mac.command",
    "Start-Linux.sh",
    "serve.py",
}


def main():
    if not (DIST / "index.html").is_file():
        raise SystemExit("dist/index.html 不存在，请先 npm run build")
    OUT_DIR.mkdir(exist_ok=True)
    if OUT.exists():
        OUT.unlink()

    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(DIST.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(DIST).as_posix()
            arc = f"{NAME}/{rel}"
            info = zipfile.ZipInfo(arc)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            mode = 0o755 if path.name in EXECUTABLE else 0o644
            info.external_attr = (stat.S_IFREG | mode) << 16
            with path.open("rb") as fh:
                zf.writestr(info, fh.read())
    print(OUT)
    print(f"{OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
