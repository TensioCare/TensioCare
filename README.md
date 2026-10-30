# Claudiator

Monorepo for the Claudiator project.

## Backend

The FastAPI backend lives in [`backend/`](backend/README.md).

Quick start from the repository root (Windows / PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
docker compose up -d
.\scripts\migrate.ps1
.\scripts\run.ps1
```

See [backend/README.md](backend/README.md) for setup, API endpoints, migrations,
tests, and Docker deployment details.
