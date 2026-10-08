#!/usr/bin/env python3
"""在本目录启动一个只监听本机的静态服务器，并打开浏览器。无需安装依赖。"""
import functools
import http.server
import socket
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def find_port(start=4173, tries=30):
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    sys.exit("找不到可用端口，请关掉占用 4173 附近端口的程序后重试。")


def main():
    port = find_port()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://127.0.0.1:{port}/"
    print("Spine Web Viewer")
    print(url)
    print("关闭此窗口即可停止服务。")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
