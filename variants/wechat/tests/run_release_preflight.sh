#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash tests/run_all.sh
find . -name "*.js" -not -path "./visual_test/*" -print0 | xargs -0 -n1 node --check >/dev/null
python3 - <<'PY2'
import json, pathlib
for p in pathlib.Path('.').rglob('*.json'):
    json.loads(p.read_text(encoding='utf-8'))
print('JSON parse: PASS')
PY2
printf '\nRELEASE PREFLIGHT v0.6.2 PASSED (official WeChat DevTools/device runtime remains external)\n'
