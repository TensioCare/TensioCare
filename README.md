# SolveX API

FastAPI backend for a blood pressure monitoring app. There are two roles:
**patients** (own a BP device and push readings) and **caregivers** (family
members who follow one patient). The app analyses every reading using AHA
categories and shows averages, target compliance, trends and alerts.

## Requirements

- Python 3.10+
- Docker Desktop (runs PostgreSQL in a container) — or an existing PostgreSQL 14+

## Setup (Windows / PowerShell)

```powershell
cd C:\Users\basse\Desktop\solvex
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `POSTGRES_PASSWORD` and `DATABASE_URL` in `.env` (they must use the same
password), and generate a `SECRET_KEY`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start PostgreSQL and create the schema:

```powershell
docker compose up -d          # Postgres 17 on localhost:5432, data in a named volume
uvicorn app.main:app --reload # creates the tables on startup
```

On macOS/Linux: `python3 -m venv .venv && source .venv/bin/activate`, the rest is
identical.

Useful Docker commands:

```powershell
docker compose ps             # status / health
docker compose logs -f db     # logs
docker compose stop           # keep data
docker compose down -v        # stop and delete the database volume
```

Without Docker, point `DATABASE_URL` at any PostgreSQL server and install the
driver: `pip install "psycopg[binary]"` (already in `requirements.txt`).

## Run

```powershell
uvicorn app.main:app --reload
```

- Swagger UI: http://127.0.0.1:8000/docs (**Authorize** with a registered account)
- ReDoc: http://127.0.0.1:8000/redoc

## Roles

Registration always creates a **patient**. There is no caregiver sign-up: the
patient adds each caregiver from inside the app and receives a **login code**.

| Role | Account fields | Profile fields |
| --- | --- | --- |
| `patient` | email, password, first_name, last_name, age | diagnosis, medical_history, allergies, medications, target_systolic, target_diastolic, measurements_per_day, measurement_times, timezone |
| `caregiver` | first_name, last_name (no email, no password) | relationship, phone, notes, link with priority + notify_after_minutes |

Caregiver flow:

1. The patient calls `POST /patients/me/caregivers` with the caregiver's name,
   relationship, phone, notes, `priority` and `notify_after_minutes`.
2. The response contains a code like `CDFK-ZX5Q`. It is shown **once**; the
   patient can regenerate it at any time (`POST /patients/me/caregivers/{id}/code`).
3. The caregiver enters the code in the app (`POST /auth/caregiver/login`).
   First use activates the account; the response is a normal token pair, so the
   caregiver stays signed in and never types the code again.
4. The code also works for later logins (for example after reinstalling the
   app). Regenerating it invalidates the old one.
5. `DELETE /patients/me/caregivers/{id}` deletes the account, the link and all
   of its refresh tokens.

Each caregiver account follows exactly one patient (`GET /caregivers/me/patients`);
the database enforces this, so a second link is impossible. The patient can add
several caregivers; their `priority` forms the escalation ring (1 = called
first).

## Measurement plan on the patient profile

The patient can set how often and when they measure blood pressure directly in
the registration form or on the profile, without calling the reminders endpoint
first:

```json
{
  "measurements_per_day": 2,
  "measurement_times": ["08:00", "20:00"],
  "timezone": "Africa/Cairo"
}
```

- `measurements_per_day` is 1–6. If it is omitted, it is inferred from
  `measurement_times`. If both are sent they must match.
- `measurement_times` accepts `"08:00"`, `"8:00"`, `"8am"`, `"8:00 PM"`,
  `"12am"` and `"12pm"`; values are normalised to 24-hour `HH:MM`, sorted and
  deduplicated.
- `timezone` is an IANA name and defaults to `UTC`.
- Setting `measurement_times: []` disables reminders and clears the plan.
- The profile fields and the reminder schedule are kept in sync in both
  directions. Saving `/patients/me/reminders` updates
  `measurements_per_day`, `measurement_times` and `timezone`; editing the
  profile creates/updates the schedule and materialises tomorrow's windows.

A plan with times creates a `ReminderSchedule` immediately, so the existing
reminder, missed-measurement and escalation flow applies without extra calls.

## Devices and readings

- `POST /patients/me/devices` pairs a monitor by serial number (unique, one owner).
- `POST /patients/me/readings` takes `systolic`, `diastolic`, optional `pulse`,
  `measured_at` (defaults to now, UTC), `device_serial`, `notes`, `arm`
  (`left`/`right`), `position` (`sitting`/`standing`/`lying`) and
  `resting_minutes`. Without a serial the reading is stored as `manual`; with
  one it is linked to the device and the device's `last_synced_at` is updated.
- `client_reading_id` makes uploads idempotent: a retried device sync returns
  the original reading instead of creating a duplicate.
- `PATCH /patients/me/readings/{id}` corrects a reading, `DELETE` removes it.
- `GET /patients/me/readings/export.csv` downloads the history (the caregiver
  equivalent is `/caregivers/me/patients/{id}/readings/export.csv`).
- Every reading returns `category`, `pulse_pressure` and `mean_arterial_pressure`.

AHA categories (mmHg), computed on the fly — never stored stale:

| Category | Rule |
| --- | --- |
| `crisis` | systolic > 180 or diastolic > 120 |
| `stage_2` | systolic >= 140 or diastolic >= 90 |
| `stage_1` | systolic >= 130 or diastolic >= 80 |
| `low` | systolic < 90 or diastolic < 60 |
| `elevated` | systolic 120-129 (and diastolic < 80) |
| `normal` | systolic < 120 and diastolic < 80 |

## Analysis

`GET .../analysis?days=7` returns:

- averages / min / max for systolic, diastolic and pulse
- `category_counts` and the latest reading
- `daily`: per-day averages, min/max and above-target counts (ready for charts)
- `previous_period`: the preceding window's averages and a
  `better`/`worse`/`stable` direction
- target compliance (`readings_above_target`, `in_target_percent`)
- `trend`: `improving` / `worsening` / `stable` (compares the systolic average of
  the first vs second half of the period; needs at least 4 readings)
- `alerts`: crisis readings, stage 1/2 averages, readings above target, rising
  trend, and worsening versus the previous period

## Daily assessment, 15-day report and assistant

Three deterministic features built on the same numbers. They are explainable and
need no external AI key; an LLM can later rewrite the text, but the
calculations stay rule-based.

- `GET /patients/me/assessment` (caregiver:
  `/caregivers/me/patients/{id}/assessment`) returns today's `risk_level`
  (`no_data` / `low` / `moderate` / `high` / `critical`), `reasons`, `actions`,
  the 24-hour averages, latest reading, missed measurements and 7-day adherence.
- The scheduler also checks the assessment hourly between 08:00 and 12:00 in the
  patient's timezone (UTC without a schedule). A `high` or `critical` result
  creates one `daily_assessment` notification per local day; low/moderate
  results stay on demand so the inbox is not noisy. Run it manually with
  `.\.venv\Scripts\python.exe -m app.jobs.insights --at 2026-10-31T09:00:00Z`.
- `GET /patients/me/reports/15-day?days=15` returns a narrative `report`, plus
  highlights, recommendations, the full analysis and adherence summary.
- `POST /patients/me/assistant` with `{"question": "What is the average?"}`
  answers questions about the latest reading, average, adherence, target,
  trend, crisis readings or a 15-day summary. Unknown questions return `help`
  with the supported topics. Caregivers use the patient-scoped equivalent.

## Mobile app authentication

The API is built for a native client (React Native, Flutter, Swift, Kotlin): no
cookies, no sessions, no CSRF. Every protected request carries
`Authorization: Bearer <access_token>`.

Two tokens are issued by register, login, caregiver login and refresh:

| Token | Lifetime | How it is used |
| --- | --- | --- |
| `access_token` (JWT) | 30 min (`ACCESS_TOKEN_EXPIRE_MINUTES`) | Sent on every API call |
| `refresh_token` (opaque) | 30 days (`REFRESH_TOKEN_EXPIRE_DAYS`) | Only sent to `/auth/refresh` and `/auth/logout` |

Refresh tokens are stored **hashed** in the `refresh_tokens` table and are
**single-use**: each refresh revokes the old token and returns a new one, so a
stolen token stops working as soon as the real client refreshes.

Login response:

```json
{
  "access_token": "eyJ...",
  "refresh_token": "Nf3k...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": { "id": 1, "email": "ali@solvex-demo.com", "role": "patient", "...": "..." }
}
```

A caregiver receives the same shape from `POST /auth/caregiver/login`, with
`role: "caregiver"` and `email: null`.

Client flow:

1. Patient: register or login. Caregiver: `POST /auth/caregiver/login` with the
   code from the patient. Store both tokens in the platform secure store
   (iOS Keychain / Android EncryptedSharedPreferences — not plain preferences).
2. Call the API with the access token.
3. On `401`, call `POST /api/v1/auth/refresh` with `{"refresh_token": "..."}`,
   replace both stored tokens with the response, and retry the original request.
4. On sign-out, call `POST /api/v1/auth/logout` and delete both tokens locally.
   The endpoint returns `204` and is idempotent.

Renewing a session never needs the password, so users stay signed in for weeks
while a leaked access token is only useful for 30 minutes.

## Reminders, notifications and escalation

Four pieces work together:

1. **Push devices** — the app registers its FCM/APNs token once per phone.
2. **Notifications** — every alert is stored in `notifications` (the in-app
   inbox) and handed to the push transport. The transport is a placeholder in
   `app/services/notifications.py::_send_push`; plug FCM/APNs/Expo in there.
3. **Measurement windows** — the scheduler materialises one row per expected
   measurement from the patient's schedule (timezone-aware). A schedule can run
   on selected weekdays (`days_of_week`, 0 = Monday) and a pending window can be
   snoozed (`POST /patients/me/reminders/windows/{id}/snooze` with
   `{"minutes": 15}`).
4. **Escalation ring** — caregivers have a `priority` (1 = called first). If
   nobody acknowledges, the next caregiver is notified. The patient is told when
   a caregiver acknowledges, and again if nobody does (`escalation_unresolved`).

Lifecycle of one window:

```
pending -> completed    reading arrived within grace_minutes
pending -> missed       grace period passed; patient gets a "missed" alert
missed  -> escalated    priority 1 caregiver alerted
escalated -> acknowledged   a caregiver tapped Acknowledge
escalated -> escalated      timeout: priority 2, then 3, ...
escalated -> unresolved     nobody acknowledged after the last tier
```

A reading (manual or device) closes the window it falls into, so a manual entry
before the reminder resolves it instead of escalating. A reading taken up to
60 minutes before the scheduled time also counts, so measuring early cancels the
upcoming reminder. Only the nearest open window is closed.

The scheduler runs every 60 seconds inside the app (`ENABLE_SCHEDULER=true`).
Saving an active schedule also creates the upcoming windows immediately, so the
app can show them without waiting for the next tick. Set
`ENABLE_SCHEDULER=false` when you want to drive the clock yourself.

### Try it without waiting

Register a patient, two caregivers (priority 1 and 2) and a schedule, then
simulate a missed measurement by running the job with an injected clock:

```powershell
$at = "2026-01-01T06:05:00Z"   # 08:00 in Africa/Cairo
.\.venv\Scripts\python.exe -m app.jobs.reminders --at $at

