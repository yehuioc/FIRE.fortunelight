"""Bootstrap a private local environment once, then start Fortune Light offline."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description="启动本地财富自由指南灯")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--reload", action="store_true", help="开发时自动重载")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("端口须为 1–65535")
    if sys.version_info < (3, 10):
        parser.error("需要 Python 3.10 或更新版本")
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    env = os.environ.copy()
    temporary = ROOT / "tmp"
    temporary.mkdir(exist_ok=True)
    env.update(TMP=str(temporary), TEMP=str(temporary), TMPDIR=str(temporary), PIP_CACHE_DIR=str(temporary / "pip-cache"))
    if not python.exists():
        print("首次启动：创建本项目 Python 环境。", flush=True)
        subprocess.run([sys.executable, "-m", "venv", str(ROOT / ".venv")], check=True, env=env)
    ready = subprocess.run([str(python), "-c", "import fastapi,uvicorn,pydantic; assert int(pydantic.__version__.split('.')[0]) == 2"], env=env, capture_output=True)
    if ready.returncode:
        print("首次启动：安装依赖，需要网络；后续启动可离线使用。", flush=True)
        subprocess.run([str(python), "-m", "pip", "install", "-r", str(ROOT / "backend/requirements.txt")], check=True, env=env)
    url = f"http://127.0.0.1:{args.port}"
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", args.port)) == 0:
            print(f"端口 {args.port} 已被占用。已有指南灯可直接访问 {url}；或加 --port 换一个端口。", file=sys.stderr)
            return 2
    command = [str(python), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(args.port)]
    if args.reload:
        command.append("--reload")
    child = subprocess.Popen(command, cwd=ROOT, env=env)
    if not args.no_browser:
        def open_when_ready():
            for _ in range(100):
                if child.poll() is not None:
                    return
                try:
                    with urllib.request.urlopen(url + "/api/health", timeout=0.5) as response:
                        if response.status == 200:
                            webbrowser.open(url)
                            return
                except (OSError, ValueError):
                    time.sleep(0.1)
        threading.Thread(target=open_when_ready, daemon=True).start()
    print(f"指南灯：{url}  ·  关闭此终端或按 Ctrl+C 停止。", flush=True)
    try:
        return child.wait()
    except KeyboardInterrupt:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
