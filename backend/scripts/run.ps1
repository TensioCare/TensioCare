# Start the API with the project venv, regardless of the shell PATH.
param(
    [switch]$NoReload
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    throw "Missing .venv. Create it with: python -m venv .venv"
}

$uvicornArgs = @(
    "-m", "uvicorn", "app.main:app",
    "--host", "127.0.0.1",
    "--port", "8000"
)
if (-not $NoReload) {
    $uvicornArgs += "--reload"
}

Push-Location $root
try {
    & $python @uvicornArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