# 65 minutes later the grace period is over: missed + caregiver 1
.\.venv\Scripts\python.exe -m app.jobs.reminders --at "2026-01-01T07:10:00Z"

# no acknowledgement after notify_after_minutes: caregiver 2
.\.venv\Scripts\python.exe -m app.jobs.reminders --at "2026-01-01T07:26:00Z"

# still nothing: unresolved, everybody is told
.\.venv\Scripts\python.exe -m app.jobs.reminders --at "2026-01-01T07:42:00Z"
```

Then read the inbox and acknowledge:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/notifications `
  -Headers @{ Authorization = "Bearer $caregiverToken" }

Invoke-RestMethod -Method Post `
  http://127.0.0.1:8000/api/v1/notifications/$notificationId/ack `
  -Headers @{ Authorization = "Bearer $caregiverToken" }
```

`ack` stops the ring: the window becomes `acknowledged` and no further
caregiver is called. Only a linked caregiver can acknowledge; anyone else gets
`403`/`404`.

## Endpoints

### Public

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/health` | Liveness probe |
| POST | `/api/v1/auth/register` | Create a **patient** (access + refresh token) |
| POST | `/api/v1/auth/login` | Patient login → access + refresh token |
| POST | `/api/v1/auth/caregiver/login` | Caregiver login with the patient's code |
| GET | `/api/v1/auth/caregiver-codes/{code}` | Preview who a code belongs to (no auth) |
| POST | `/api/v1/auth/refresh` | Exchange a refresh token for a new pair |
| POST | `/api/v1/auth/logout` | Revoke a refresh token |
| POST | `/api/v1/auth/token` | OAuth2 form login (Swagger Authorize) |

