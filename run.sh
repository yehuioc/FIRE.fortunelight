#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ -x .venv/bin/python ]; then PYTHON=.venv/bin/python
elif command -v python3 >/dev/null 2>&1; then PYTHON=python3
else PYTHON=python; fi
exec "$PYTHON" run.py "$@"
