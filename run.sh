#!/usr/bin/env bash
# 财富自由指南灯 · 一键启动
set -e
cd "$(dirname "$0")"

VENV=".venv"
if [ ! -d "$VENV" ]; then
  echo "[setup] creating venv..."
  if command -v python3 >/dev/null 2>&1; then PYTHON=python3; else PYTHON=python; fi
  "$PYTHON" -m venv "$VENV"
fi

if [ -x "$VENV/Scripts/python.exe" ]; then
  VENV_PYTHON="$VENV/Scripts/python.exe"
else
  VENV_PYTHON="$VENV/bin/python"
fi

"$VENV_PYTHON" -m pip install -q -r backend/requirements.txt

PORT=8766
echo "[run] starting on http://127.0.0.1:$PORT"
(
  sleep 1.2
  if command -v open >/dev/null 2>&1; then
    open "http://127.0.0.1:$PORT"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:$PORT"
  elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "http://127.0.0.1:$PORT"
  fi
) &
exec "$VENV_PYTHON" -m uvicorn backend.main:app --host 127.0.0.1 --port $PORT --reload