### Patient

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/auth/me` | Current user with profile |
| GET/PATCH | `/api/v1/patients/me` | Profile, measurement plan, targets |
| POST/GET | `/api/v1/patients/me/devices` | Pair / list BP devices |
| DELETE | `/api/v1/patients/me/devices/{device_id}` | Unpair a device |
| POST | `/api/v1/patients/me/readings` | Add a reading (device or manual, idempotent) |
| GET | `/api/v1/patients/me/readings` | History (`start`, `end`, `limit`, `offset`) |
| PATCH/DELETE | `/api/v1/patients/me/readings/{reading_id}` | Correct / delete a reading |
| GET | `/api/v1/patients/me/readings/latest` | Most recent reading |
| GET | `/api/v1/patients/me/readings/analysis?days=7` | Personal analysis |
| GET | `/api/v1/patients/me/readings/export.csv` | Download the history as CSV |
| GET/PUT/DELETE | `/api/v1/patients/me/reminders` | Measurement schedule (`times`, `days_of_week`, timezone) |
| GET | `/api/v1/patients/me/reminders/windows?days=7` | Expected measurements and their status |
| POST | `/api/v1/patients/me/reminders/windows/{window_id}/snooze` | Move a pending measurement later |
| GET | `/api/v1/patients/me/adherence?days=30` | Compliance percentage |
| GET | `/api/v1/patients/me/assessment` | Today's risk, reasons and actions |
| GET | `/api/v1/patients/me/reports/15-day?days=15` | Narrative report |
| POST | `/api/v1/patients/me/assistant` | Ask a question about the readings |
| GET | `/api/v1/patients/me/caregivers` | Caregivers in escalation order |
| POST | `/api/v1/patients/me/caregivers` | Add a caregiver → returns their login code |
| PATCH | `/api/v1/patients/me/caregivers/{caregiver_id}` | Edit details, ring position or timeout |
| POST | `/api/v1/patients/me/caregivers/{caregiver_id}/code` | Regenerate the code |
| DELETE | `/api/v1/patients/me/caregivers/{caregiver_id}` | Remove the caregiver and their sessions |

### Caregiver

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/auth/me` | Current user with profile |
| PATCH | `/api/v1/caregivers/me` | Edit my own name, relationship and contact details |
| GET | `/api/v1/caregivers/me/patients` | The patient this caregiver follows |
| PATCH | `/api/v1/caregivers/me/patients/{patient_id}` | Change priority / ack timeout |
| DELETE | `/api/v1/caregivers/me/patients/{patient_id}` | Leave the patient (deletes the account) |
| GET | `/api/v1/caregivers/me/patients/{patient_id}/readings` | Patient history |
| GET | `/api/v1/caregivers/me/patients/{patient_id}/readings/export.csv` | Patient history as CSV |
| GET | `/api/v1/caregivers/me/patients/{patient_id}/analysis?days=7` | Patient analysis |
| GET | `/api/v1/caregivers/me/patients/{patient_id}/adherence` | Patient compliance |
| GET | `/api/v1/caregivers/me/patients/{patient_id}/assessment` | Patient's daily risk |
| GET | `/api/v1/caregivers/me/patients/{patient_id}/reports/15-day` | Patient's narrative report |
| POST | `/api/v1/caregivers/me/patients/{patient_id}/assistant` | Ask about the patient |

