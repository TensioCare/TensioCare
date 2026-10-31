from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CaregiverUser, DbSession
from app.core.timeutils import utcnow
from app.models.caregiver import CaregiverPatient
from app.models.patient import PatientProfile
from app.models.reminder import MeasurementWindow
from app.schemas.reading import ReadingAnalysis, ReadingRead
from app.schemas.reminder import AdherenceSummary, MeasurementWindowRead
from app.schemas.user import (
    CaregiverSelfUpdate,
    LinkedPatientRead,
    LinkedPatientUpdate,
    UserRead,
)
from pydantic import BaseModel, Field
from typing import Optional


class CaregiverPatientSummary(BaseModel):
    model_config = {"from_attributes": True}

    patient_name: str
    patient_age: Optional[int] = None
    diagnosis: Optional[str] = None
    target_systolic: Optional[int] = None
    target_diastolic: Optional[int] = None
    measurement_times: list[str]
    timezone: str
    adherence_7d: AdherenceSummary
    windows_due_today: list[str]
    windows_status_today: list[str]
    recent_alerts: int  # count of unacknowledged escalations
from app.services import caregivers as caregiver_service
from app.services import reminders as reminder_service
from app.services.monitoring import (
    analyse_readings,
    caregiver_readings_csv,
    ensure_caregiver_can_access,
    get_patient_or_404,
    list_readings,
)

router = APIRouter(prefix="/caregivers", tags=["caregivers"])


def _load_link(db: Session, caregiver_id: int, patient_id: int) -> CaregiverPatient:
    link = db.scalar(
        select(CaregiverPatient)
        .options(
            selectinload(CaregiverPatient.patient).selectinload(PatientProfile.user)
        )
        .where(
            CaregiverPatient.caregiver_id == caregiver_id,
            CaregiverPatient.patient_id == patient_id,
        )
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This patient is not linked to your account",
        )
    return link


@router.get("/me/patients", response_model=list[LinkedPatientRead])
def list_my_patients(
    current_user: CaregiverUser, db: DbSession
) -> list[CaregiverPatient]:
    """The patient this caregiver follows (one account per patient)."""
    profile = current_user.caregiver_profile
    assert profile is not None

    links = db.scalars(
        select(CaregiverPatient)
        .options(
            selectinload(CaregiverPatient.patient).selectinload(PatientProfile.user)
        )
        .where(CaregiverPatient.caregiver_id == profile.id)
        .order_by(
            CaregiverPatient.priority,
            CaregiverPatient.created_at,
            CaregiverPatient.patient_id,
        )
    )
    return list(links)


@router.patch(
    "/me",
    response_model=UserRead,
    summary="Edit my own name, relationship and contact details",
)
def update_me(
    payload: CaregiverSelfUpdate, current_user: CaregiverUser, db: DbSession
) -> UserRead:
    user = caregiver_service.update_self(db, current_user, payload)
    return UserRead.model_validate(user)


