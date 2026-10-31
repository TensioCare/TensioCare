import csv
import io
from collections import Counter
from datetime import datetime, timedelta
from statistics import mean

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.bp import (
    MIN_READINGS_FOR_TREND,
    BPCategory,
    BPTrend,
    trend_from_averages,
)
from app.core.timeutils import to_naive_utc, utcnow
from app.models.caregiver import CaregiverPatient
from app.models.device import Device
from app.models.patient import PatientProfile
from app.models.reading import BloodPressureReading
from app.models.user import User
from app.schemas.reading import (
    DailyReadingStats,
    PeriodComparison,
    ReadingAnalysis,
    ReadingCreate,
    ReadingRead,
    ReadingUpdate,
)
from app.services.reminders import close_windows_for_reading


def get_latest_reading(db: Session, patient_id: int) -> BloodPressureReading | None:
    return db.scalar(
        select(BloodPressureReading)
        .where(BloodPressureReading.patient_id == patient_id)
        .order_by(
            BloodPressureReading.measured_at.desc(), BloodPressureReading.id.desc()
        )
        .limit(1)
    )


def list_readings(
    db: Session,
    patient_id: int,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[BloodPressureReading]:
    stmt = select(BloodPressureReading).where(
        BloodPressureReading.patient_id == patient_id
    )
    if start is not None:
        stmt = stmt.where(BloodPressureReading.measured_at >= to_naive_utc(start))
    if end is not None:
        stmt = stmt.where(BloodPressureReading.measured_at <= to_naive_utc(end))

    stmt = (
        stmt.order_by(
            BloodPressureReading.measured_at.desc(), BloodPressureReading.id.desc()
        )
        .offset(offset)
        .limit(limit)
    )
    return list(db.scalars(stmt))


def create_reading(
    db: Session, patient: PatientProfile, payload: ReadingCreate
) -> BloodPressureReading:
    device: Device | None = None
    if payload.device_serial:
        device = db.scalar(
            select(Device).where(
                Device.serial_number == payload.device_serial,
                Device.patient_id == patient.id,
            )
        )
        if device is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Device '{payload.device_serial}' is not registered "
                    "for this patient"
                ),
            )
        if not device.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Device is disabled",
            )

    if payload.client_reading_id:
        existing = _find_by_client_id(db, patient.id, payload.client_reading_id)
        if existing is not None:
            return existing

    measured_at = to_naive_utc(payload.measured_at) if payload.measured_at else utcnow()
    if measured_at > utcnow() + timedelta(minutes=5):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="measured_at cannot be in the future",
        )

    reading = BloodPressureReading(
        patient_id=patient.id,
        device_id=device.id if device else None,
        systolic=payload.systolic,
        diastolic=payload.diastolic,
        pulse=payload.pulse,
        measured_at=measured_at,
        notes=payload.notes,
        symptoms=", ".join(payload.symptoms) if payload.symptoms else None,
        source="device" if device else "manual",
        arm=payload.arm,
        position=payload.position,
        resting_minutes=payload.resting_minutes,
        client_reading_id=payload.client_reading_id,
    )
    if device is not None:
        device.last_synced_at = utcnow()

    db.add(reading)
    try:
        db.commit()
    except IntegrityError:
        # Retried upload with the same client_reading_id: return the original.
        db.rollback()
        if payload.client_reading_id:
            existing = _find_by_client_id(db, patient.id, payload.client_reading_id)
            if existing is not None:
                return existing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reading could not be saved",
        ) from None

    db.refresh(reading)

    # A reading satisfies the measurement window it falls into (if any).
    close_windows_for_reading(db, reading)

    # Best-effort: if this reading pushes the patient into critical risk,
    # notify the patient and linked caregivers. Never break reading creation.
    try:
        from app.services import risk as risk_service

        assessment = risk_service.assess_risk(db, patient)
        if assessment.risk_level == "critical":
            risk_service.notify_caregivers_of_critical_risk(db, patient, assessment)
    except Exception:  # noqa: BLE001
        pass

    return reading


def _find_by_client_id(
    db: Session, patient_id: int, client_reading_id: str
) -> BloodPressureReading | None:
    return db.scalar(
        select(BloodPressureReading).where(
            BloodPressureReading.patient_id == patient_id,
            BloodPressureReading.client_reading_id == client_reading_id,
        )
    )