### Notifications (any signed-in user)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/notifications` | Inbox (`unread_only`, `type`, `limit`, `offset`) |
| GET | `/api/v1/notifications/unread-count` | Badge count |
| POST | `/api/v1/notifications/{id}/read` | Mark one as read |
| POST | `/api/v1/notifications/read-all` | Mark everything as read |
| POST | `/api/v1/notifications/{id}/ack` | Acknowledge an escalation |
| POST/GET | `/api/v1/notifications/devices` | Register / list push tokens |
| DELETE | `/api/v1/notifications/devices/{id}` | Remove a push token |

All protected routes expect `Authorization: Bearer <access_token>`. Caregivers
can only read patients linked to them (otherwise 403), and patients cannot call
caregiver routes.

## Examples

Register a patient:

```json
{
  "email": "ali@solvex-demo.com",
  "password": "strong-password",
  "first_name": "Ali",
  "last_name": "Bassem",
  "age": 61,
  "diagnosis": "Hypertension stage 2",
  "medical_history": "Hypertension since 2021, sleep apnea",
  "medications": "Amlodipine 10mg",
  "target_systolic": 130,
  "target_diastolic": 80,
  "measurements_per_day": 2,
  "measurement_times": ["8am", "8pm"],
  "timezone": "Africa/Cairo"
}
```

