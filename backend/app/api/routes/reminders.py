from datetime import timedelta

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.deps import DbSession, PatientUser
from app.core.timeutils import utcnow
from app.models.patient import PatientProfile
from app.models.reminder import MeasurementWindow
from app.schemas.reminder import (
    AdherenceSummary,
    MeasurementWindowRead,
    ReminderScheduleRead,
    ReminderScheduleUpsert,
    WindowSnooze,
)
from app.services import reminders as reminder_service

router = APIRouter(tags=["reminders"])


def _profile(user: PatientUser) -> PatientProfile:
    profile = user.patient_profile
    assert profile is not None
    return profile


@router.get(
    "/patients/me/reminders",
    response_model=ReminderScheduleRead | None,
    summary="My measurement schedule",
)
def get_my_schedule(
    current_user: PatientUser, db: DbSession
) -> ReminderScheduleRead | None:
    schedule = reminder_service.get_schedule(db, _profile(current_user).id)
    return ReminderScheduleRead.model_validate(schedule) if schedule else None


@router.put(
    "/patients/me/reminders",
    response_model=ReminderScheduleRead,
    summary="Create or replace my measurement schedule",
)
def set_my_schedule(
    payload: ReminderScheduleUpsert, current_user: PatientUser, db: DbSession
) -> ReminderScheduleRead:
    schedule = reminder_service.upsert_schedule(db, _profile(current_user), payload)
    return ReminderScheduleRead.model_validate(schedule)


@router.delete(
    "/patients/me/reminders",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete my measurement schedule",
)
def delete_my_schedule(current_user: PatientUser, db: DbSession) -> None:
    reminder_service.delete_schedule(db, _profile(current_user).id)


@router.get(
    "/patients/me/reminders/windows",
    response_model=list[MeasurementWindowRead],
    summary="Upcoming and recent measurement windows",
)
def list_my_windows(
    current_user: PatientUser,
    db: DbSession,
    days: int = Query(default=7, ge=1, le=90),
) -> list[MeasurementWindow]:
    start = utcnow() - timedelta(days=days)
    return list(
        db.scalars(
            select(MeasurementWindow)
            .where(
                MeasurementWindow.patient_id == _profile(current_user).id,
                MeasurementWindow.due_at >= start,
            )
            .order_by(MeasurementWindow.due_at)
        )
    )


@router.post(
    "/patients/me/reminders/windows/{window_id}/snooze",
    response_model=MeasurementWindowRead,
    summary="Move a pending measurement later (snooze)",
)
def snooze_my_window(
    window_id: int,
    payload: WindowSnooze,
    current_user: PatientUser,
    db: DbSession,
) -> MeasurementWindow:
    return reminder_service.snooze_window(
        db, _profile(current_user).id, window_id, payload.minutes
    )


@router.get(
    "/patients/me/adherence",
    response_model=AdherenceSummary,
    summary="How many expected measurements were actually taken",
)
def my_adherence(
    current_user: PatientUser,
    db: DbSession,
    days: int = Query(default=30, ge=1, le=365),
) -> AdherenceSummary:
    return reminder_service.adherence_summary(db, _profile(current_user).id, days=days)
