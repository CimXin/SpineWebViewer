#!/bin/bash
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 ./serve.py
fi
if command -v python >/dev/null 2>&1; then
  exec python ./serve.py
fi
echo "需要 Python 3（macOS 一般已自带）。"
echo "也可在本目录执行: python3 -m http.server 4173"
echo "然后用浏览器打开 http://127.0.0.1:4173/"
read -r _
