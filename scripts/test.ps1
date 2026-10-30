# Run the test suite without relying on a global Python/ruff on PATH.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$ruff = Join-Path $root ".venv\Scripts\ruff.exe"

if (-not (Test-Path $python)) {
    throw "Missing .venv. Create it with: python -m venv .venv"
}

Push-Location $root
try {
    & $ruff check app tests alembic
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $ruff format --check app tests alembic
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $python -m pytest -q
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