def update_reading(
    db: Session,
    patient_id: int,
    reading_id: int,
    payload: ReadingUpdate,
) -> BloodPressureReading:
    reading = db.get(BloodPressureReading, reading_id)
    if reading is None or reading.patient_id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reading not found"
        )

    changes = payload.model_dump(exclude_unset=True)

    if "measured_at" in changes:
        if changes["measured_at"] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="measured_at cannot be null",
            )
        changes["measured_at"] = to_naive_utc(changes["measured_at"])
        if changes["measured_at"] > utcnow() + timedelta(minutes=5):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="measured_at cannot be in the future",
            )

    systolic = changes.get("systolic", reading.systolic)
    diastolic = changes.get("diastolic", reading.diastolic)
    if systolic <= diastolic:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="systolic must be greater than diastolic",
        )

    if "symptoms" in changes and changes["symptoms"] is not None:
        changes["symptoms"] = (
            ", ".join(changes["symptoms"]) if changes["symptoms"] else None
        )

    for field, value in changes.items():
        setattr(reading, field, value)

    db.commit()
    db.refresh(reading)

    # A changed timestamp might satisfy a different open window.
    close_windows_for_reading(db, reading)
    return reading


def delete_reading(db: Session, patient_id: int, reading_id: int) -> None:
    reading = db.get(BloodPressureReading, reading_id)
    if reading is None or reading.patient_id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reading not found"
        )
    db.delete(reading)
    db.commit()


def readings_csv(
    db: Session,
    patient_id: int,
    start: datetime | None = None,
    end: datetime | None = None,
) -> str:
    """CSV export, oldest first, for spreadsheets or a clinician."""
    return _readings_csv(list_readings(db, patient_id, start, end, limit=5000))


def caregiver_readings_csv(
    db: Session,
    caregiver_user: User,
    patient_id: int,
    start: datetime | None = None,
    end: datetime | None = None,
) -> str:
    ensure_caregiver_can_access(db, caregiver_user, patient_id)
    return readings_csv(db, patient_id, start, end)


def _readings_csv(readings: list[BloodPressureReading]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "measured_at_utc",
            "systolic",
            "diastolic",
            "pulse",
            "category",
            "pulse_pressure",
            "mean_arterial_pressure",
            "source",
            "arm",
            "position",
            "resting_minutes",
            "notes",
        ]
    )
    for reading in reversed(readings):
        writer.writerow(
            [
                reading.measured_at.isoformat(),
                reading.systolic,
                reading.diastolic,
                reading.pulse or "",
                reading.category.value,
                reading.pulse_pressure,
                reading.mean_arterial_pressure,
                reading.source,
                reading.arm or "",
                reading.position or "",
                reading.resting_minutes if reading.resting_minutes is not None else "",
                (reading.notes or "").replace("\n", " "),
            ]
        )
    return buffer.getvalue()


def _readings_between(
    db: Session, patient_id: int, start: datetime, end: datetime
) -> list[BloodPressureReading]:
    return list(
        db.scalars(
            select(BloodPressureReading)
            .where(
                BloodPressureReading.patient_id == patient_id,
                BloodPressureReading.measured_at >= start,
                BloodPressureReading.measured_at <= end,
            )
            .order_by(
                BloodPressureReading.measured_at.asc(),
                BloodPressureReading.id.asc(),
            )
        )
    )


def _daily_stats(
    readings: list[BloodPressureReading],
    target_systolic: int | None,
    target_diastolic: int | None,
) -> list[DailyReadingStats]:
    buckets: dict[object, list[BloodPressureReading]] = {}
    for reading in readings:
        buckets.setdefault(reading.measured_at.date(), []).append(reading)

    stats: list[DailyReadingStats] = []
    for day in sorted(buckets):
        items = buckets[day]
        pulses = [item.pulse for item in items if item.pulse is not None]
        stats.append(
            DailyReadingStats(
                date=day,  # type: ignore[arg-type]
                reading_count=len(items),
                average_systolic=round(mean(item.systolic for item in items), 1),
                average_diastolic=round(mean(item.diastolic for item in items), 1),
                average_pulse=round(mean(pulses), 1) if pulses else None,
                min_systolic=min(item.systolic for item in items),
                max_systolic=max(item.systolic for item in items),
                readings_above_target=sum(
                    1
                    for item in items
                    if (target_systolic is not None and item.systolic > target_systolic)
                    or (
                        target_diastolic is not None
                        and item.diastolic > target_diastolic
                    )
                ),
            )
        )
    return stats


