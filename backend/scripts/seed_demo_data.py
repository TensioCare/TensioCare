"""Seed demo data for local testing: a patient with blood-pressure readings.

Creates one patient account (with a caregiver link) and ~60 days of blood
pressure readings (two per day, 08:00 and 20:00) so the app has history to
render: trend chart, risk states, adherence, missed/escalated windows.

Development script, safe to re-run (uses deterministic reading ids).
"""

import hashlib
import re
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import func, select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.core.timeutils import to_naive_utc, utcnow  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.caregiver import CaregiverPatient, CaregiverProfile  # noqa: E402
from app.models.patient import PatientProfile  # noqa: E402
from app.models.reading import BloodPressureReading  # noqa: E402
from app.models.reminder import MeasurementWindow, ReminderSchedule  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.services.reminders import generate_windows, process_windows  # noqa: E402

PATIENT_EMAIL = "maya.haddad.demo@tensiocare.app"
PATIENT_PASSWORD = "PatientDemo1234"
PATIENT_FIRST_NAME = "Maya"
PATIENT_LAST_NAME = "Haddad"
PATIENT_AGE = 64
PATIENT_DIAGNOSIS = "Hypertension essentielle"
TARGET_SYSTOLIC = 130
TARGET_DIASTOLIC = 80
MEASUREMENT_TIMES = ["08:00", "20:00"]

CAREGIVER_FIRST_NAME = "Jonas"
CAREGIVER_LAST_NAME = "Berg"
CAREGIVER_RELATIONSHIP = "Daughter"
CAREGIVER_PHONE = "+1 555 0100"
CAREGIVER_CODE_RAW = "A4B7C9D2"

READING_DAYS = 60
TIMES_PER_DAY = 2

# Days in the past that have no reading, so the reminder job reports a miss.
WINDOW_DAYS = 30
MISSED_SLOTS = {(12, 1), (5, 0), (21, 1)}


def _hash_caregiver_code(raw: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]", "", raw.upper())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _bp_values(index: int) -> tuple[int, int, int]:
    """Systolic/diastolic/pulse trending from hypertensive to normal over ~2 months."""
    progress = index / max(1, READING_DAYS - 1)
    systolic = round(152 - progress * 26)
    diastolic = round(94 - progress * 16)
    pulse = 78 + int(progress * 8)
    if index % 8 == 3 and index < READING_DAYS - 2:
        systolic += 14
        diastolic += 6
    return (
        max(105, min(170, systolic)),
        max(70, min(112, diastolic)),
        max(60, min(110, pulse)),
    )


