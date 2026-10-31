# TensioCare

A blood-pressure monitoring app for **patients** and their **caregivers**.
Patients log readings (manually or via a Bluetooth cuff), track trends and
adherence to a measurement plan, and get a risk assessment + future
projection. Caregivers follow a linked patient's schedule and completion
status, receive escalations when measurements are missed, and can ask an
AI assistant questions about the patient's data.

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo SDK 58, Expo Router), TypeScript, TanStack Query, react-native-svg, react-native-ble-plx |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Database | PostgreSQL (SQLite for tests) |
| AI (chat) | NVIDIA NIM — RAG over the patient's own dataset (`openai/gpt-oss-20b`) |
| AI (risk) | Transparent rule-based engine (weighted 0-100 score + trajectory projection) |
| Auth | JWT (access + refresh), caregiver login via one-time code |
| Push | Expo Push (best-effort) |

## System design & workflow

```
┌────────────┐   HTTPS/JSON    ┌──────────────┐   SQL    ┌────────────┐
│ Mobile app │ ──────────────► │ FastAPI API  │ ───────► │ PostgreSQL │
│ (Expo/RN)  │ ◄────────────── │ (uvicorn)    │ ◄─────── │            │
└────────────┘                 └──────┬───────┘          └────────────┘
                                     │
                                     ├─► NVIDIA NIM (RAG chat)
                                     └─► Rule engine (risk + prediction)
```

### From measurement to insight (happy path)

1. **Input** — patient taps **+** → chooses **Manual** (types values + symptoms)
   or **Auto** (pairs a BLE BP monitor; app subscribes to the standard
   `0x2A35` Blood Pressure Measurement characteristic and parses the reading).
2. **Create reading** — `POST /patients/me/readings` validates, stores the
   row (systolic, diastolic, pulse, notes, symptoms, device link), and
   closes the matching measurement window.
3. **Risk engine** — `assess_risk()` runs a weighted 0-100 score (BP
   thresholds, pulse, repeated highs, rising slope, variability, symptoms,
   age) → `low / moderate / high / critical`, with reasons +
   recommendations. Persisted to `risk_assessments` (audit trail).
4. **Escalation** — if critical, the patient and every linked caregiver get
   a `risk_critical` notification.
5. **Prediction** — `predict_risk()` extrapolates the least-squares slope
   over 7/14/30 days, reports days-until-breach of target/stage-2/crisis,
   miss probability, and a future risk level.
6. **UI refresh** — TanStack Query invalidates readings/assessment/risk;
   the dashboard re-renders the risk card, anomalies card, and trend.
7. **Caregiver side** — sees a derived risk summary + checklist (never raw
   readings), gets notified on critical risk or missed measurements, and can
   ask the assistant "how is his health?" (RAG over the patient's data).

### Chat (RAG) flow

`POST /patients/me/assistant/chat` (or caregiver variant):
1. **Retrieve** — detect topics in the question, query only the relevant rows
   (readings, adherence, windows, alerts, meta).
2. **Augment** — build a compact JSON context block.
3. **Generate** — NVIDIA NIM (`openai/gpt-oss-20b`) answers in 1-4 sentences,
   constrained to the retrieved data; output is sanitized to plain ASCII.
4. **Fallback** — if no API key or on error, a rule-based answer is returned
   (never breaks the UI).

## Running locally

### Backend
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# set DATABASE_URL in .env (Postgres) or leave unset for SQLite
alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Seed demo data:
```bash
$env:DATABASE_URL = "postgresql+psycopg://user:pass@localhost:5432/tensiocare"
.\.venv\Scripts\python.exe scripts/seed_demo_data.py
```
Demo creds: patient `maya.haddad.demo@tensiocare.app` / `PatientDemo1234`,
caregiver code `A4B7-C9D2`.

### Mobile
```bash
cd mobile
npm install
npx expo start --clear --web --port 8081
```
Set `EXPO_PUBLIC_API_BASE_URL` (or the configured base) to `http://127.0.0.1:8000/api/v1`.

### Tests
```bash
cd backend
.\.venv\Scripts\python.exe -m pytest -q   # 59 passed
cd mobile
npx tsc --noEmit
```

## Key endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login`, `/auth/caregiver/login` | Authentication |
| POST | `/patients/me/readings` | Create a reading (manual or device-tagged) |
| GET | `/patients/me/assessment` | Today's risk level + reasons + actions |
| GET | `/patients/me/risk` | 0-100 score + future projection |
| GET | `/patients/me/risk/history` | Persisted assessment audit trail |
| GET | `/patients/me/anomalies` | Suspicious / extreme / sudden readings |
| GET | `/patients/me/reports/15-day` | 15-day narrative report |
| POST | `/patients/me/assistant/chat` | RAG chat (patient) |
| GET/POST | `/patients/me/devices` | Pair / list / remove BP monitors |
| GET | `/caregivers/me/patients/{id}/risk` | Caregiver view of patient risk |
| POST | `/caregivers/me/patients/{id}/assistant/chat` | RAG chat (caregiver) |

## Medical disclaimer
TensioCare is educational decision support only. It is not a diagnosis and
does not recommend medication changes. Emergency symptoms (chest pain,
severe headache, shortness of breath, fainting, vision problems, weakness
on one side) trigger urgent handling and advise contacting emergency
services. A clinician must validate care decisions.