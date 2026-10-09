#!/bin/bash
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 ./serve.py
fi
if command -v python >/dev/null 2>&1; then
  exec python ./serve.py
fi
echo "需要 Python 3。安装后重新运行，或执行:"
echo "  python3 -m http.server 4173 --bind 127.0.0.1"
echo "然后用浏览器打开 http://127.0.0.1:4173/"