Add a caregiver as the patient (the response contains the code):

```json
{
  "first_name": "Omar",
  "last_name": "Bassem",
  "relationship": "Son",
  "phone": "+1 555 0300",
  "notes": "Lives 10 minutes away",
  "priority": 1,
  "notify_after_minutes": 15
}
```

```json
{
  "caregiver_id": 1,
  "user_id": 2,
  "first_name": "Omar",
  "last_name": "Bassem",
  "relationship": "Son",
  "priority": 1,
  "notify_after_minutes": 15,
  "code": "CDFK-ZX5Q"
}
```

The caregiver signs in with that code (no email or password):

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8000/api/v1/auth/caregiver/login `
  -ContentType "application/json" `
  -Body '{"code":"CDFK-ZX5Q"}'
```

The response is the usual token pair. Keep the refresh token: the app uses it
to stay signed in, so the code is only needed on the first login or after a
reinstall.

Push a reading:

```powershell
$r = Invoke-RestMethod -Method Post http://127.0.0.1:8000/api/v1/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"ali@solvex-demo.com","password":"strong-password"}'

Invoke-RestMethod -Method Post http://127.0.0.1:8000/api/v1/patients/me/readings `
  -Headers @{ Authorization = "Bearer $($r.access_token)" } `
  -ContentType "application/json" `
  -Body '{"systolic":158,"diastolic":99,"pulse":92,"device_serial":"OMRON-X7-0042"}'
```

```json
{
  "id": 1,
  "systolic": 158,
  "diastolic": 99,
  "pulse": 92,
  "measured_at": "2026-10-29T09:12:00",
  "device_id": 1,
  "source": "device",
  "arm": "left",
  "position": "sitting",
  "resting_minutes": 5,
  "client_reading_id": "device-sync-0001",
  "category": "stage_2",
  "pulse_pressure": 59,
  "mean_arterial_pressure": 118.7
}
```

## Browse the database

Two options, both use the same Postgres container.

**Adminer (web UI, nothing to install).** It is part of `docker-compose.yml`:

```powershell
docker compose up -d
```

Open <http://localhost:8080> and log in with:

| Field | Value |
| --- | --- |
| System | PostgreSQL |
| Server | `db` |
| Username | `solvex` |
| Password | value of `POSTGRES_PASSWORD` in `.env` |
| Database | `solvex` |

Your tables are `users`, `patient_profiles`, `caregiver_profiles`,
`caregiver_patients`, `devices`, `blood_pressure_readings`, `refresh_tokens`,
`reminder_schedules`, `measurement_windows`, `notifications`, `push_devices`.
Click **select** on `users` to see every account and its role.

To read the password from `.env`:

```powershell
Select-String .env -Pattern POSTGRES_PASSWORD
```

**psql (terminal).** No password needed inside the container:

```powershell
docker exec -it solvex-db psql -U solvex -d solvex
```

Handy commands:

```sql
\dt                                  -- list tables
\d users                             -- columns and types
select id, email, role, created_at from users;
select * from patient_profiles;
select measured_at, systolic, diastolic, pulse from blood_pressure_readings
order by measured_at desc limit 10;
```

Or as one-liners without opening a session:

```powershell
docker exec solvex-db psql -U solvex -d solvex -c "select email, role from users;"
```

If the tables are empty, create a user through the API (or run the Postman
collection) and refresh.

## Test with Postman

Import [postman/solvex.postman_collection.json](postman/solvex.postman_collection.json)
in Postman (**Import → File**). The collection uses these variables:

| Variable | Default |
| --- | --- |
| `baseUrl` | `http://127.0.0.1:8000/api/v1` |
| `patientToken` / `caregiverToken` | filled automatically |
| `refreshToken` | filled automatically on register/login/refresh |
| `patientEmail` | regenerated on each register |
| `caregiverId` / `caregiverCode` | filled when the patient adds a caregiver |
| `patientId` / `deviceId` / `deviceSerial` | filled automatically |
| `readingId` / `windowId` | filled when a reading / window is created |

Start the API, then either click through the requests top to bottom or use
**Run collection** (Collection Runner). Order matters:

