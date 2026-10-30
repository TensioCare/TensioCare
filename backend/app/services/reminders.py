import logging
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.timeutils import to_naive_utc, utcnow
from app.models.caregiver import CaregiverPatient, CaregiverProfile
from app.models.patient import PatientProfile
from app.models.reminder import MeasurementWindow, ReminderSchedule
from app.schemas.reminder import AdherenceSummary, ReminderScheduleUpsert
from app.services.notifications import notify

logger = logging.getLogger(__name__)

# How far ahead windows are materialised by the scheduler.
HORIZON = timedelta(hours=36)
OPEN_STATUSES = ("pending", "missed", "escalated")
# A reading this early still satisfies the upcoming scheduled measurement.
EARLY_MATCH = timedelta(minutes=60)


def get_schedule(db: Session, patient_id: int) -> ReminderSchedule | None:
    return db.scalar(
        select(ReminderSchedule).where(ReminderSchedule.patient_id == patient_id)
    )


def upsert_schedule(
    db: Session, patient: PatientProfile, payload: ReminderScheduleUpsert
) -> ReminderSchedule:
    schedule = get_schedule(db, patient.id)
    if schedule is None:
        schedule = ReminderSchedule(patient_id=patient.id)
        db.add(schedule)

    schedule.timezone = payload.timezone
    schedule.times = payload.times
    schedule.days_of_week = payload.days_of_week
    schedule.grace_minutes = payload.grace_minutes
    schedule.is_active = payload.is_active

    # The patient profile exposes the same plan; keep both in sync.
    patient.measurements_per_day = len(payload.times)
    patient.measurement_times = payload.times
    patient.timezone = payload.timezone

    db.commit()
    db.refresh(schedule)
    if schedule.is_active:
        # Show upcoming measurements immediately instead of waiting for the
        # next scheduler tick.
        materialize_schedule(db, schedule)
    return schedule


def set_measurement_plan(
    db: Session,
    patient: PatientProfile,
    times: list[str],
    timezone_name: str | None = None,
) -> ReminderSchedule | None:
    """Set the patient's measurement plan from the profile fields.

    ``times=[]`` disables reminders and clears the plan. An existing schedule
    keeps its weekdays, grace period and active flag.
    """
    if timezone_name:
        patient.timezone = timezone_name

    if not times:
        delete_schedule(db, patient.id)
        return None

    existing = get_schedule(db, patient.id)
    payload = ReminderScheduleUpsert(
        timezone=patient.timezone,
        times=times,
        days_of_week=(existing.days_of_week if existing else [0, 1, 2, 3, 4, 5, 6]),
        grace_minutes=existing.grace_minutes if existing else 60,
        is_active=existing.is_active if existing else True,
    )
    return upsert_schedule(db, patient, payload)


def delete_schedule(db: Session, patient_id: int) -> None:
    schedule = get_schedule(db, patient_id)
    if schedule is not None:
        db.delete(schedule)

    patient = db.get(PatientProfile, patient_id)
    if patient is not None:
        patient.measurements_per_day = None
        patient.measurement_times = []

    db.commit()


def generate_windows(db: Session, now: datetime | None = None) -> int:
    """Materialise upcoming measurement windows from every active schedule."""
    now = to_naive_utc(now) if now is not None else utcnow()
    schedules = db.scalars(
        select(ReminderSchedule).where(ReminderSchedule.is_active.is_(True))
    ).all()

    created = 0
    for schedule in schedules:
        created += _materialize(db, schedule, now)

    db.commit()
    return created


def materialize_schedule(
    db: Session, schedule: ReminderSchedule, now: datetime | None = None
) -> int:
    """Create upcoming windows for one schedule (used right after an edit)."""
    now = to_naive_utc(now) if now is not None else utcnow()
    created = _materialize(db, schedule, now)
    db.commit()
    return created


