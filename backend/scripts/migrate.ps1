# Apply database migrations with the project venv.
param(
    [string]$Revision = "head"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$alembic = Join-Path $root ".venv\Scripts\alembic.exe"

if (-not (Test-Path $alembic)) {
    throw "Alembic is not installed. Run: .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt"
}

Push-Location $root
try {
    & $alembic upgrade $Revision
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