1. **Auth → Register patient** (stores `patientToken`, `refreshToken`, `patientId`)
2. **Auth → Add caregiver** (stores `caregiverId`, `caregiverCode`), then
   **Preview caregiver code** and **Login caregiver with code**
3. **Auth → Refresh token** then **Logout** (rotation + revocation demo)
4. **Patient → Register device** (stores `deviceId`), then readings/analysis.
   **Add a reading** stores `readingId`; **Edit reading** corrects it.
5. **Patient → Set schedule** then **List windows** (stores `windowId`) and
   **Snooze window**. Try **Daily assessment**, **15-day report** and
   **Ask assistant**.
6. **Patient → List my caregivers** (slice status: `pending` or `active`),
   then **Edit caregiver** or **Regenerate caregiver code**.
7. **Caregiver → Edit my details / List patients / readings / analysis /
   assessment / report / assistant / CSV export**.
8. **Cleanup → Delete reading**, then **Remove caregiver** last (it deletes the
   caregiver account). The caregiver can alternatively leave with
   `DELETE /caregivers/me/patients/{patient_id}`; it is not in the runner so both
   cleanup paths do not delete the same account twice.

Register requests generate a fresh email each run, so you can rerun the whole
collection without `409 Email already registered`. To test 401/403 responses,
edit a token to something invalid or call a caregiver route with the patient
token.

Swagger UI at `/docs` covers the same endpoints if you prefer not to install
anything.

## Tests

```powershell
pip install -r requirements-dev.txt
pytest
ruff check .
```

## Structure

```
app/
  main.py              FastAPI app, CORS, tables on startup
  core/config.py       Settings from .env / environment
  core/security.py     Argon2 hashing + JWT
  core/bp.py           AHA classification, trend logic (pure functions)
  core/timeutils.py    UTC helpers
  db/                  SQLAlchemy Base, engine, session, get_db
  models/              User, PatientProfile, CaregiverProfile,
                       CaregiverPatient, Device, BloodPressureReading,
                       RefreshToken, ReminderSchedule, MeasurementWindow,
                       Notification, PushDevice
  schemas/             Pydantic request/response models
  services/users.py    Patient registration, authentication, eager loading
  services/caregivers.py  Caregiver creation, login codes, removal
  services/tokens.py   Refresh token issue, rotation, revocation
  services/notifications.py  Inbox + push transport + acknowledge
  services/reminders.py      Windows, reminder cycle, escalation ring
  services/monitoring.py  Readings, analysis, access checks, patient lookup
  services/insights.py   Daily risk, 15-day report, rule-based assistant
  jobs/reminders.py    One cycle, runnable as a module with --at
  jobs/insights.py     Daily high/critical notification, same --at option
  scheduler.py         APScheduler job (every 60s)
  api/deps.py          CurrentUser + role guards
  api/routes/          auth, patients, caregivers, readings, devices,
                       reminders, notifications, insights
tests/                 pytest + TestClient (in-memory SQLite)
```

## Notes

- PostgreSQL 17 runs in Docker Compose; tables are created on startup. Because
  there are no migrations yet, **reset the schema after changing models**:
  `.\.venv\Scripts\python.exe scripts\reset_db.py` (drops and recreates the
  tables in the running container, no volume reset needed), or
  `docker compose down -v && docker compose up -d` (deletes all data), or add
  Alembic before you have data worth keeping.
- SQLite still works as a fallback (`DATABASE_URL=sqlite:///./solvex.db`).
- Before production: add Alembic, set a strong `SECRET_KEY`, narrow
  `CORS_ORIGINS`, and put device ingestion behind a per-device token.
- The reminder scheduler runs inside the API process. With more than one
  uvicorn worker, move `app.jobs.reminders.run_once` to Celery beat (or run a
  single dedicated worker) so jobs are not executed twice.
- Push delivery is a placeholder (`_send_push` logs). Add FCM/APNs credentials
  and send to the tokens stored in `push_devices`; notifications are already
  persisted so the in-app inbox works without push.
- Caregiver codes are random (`32^8` combinations) and stored as SHA-256 hashes.
  They do not expire; the patient regenerates or removes a caregiver to cut
  access. Add rate limiting on `/auth/caregiver/login` before production.
- Timestamps are stored as UTC (`measured_at`), so Postgres returns them with a
  `+00:00` offset.