def _materialize(db: Session, schedule: ReminderSchedule, now: datetime) -> int:
    try:
        tz = ZoneInfo(schedule.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Schedule %s has an invalid timezone", schedule.id)
        return 0

    created = 0
    local_now = now.replace(tzinfo=timezone.utc).astimezone(tz)
    earliest = now - timedelta(days=1)
    if schedule.updated_at is not None:
        plan_updated = to_naive_utc(schedule.updated_at)
        # Do not backfill windows for times that passed before the plan was
        # last edited (a new 08:00 plan created at 10:00 should not alert).
        if plan_updated <= now and plan_updated > earliest:
            earliest = plan_updated

    for day_offset in range(3):
        local_date = (local_now + timedelta(days=day_offset)).date()
        active_days = schedule.days_of_week or list(range(7))
        if local_date.weekday() not in active_days:
            continue
        for hhmm in schedule.times:
            hour, minute = (int(part) for part in hhmm.split(":"))
            local_due = datetime.combine(local_date, time(hour, minute), tzinfo=tz)
            due_at = to_naive_utc(local_due)
            if due_at > now + HORIZON or due_at < earliest:
                continue
            exists = db.scalar(
                select(MeasurementWindow.id).where(
                    MeasurementWindow.patient_id == schedule.patient_id,
                    MeasurementWindow.due_at == due_at,
                )
            )
            if exists is not None:
                continue
            db.add(
                MeasurementWindow(
                    patient_id=schedule.patient_id,
                    due_at=due_at,
                    grace_minutes=schedule.grace_minutes,
                    status="pending",
                    created_at=now,
                )
            )
            created += 1

    return created


def snooze_window(
    db: Session, patient_id: int, window_id: int, minutes: int
) -> MeasurementWindow:
    """Move a pending window forward, so a new reminder is sent later."""
    window = db.get(MeasurementWindow, window_id)
    if window is None or window.patient_id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Measurement window not found"
        )
    if window.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a pending measurement can be snoozed",
        )

    new_due = to_naive_utc(window.due_at) + timedelta(minutes=minutes)
    collision = db.scalar(
        select(MeasurementWindow.id).where(
            MeasurementWindow.patient_id == patient_id,
            MeasurementWindow.due_at == new_due,
            MeasurementWindow.id != window.id,
        )
    )
    if collision is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another measurement is already scheduled at that time",
        )

    window.due_at = new_due
    window.reminded_at = None
    window.next_escalation_at = None
    db.commit()
    db.refresh(window)
    return window


def close_windows_for_reading(db: Session, reading: object) -> int:
    """Mark the window that this reading satisfies as completed.

    A reading counts if it is taken up to ``EARLY_MATCH`` before the scheduled
    time (people often measure a little early) or within the grace period after
    it. Only the nearest open window is closed, so one reading cannot satisfy
    two scheduled measurements.
    """
    patient_id = reading.patient_id  # type: ignore[attr-defined]
    measured_at = to_naive_utc(reading.measured_at)  # type: ignore[attr-defined]

    candidates = db.scalars(
        select(MeasurementWindow).where(
            MeasurementWindow.patient_id == patient_id,
            MeasurementWindow.status.in_(OPEN_STATUSES),
            MeasurementWindow.due_at >= measured_at - timedelta(days=1),
            MeasurementWindow.due_at <= measured_at + EARLY_MATCH,
        )
    ).all()
    if not candidates:
        return 0

    window = min(
        candidates,
        key=lambda item: abs(to_naive_utc(item.due_at) - measured_at),
    )
    due_at = to_naive_utc(window.due_at)
    deadline = due_at + timedelta(minutes=window.grace_minutes)

    if due_at - EARLY_MATCH <= measured_at <= deadline:
        window.status = "completed"
        window.resolved_at = measured_at
        window.next_escalation_at = None
        db.commit()
        return 1
    return 0


def _ordered_links(db: Session, patient_id: int) -> list[CaregiverPatient]:
    return list(
        db.scalars(
            select(CaregiverPatient)
            .options(
                selectinload(CaregiverPatient.caregiver).selectinload(
                    CaregiverProfile.user
                )
            )
            .where(CaregiverPatient.patient_id == patient_id)
            .order_by(
                CaregiverPatient.priority,
                CaregiverPatient.created_at,
                CaregiverPatient.caregiver_id,
            )
        )
    )


def _patient_name(window: MeasurementWindow) -> str:
    return window.patient.first_name


def _escalate(db: Session, window: MeasurementWindow, now: datetime) -> str:
    """Notify the next caregiver in the ring, or mark the window unresolved."""
    links = _ordered_links(db, window.patient_id)
    name = _patient_name(window)

    if not links or window.escalation_level >= len(links):
        window.status = "unresolved"
        window.next_escalation_at = None
        for link in links:
            notify(
                db,
                user_id=link.caregiver.user_id,
                type="escalation_unresolved",
                title=f"No one acknowledged {name}",
                body=(
                    f"{name} still has not measured their blood pressure and "
                    "nobody acknowledged the alert."
                ),
                data={
                    "patient_id": window.patient_id,
                    "window_id": window.id,
                    "due_at": window.due_at.isoformat(),
                },
                window_id=window.id,
            )
        notify(
            db,
            user_id=window.patient.user_id,
            type="escalation_unresolved",
            title="No one acknowledged the alert",
            body=(
                f"Nobody acknowledged the alert that {name} missed a measurement. "
                "Please measure now or contact your caregiver."
            ),
            data={
                "patient_id": window.patient_id,
                "window_id": window.id,
                "due_at": window.due_at.isoformat(),
            },
            window_id=window.id,
        )
        return "unresolved"

    link = links[window.escalation_level]
    notify(
        db,
        user_id=link.caregiver.user_id,
        type="caregiver_escalation",
        title=f"{name} missed a measurement",
        body=(
            f"{name} has not measured their blood pressure since "
            f"{window.due_at:%Y-%m-%d %H:%M} UTC. Please check on them."
        ),
        data={
            "patient_id": window.patient_id,
            "window_id": window.id,
            "due_at": window.due_at.isoformat(),
            "requires_acknowledgement": True,
        },
        window_id=window.id,
    )
    window.status = "escalated"
    window.escalated_at = window.escalated_at or now
    window.escalation_level += 1
    window.next_escalation_at = now + timedelta(minutes=link.notify_after_minutes)
    return "escalated"