def analyse_readings(
    db: Session, patient: PatientProfile, days: int
) -> ReadingAnalysis:
    now = utcnow()
    start = now - timedelta(days=days)
    readings = _readings_between(db, patient.id, start, now)

    target_systolic = patient.target_systolic
    target_diastolic = patient.target_diastolic

    if not readings:
        return ReadingAnalysis(
            period_days=days,
            reading_count=0,
            target_systolic=target_systolic,
            target_diastolic=target_diastolic,
            trend=BPTrend.not_enough_data,
            alerts=["No readings recorded in this period"],
        )

    systolic_values = [reading.systolic for reading in readings]
    diastolic_values = [reading.diastolic for reading in readings]
    pulse_values = [reading.pulse for reading in readings if reading.pulse is not None]

    average_systolic = round(mean(systolic_values), 1)
    average_diastolic = round(mean(diastolic_values), 1)
    average_pulse = round(mean(pulse_values), 1) if pulse_values else None

    category_counts = Counter(reading.category.value for reading in readings)

    above_target = 0
    comparable = 0
    if target_systolic is not None or target_diastolic is not None:
        for reading in readings:
            comparable += 1
            within_systolic = (
                target_systolic is None or reading.systolic <= target_systolic
            )
            within_diastolic = (
                target_diastolic is None or reading.diastolic <= target_diastolic
            )
            if not (within_systolic and within_diastolic):
                above_target += 1

    in_target_percent = (
        round((comparable - above_target) / comparable * 100, 1) if comparable else None
    )

    if len(readings) >= MIN_READINGS_FOR_TREND:
        half = len(readings) // 2
        trend = trend_from_averages(
            mean(systolic_values[:half]), mean(systolic_values[half:])
        )
    else:
        trend = BPTrend.not_enough_data

    previous = _readings_between(db, patient.id, start - timedelta(days=days), start)
    previous_period = None
    if previous:
        previous_systolic = round(mean(item.systolic for item in previous), 1)
        previous_diastolic = round(mean(item.diastolic for item in previous), 1)
        previous_pulses = [item.pulse for item in previous if item.pulse is not None]
        delta_systolic = round(average_systolic - previous_systolic, 1)
        delta_diastolic = round(average_diastolic - previous_diastolic, 1)
        if abs(delta_systolic) < 2 and abs(delta_diastolic) < 2:
            direction = "stable"
        elif delta_systolic < 0:
            direction = "better"
        else:
            direction = "worse"
        previous_period = PeriodComparison(
            period_days=days,
            reading_count=len(previous),
            average_systolic=previous_systolic,
            average_diastolic=previous_diastolic,
            average_pulse=(
                round(mean(previous_pulses), 1) if previous_pulses else None
            ),
            delta_systolic=delta_systolic,
            delta_diastolic=delta_diastolic,
            direction=direction,
        )

    latest_reading = readings[-1]
    alerts: list[str] = []

    crisis_count = category_counts.get(BPCategory.crisis.value, 0)
    if crisis_count:
        alerts.append(
            f"{crisis_count} hypertensive crisis reading(s) (>180/120) "
            "in this period - needs immediate review"
        )
    if average_systolic >= 140 or average_diastolic >= 90:
        alerts.append("Average blood pressure is in stage 2 range")
    elif average_systolic >= 130 or average_diastolic >= 80:
        alerts.append("Average blood pressure is in stage 1 range")
    if above_target:
        alerts.append(f"{above_target} of {comparable} readings are above the target")
    if trend is BPTrend.worsening:
        alerts.append("Systolic average is rising across this period")
    if latest_reading.category is BPCategory.crisis:
        alerts.append("The latest reading is in crisis range")
    if previous_period is not None and previous_period.direction == "worse":
        alerts.append("Average blood pressure is worse than the previous period")

    return ReadingAnalysis(
        period_days=days,
        reading_count=len(readings),
        average_systolic=average_systolic,
        average_diastolic=average_diastolic,
        average_pulse=average_pulse,
        min_systolic=min(systolic_values),
        max_systolic=max(systolic_values),
        min_diastolic=min(diastolic_values),
        max_diastolic=max(diastolic_values),
        latest_reading=ReadingRead.model_validate(latest_reading),
        category_counts=dict(category_counts),
        daily=_daily_stats(readings, target_systolic, target_diastolic),
        previous_period=previous_period,
        target_systolic=target_systolic,
        target_diastolic=target_diastolic,
        readings_above_target=above_target,
        in_target_percent=in_target_percent,
        trend=trend,
        alerts=alerts,
    )


def get_patient_or_404(db: Session, patient_id: int) -> PatientProfile:
    patient = db.get(PatientProfile, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient {patient_id} not found",
        )
    return patient


def ensure_caregiver_can_access(
    db: Session, caregiver_user: User, patient_id: int
) -> None:
    caregiver_profile = caregiver_user.caregiver_profile
    assert caregiver_profile is not None
    link = db.get(CaregiverPatient, (caregiver_profile.id, patient_id))
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This patient is not linked to your account",
        )
