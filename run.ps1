$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $project '.venv'
$python = Join-Path $venv 'Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    Write-Host '[setup] creating venv...'
    python -m venv $venv
}

& $python -m pip install -q -r (Join-Path $project 'backend\requirements.txt')

$url = 'http://127.0.0.1:8766'
Write-Host "[run] starting on $url"
Start-Process $url
Push-Location $project
try {
    & $python -m uvicorn backend.main:app --host 127.0.0.1 --port 8766 --reload
} finally {
    Pop-Location
}