def process_windows(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Send reminders, mark misses and advance the caregiver escalation ring."""
    now = to_naive_utc(now) if now is not None else utcnow()
    summary = {"reminders": 0, "missed": 0, "escalations": 0, "unresolved": 0}

    pending = db.scalars(
        select(MeasurementWindow)
        .options(
            selectinload(MeasurementWindow.patient).selectinload(PatientProfile.user)
        )
        .where(
            MeasurementWindow.status == "pending",
            MeasurementWindow.due_at <= now,
        )
    ).all()

    for window in pending:
        due_at = to_naive_utc(window.due_at)
        deadline = due_at + timedelta(minutes=window.grace_minutes)
        if now >= deadline:
            window.status = "missed"
            window.missed_at = now
            notify(
                db,
                user_id=window.patient.user_id,
                type="measurement_missed",
                title="You missed a measurement",
                body=(
                    "You did not record your blood pressure in time. "
                    "Please measure as soon as you can."
                ),
                data={
                    "patient_id": window.patient_id,
                    "window_id": window.id,
                    "due_at": window.due_at.isoformat(),
                },
                window_id=window.id,
            )
            summary["missed"] += 1
            outcome = _escalate(db, window, now)
            summary["escalations" if outcome == "escalated" else outcome] += 1
        elif window.reminded_at is None:
            notify(
                db,
                user_id=window.patient.user_id,
                type="measurement_reminder",
                title="Time to measure your blood pressure",
                body="It's time for your scheduled blood pressure measurement.",
                data={
                    "patient_id": window.patient_id,
                    "window_id": window.id,
                    "due_at": window.due_at.isoformat(),
                },
                window_id=window.id,
            )
            window.reminded_at = now
            summary["reminders"] += 1

    escalating = db.scalars(
        select(MeasurementWindow)
        .options(
            selectinload(MeasurementWindow.patient).selectinload(PatientProfile.user)
        )
        .where(
            MeasurementWindow.status == "escalated",
            MeasurementWindow.next_escalation_at.is_not(None),
            MeasurementWindow.next_escalation_at <= now,
        )
    ).all()

    for window in escalating:
        outcome = _escalate(db, window, now)
        summary["escalations" if outcome == "escalated" else outcome] += 1

    db.commit()
    return summary


def adherence_summary(db: Session, patient_id: int, days: int = 30) -> AdherenceSummary:
    now = utcnow()
    start = now - timedelta(days=days)
    windows = db.scalars(
        select(MeasurementWindow).where(
            MeasurementWindow.patient_id == patient_id,
            MeasurementWindow.due_at >= start,
            MeasurementWindow.due_at <= now,
        )
    ).all()

    # A pending window whose grace period has not expired yet is not a miss.
    windows = [
        item
        for item in windows
        if item.status != "pending"
        or to_naive_utc(item.due_at) + timedelta(minutes=item.grace_minutes) <= now
    ]

    expected = len(windows)
    completed = sum(1 for item in windows if item.status == "completed")
    # An acknowledged escalation means the patient still missed the measurement.
    missed = sum(1 for item in windows if item.status in {"missed", "acknowledged"})
    escalated = sum(1 for item in windows if item.status == "escalated")
    unresolved = sum(1 for item in windows if item.status == "unresolved")
    last_completed = max(
        (item.resolved_at for item in windows if item.resolved_at is not None),
        default=None,
    )

    return AdherenceSummary(
        period_days=days,
        expected=expected,
        completed=completed,
        missed=missed,
        escalated=escalated,
        unresolved=unresolved,
        adherence_percent=(round(completed / expected * 100, 1) if expected else None),
        last_completed_at=last_completed,
    )