def seed() -> dict:
    with SessionLocal() as db:
        patient_user = db.scalar(select(User).where(User.email == PATIENT_EMAIL))
        if patient_user is None:
            patient_user = User(
                email=PATIENT_EMAIL,
                hashed_password=hash_password(PATIENT_PASSWORD),
                first_name=PATIENT_FIRST_NAME,
                last_name=PATIENT_LAST_NAME,
                age=PATIENT_AGE,
                role=UserRole.patient,
            )
            db.add(patient_user)
            db.flush()
        else:
            patient_user.hashed_password = hash_password(PATIENT_PASSWORD)
            patient_user.first_name = PATIENT_FIRST_NAME
            patient_user.last_name = PATIENT_LAST_NAME
            patient_user.age = PATIENT_AGE

        patient_profile = db.scalar(
            select(PatientProfile).where(PatientProfile.user_id == patient_user.id)
        )
        if patient_profile is None:
            patient_profile = PatientProfile(
                user_id=patient_user.id,
                diagnosis=PATIENT_DIAGNOSIS,
                medical_history=(
                    "Stage 1 hypertension diagnosed two years ago, managed with "
                    "lifestyle changes and follow-up."
                ),
                allergies="Penicillin",
                medications="Amlodipine 5 mg daily.",
                target_systolic=TARGET_SYSTOLIC,
                target_diastolic=TARGET_DIASTOLIC,
                measurements_per_day=len(MEASUREMENT_TIMES),
                measurement_times=list(MEASUREMENT_TIMES),
                timezone="UTC",
            )
            db.add(patient_profile)
            db.flush()

        caregiver_user = db.scalar(
            select(User).where(
                User.role == UserRole.caregiver,
                User.first_name == CAREGIVER_FIRST_NAME,
                User.last_name == CAREGIVER_LAST_NAME,
            )
        )
        if caregiver_user is None:
            caregiver_user = User(
                first_name=CAREGIVER_FIRST_NAME,
                last_name=CAREGIVER_LAST_NAME,
                role=UserRole.caregiver,
            )
            db.add(caregiver_user)
            db.flush()
        caregiver_profile = db.scalar(
            select(CaregiverProfile).where(
                CaregiverProfile.user_id == caregiver_user.id
            )
        )
        if caregiver_profile is None:
            caregiver_profile = CaregiverProfile(
                user_id=caregiver_user.id,
                relationship=CAREGIVER_RELATIONSHIP,
                phone=CAREGIVER_PHONE,
                login_code_hash=_hash_caregiver_code(CAREGIVER_CODE_RAW),
            )
            db.add(caregiver_profile)
            db.flush()
            db.add(
                CaregiverPatient(
                    caregiver_id=caregiver_profile.id,
                    patient_id=patient_profile.id,
                    priority=1,
                    notify_after_minutes=15,
                )
            )
        else:
            caregiver_profile.relationship = CAREGIVER_RELATIONSHIP
            caregiver_profile.phone = CAREGIVER_PHONE
            caregiver_profile.login_code_hash = _hash_caregiver_code(
                CAREGIVER_CODE_RAW
            )

        created = 0
        now = utcnow()
        for day_offset in range(READING_DAYS - 1, -1, -1):
            day = (now - timedelta(days=day_offset)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            for slot, hhmm in enumerate(MEASUREMENT_TIMES):
                hour, minute = (int(part) for part in hhmm.split(":"))
                measured_at = day.replace(hour=hour, minute=minute)
                client_reading_id = f"seed-{patient_profile.id}-{day_offset}-{slot}"
                exists = db.scalar(
                    select(BloodPressureReading.id).where(
                        BloodPressureReading.client_reading_id == client_reading_id
                    )
                )
                if (day_offset, slot) in MISSED_SLOTS:
                    stale = db.scalar(
                        select(BloodPressureReading).where(
                            BloodPressureReading.client_reading_id
                            == client_reading_id
                        )
                    )
                    if stale is not None:
                        db.delete(stale)
                    continue
                if exists is not None:
                    continue
                index = READING_DAYS - 1 - day_offset
                systolic, diastolic, pulse = _bp_values(index)
                db.add(
                    BloodPressureReading(
                        patient_id=patient_profile.id,
                        systolic=systolic,
                        diastolic=diastolic,
                        pulse=pulse,
                        measured_at=measured_at,
                        source="manual",
                        client_reading_id=client_reading_id,
                    )
                )
                created += 1

        schedule = db.scalar(
            select(ReminderSchedule).where(
                ReminderSchedule.patient_id == patient_profile.id
            )
        )
        if schedule is None:
            schedule = ReminderSchedule(
                patient_id=patient_profile.id,
                timezone="UTC",
                times=list(MEASUREMENT_TIMES),
                days_of_week=list(range(7)),
                grace_minutes=60,
                is_active=True,
            )
            db.add(schedule)
            db.flush()

        # Backfill the expected-measurement windows for the last few weeks so
        # adherence, the caregiver checklist and the escalation ring have real
        # history. Windows for missed slots stay ``pending``: the reminder job
        # then marks them missed and escalates them through the real code path.
        for day_offset in range(WINDOW_DAYS - 1, -1, -1):
            day = (now - timedelta(days=day_offset)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            for slot, hhmm in enumerate(MEASUREMENT_TIMES):
                hour, minute = (int(part) for part in hhmm.split(":"))
                due_at = day.replace(hour=hour, minute=minute)
                exists = db.scalar(
                    select(MeasurementWindow.id).where(
                        MeasurementWindow.patient_id == patient_profile.id,
                        MeasurementWindow.due_at == due_at,
                    )
                )
                if exists is not None:
                    continue
                missed = (day_offset, slot) in MISSED_SLOTS
                db.add(
                    MeasurementWindow(
                        patient_id=patient_profile.id,
                        due_at=due_at,
                        grace_minutes=60,
                        status="pending" if missed else "completed",
                        reminded_at=None if missed else due_at,
                    )
                )

        db.commit()
        generate_windows(db, now=utcnow())
        process_windows(db, now=utcnow())

        readings = (
            db.scalars(
                select(BloodPressureReading)
                .where(BloodPressureReading.patient_id == patient_profile.id)
                .order_by(BloodPressureReading.measured_at)
            )
            .all()
        )

        return {
            "patient_email": PATIENT_EMAIL,
            "patient_password": PATIENT_PASSWORD,
            "patient_name": f"{PATIENT_FIRST_NAME} {PATIENT_LAST_NAME}",
            "caregiver_name": f"{CAREGIVER_FIRST_NAME} {CAREGIVER_LAST_NAME}",
            "caregiver_relationship": CAREGIVER_RELATIONSHIP,
            "caregiver_login_code": f"{CAREGIVER_CODE_RAW[:4]}-{CAREGIVER_CODE_RAW[4:]}",
            "diagnosis": PATIENT_DIAGNOSIS,
            "targets": f"{TARGET_SYSTOLIC}/{TARGET_DIASTOLIC} mmHg",
            "readings_created": created,
            "readings_total": len(readings),
            "first_reading_at": readings[0].measured_at if readings else None,
            "last_reading_at": readings[-1].measured_at if readings else None,
            "windows": db.scalar(
                select(func.count())
                .select_from(MeasurementWindow)
                .where(MeasurementWindow.patient_id == patient_profile.id)
            ),
        }


if __name__ == "__main__":
    import json

    print(json.dumps(seed(), indent=2, default=str, ensure_ascii=False))
