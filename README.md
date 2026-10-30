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

## Mobile app

The Expo / React Native app lives in [`mobile/`](mobile/README.md). It targets
iOS and Android, with a browser preview for development.

```powershell
cd mobile
npm install
Copy-Item .env.example .env
npx expo start
```

The app auto-detects the API host from the Expo dev server. Set
`EXPO_PUBLIC_API_URL` to point at a deployed backend. Remote push notifications
additionally need `EXPO_PUBLIC_EAS_PROJECT_ID` and FCM/APNs credentials in the
Expo project; local measurement reminders work without them.