@router.patch(
    "/me/patients/{patient_id}",
    response_model=LinkedPatientRead,
    summary="Change my place in the escalation ring",
)
def update_link(
    patient_id: int,
    payload: LinkedPatientUpdate,
    current_user: CaregiverUser,
    db: DbSession,
) -> CaregiverPatient:
    profile = current_user.caregiver_profile
    assert profile is not None

    link = _load_link(db, profile.id, patient_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(link, field, value)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/me/patients/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlink_patient(patient_id: int, current_user: CaregiverUser, db: DbSession) -> None:
    """Leave the patient. This deletes the caregiver account and its sessions."""
    profile = current_user.caregiver_profile
    assert profile is not None
    caregiver_service.remove_caregiver(db, patient_id, profile.id)


@router.get("/me/patients/{patient_id}/readings", response_model=list[ReadingRead])
def read_patient_readings(
    patient_id: int,
    current_user: CaregiverUser,
    db: DbSession,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[ReadingRead]:
    """Readings of a patient this caregiver is linked to."""
    patient = get_patient_or_404(db, patient_id)
    ensure_caregiver_can_access(db, current_user, patient_id)

    readings = list_readings(
        db, patient.id, start=start, end=end, limit=limit, offset=offset
    )
    return [ReadingRead.model_validate(reading) for reading in readings]


@router.get(
    "/me/patients/{patient_id}/readings/export.csv",
    response_class=Response,
    summary="Download a linked patient's readings as CSV",
)
def export_patient_readings(
    patient_id: int,
    current_user: CaregiverUser,
    db: DbSession,
    start: datetime | None = None,
    end: datetime | None = None,
) -> Response:
    get_patient_or_404(db, patient_id)
    content = caregiver_readings_csv(db, current_user, patient_id, start, end)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="readings.csv"'},
    )


@router.get("/me/patients/{patient_id}/analysis", response_model=ReadingAnalysis)
def analyse_patient_readings(
    patient_id: int,
    current_user: CaregiverUser,
    db: DbSession,
    days: int = Query(default=7, ge=1, le=365),
) -> ReadingAnalysis:
    patient = get_patient_or_404(db, patient_id)
    ensure_caregiver_can_access(db, current_user, patient_id)
    return analyse_readings(db, patient, days)


@router.get(
    "/me/patients/{patient_id}/windows",
    response_model=list[MeasurementWindowRead],
    summary="Measurement times and whether they were taken (no readings)",
)
def patient_windows(
    patient_id: int,
    current_user: CaregiverUser,
    db: DbSession,
    days: int = Query(default=7, ge=1, le=90),
) -> list[MeasurementWindow]:
    """The caregiver view is timing only: due times and completion status."""
    get_patient_or_404(db, patient_id)
    ensure_caregiver_can_access(db, current_user, patient_id)

    start = utcnow() - timedelta(days=days)
    return list(
        db.scalars(
            select(MeasurementWindow)
            .where(
                MeasurementWindow.patient_id == patient_id,
                MeasurementWindow.due_at >= start,
            )
            .order_by(MeasurementWindow.due_at)
        )
    )


@router.get(
    "/me/patients/{patient_id}/adherence",
    response_model=AdherenceSummary,
    summary="How many expected measurements the patient actually took",
)
def patient_adherence(
    patient_id: int,
    current_user: CaregiverUser,
    db: DbSession,
    days: int = Query(default=30, ge=1, le=365),
) -> AdherenceSummary:
    get_patient_or_404(db, patient_id)
    ensure_caregiver_can_access(db, current_user, patient_id)
    return reminder_service.adherence_summary(db, patient_id, days=days)


@router.get(
    "/me/patients/{patient_id}/summary",
    response_model=CaregiverPatientSummary,
    summary="Patient summary for caregiver assistant (RAG context)",
)
def patient_summary(
    patient_id: int,
    current_user: CaregiverUser,
    db: DbSession,
) -> CaregiverPatientSummary:
    """Return aggregated data for the caregiver RAG assistant.

    This endpoint does **not** return raw readings or measurement windows;
    it only returns aggregates that a LLM or rule‑based assistant can use
    to answer caregiver questions without exposing personal health data.
    """
    from app.models.patient import PatientProfile
    from app.models.reminder import MeasurementWindow

    patient = get_patient_or_404(db, patient_id)
    ensure_caregiver_can_access(db, current_user, patient_id)

    # --- basic patient info ---
    name = f"{patient.user.first_name} {patient.user.last_name}".strip()
    age = None
    # we don't store age; compute from birthdate if needed – omit for now.

    # --- diagnosis / targets ---
    diagnosis = patient.diagnosis
    target_systolic = patient.target_systolic
    target_diastolic = patient.target_diastolic

    # --- measurement times from profile ---
    times = patient.measurement_times or []
    tz = patient.timezone

    # --- 7‑day adherence ---
    adherence = reminder_service.adherence_summary(db, patient.id, days=7)

    # --- windows due today (next 24h) ---
    now = utcnow()
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    windows = db.scalars(
        select(MeasurementWindow).where(
            MeasurementWindow.patient_id == patient_id,
            MeasurementWindow.due_at >= today_start,
            MeasurementWindow.due_at < today_end,
        )
    ).all()
    windows_due = [
        w.due_at.strftime("%I:%M %p").lstrip("0") for w in windows
    ]
    windows_status = [
        w.status if w.status in ("pending", "completed", "missed", "escalated") else "pending" for w in windows
    ]

    # --- recent alerts (unacknowledged escalations) ---
    # Count escalated windows that haven't been acknowledged yet.
    recent_alerts = db.scalar(
        select(func.count()).select_from(MeasurementWindow).where(
            MeasurementWindow.patient_id == patient_id,
            MeasurementWindow.status == "escalated",
            MeasurementWindow.acknowledged_at.is_(None),
        )
    )

    return CaregiverPatientSummary(
        patient_name=name,
        patient_age=age,
        diagnosis=diagnosis,
        target_systolic=target_systolic,
        target_diastolic=target_diastolic,
        measurement_times=times,
        timezone=tz,
        adherence_7d=adherence,
        windows_due_today=windows_due,
        windows_status_today=windows_status,
        recent_alerts=recent_alerts or 0,
    )
