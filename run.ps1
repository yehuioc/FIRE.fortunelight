$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$localPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $localPython) {
    & $localPython (Join-Path $projectRoot 'run.py') @args
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 (Join-Path $projectRoot 'run.py') @args
} else {
    & python (Join-Path $projectRoot 'run.py') @args
}
exit $LASTEXITCODE
