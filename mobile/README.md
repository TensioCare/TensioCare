# TensioCare mobile

Expo + React Native + TypeScript app for the SolveX blood-pressure backend.
There are two roles:

- **Patient** — records readings, follows a measurement plan, manages
  caregivers, and receives measurement reminders.
- **Caregiver** — follows exactly one patient, reviews the patient's readings
  and report, and acknowledges escalations.

Caregivers do not register themselves. A patient creates a caregiver, shares the
generated login code, and the caregiver signs in with that code. The first
successful code login activates the caregiver account; the same code can be used
for later sign-ins until the patient regenerates or removes it.

## Requirements

- Node.js 20+ and npm
- The backend running at port `8000` (see [`../backend/README.md`](../backend/README.md))
- Expo Go for quick UI testing, or an EAS development build for notifications
  and a real push token

## Setup

```powershell
cd mobile
npm install
Copy-Item .env.example .env
npx expo start
```

Open the QR code with Expo Go, or press `a` / `i` for an emulator. To preview the
same UI in a browser:

```powershell
npx expo start --web
```

Web is a development preview only. Local notification scheduling and Expo push
tokens require a native build.

### API URL

The app auto-detects the Expo dev-server host and uses:

```text
http://<dev-server-host>:8000/api/v1
```

That usually works on a physical phone on the same Wi-Fi as the backend. On the
Android emulator, `localhost` is mapped to `10.0.2.2` automatically. Override the
address when the API is remote:

```dotenv
EXPO_PUBLIC_API_URL=https://api.example.com/api/v1
```

The backend must allow the app origin. Its default CORS list includes
`http://localhost:8081` and `http://127.0.0.1:8081` for Expo web; add your
deployed web origin or use a native build.

## Notifications

- **Measurement reminders** are scheduled locally from the patient's pending
  measurement windows. They work in Expo Go and do not need push credentials.
- **Caregiver escalations and missed/daily alerts** use Expo Push. Set an EAS
  project ID before building:

```dotenv
EXPO_PUBLIC_EAS_PROJECT_ID=00000000-0000-0000-0000-000000000000
```

The app then registers its Expo push token with the backend. Remote delivery
also needs FCM credentials for Android and APNs credentials for iOS in the Expo
project. Without them the in-app Alerts inbox still works.

## Useful commands

```powershell
npm run typecheck
npm run doctor
npx expo export --platform web --output-dir dist
npx eas build --profile development --platform android
```

## Project layout

```text
app/                    Expo Router routes and role guards
  (auth)/               Patient login/register, caregiver code login
  (patient)/(tabs)/     Home, readings, plan, alerts, profile
  (patient)/            Caregiver management
  (caregiver)/(tabs)/   Overview, patient report, alerts, profile
  reading/              Create/edit reading modal routes
components/             Shared UI, forms, cards, notification bridge
lib/                    API client, auth, storage, formatting, notifications
constants/              Theme tokens
```

## Notes

- Access and refresh tokens are stored with `expo-secure-store` on native and
  `localStorage` on web. The API client refreshes an expired access token once
  and retries the request.
- The measurement plan editor writes both `PatientProfile` plan fields and the
  reminder schedule, so the backend can materialise measurement windows.
- The app does not use Firebase or APNs directly. Expo Push is the single push
  integration point.
- Web uses Expo Router's `single` output so the client bundle hydrates
  normally in the dev server.
