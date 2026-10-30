from fastapi import APIRouter, HTTPException, status

from app.api.deps import DbSession, PatientUser
from app.models.caregiver import CaregiverPatient, CaregiverProfile
from app.models.patient import PatientProfile
from app.schemas.user import (
    CaregiverCodeRead,
    CaregiverCreate,
    PatientCaregiverRead,
    PatientCaregiverUpdate,
    PatientProfileRead,
    PatientProfileUpdate,
)
from app.services import caregivers as caregiver_service
from app.services import reminders as reminder_service

router = APIRouter(prefix="/patients", tags=["patients"])


def _patient_profile(user: PatientUser) -> PatientProfile:
    profile = user.patient_profile
    assert profile is not None
    return profile


def _code_response(
    db: DbSession, patient_id: int, profile: CaregiverProfile, code: str
) -> CaregiverCodeRead:
    link = caregiver_service.get_link(db, patient_id, profile.id)
    return CaregiverCodeRead(
        caregiver_id=profile.id,
        user_id=profile.user_id,
        first_name=profile.user.first_name,
        last_name=profile.user.last_name,
        relationship=profile.relationship,
        priority=link.priority,
        notify_after_minutes=link.notify_after_minutes,
        code=code,
    )


@router.get("/me", response_model=PatientProfileRead)
def read_my_profile(current_user: PatientUser) -> PatientProfile:
    return _patient_profile(current_user)


@router.patch("/me", response_model=PatientProfileRead)
def update_my_profile(
    payload: PatientProfileUpdate,
    current_user: PatientUser,
    db: DbSession,
) -> PatientProfile:
    """Update diagnosis, history, targets or the measurement plan."""
    profile = _patient_profile(current_user)
    changes = payload.model_dump(exclude_unset=True)

    times_provided = "measurement_times" in changes
    count_provided = "measurements_per_day" in changes
    timezone_provided = "timezone" in changes

    requested_times = changes.pop("measurement_times", None)
    requested_count = changes.pop("measurements_per_day", None)
    requested_timezone = changes.pop("timezone", None)

    for field, value in changes.items():
        setattr(profile, field, value)

    if times_provided:
        times = requested_times or []
        if requested_count is not None and requested_count != len(times):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "measurements_per_day must match the number of measurement_times"
                ),
            )
        reminder_service.set_measurement_plan(db, profile, times, requested_timezone)
    elif count_provided:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="measurement_times is required when measurements_per_day is set",
        )
    elif timezone_provided and requested_timezone:
        profile.timezone = requested_timezone
        schedule = reminder_service.get_schedule(db, profile.id)
        if schedule is not None:
            schedule.timezone = requested_timezone

    db.commit()
    db.refresh(profile)
    return profile


@router.get(
    "/me/caregivers",
    response_model=list[PatientCaregiverRead],
    summary="Caregivers looking after me, in escalation order",
)
def list_my_caregivers(
    current_user: PatientUser, db: DbSession
) -> list[PatientCaregiverRead]:
    profile = _patient_profile(current_user)
    links = caregiver_service.list_links(db, profile.id)
    return [_caregiver_read(link) for link in links]


def _caregiver_read(link: CaregiverPatient) -> PatientCaregiverRead:
    return PatientCaregiverRead(
        caregiver_id=link.caregiver_id,
        caregiver_user_id=link.caregiver.user_id,
        first_name=link.caregiver.user.first_name,
        last_name=link.caregiver.user.last_name,
        relationship=link.caregiver.relationship,
        phone=link.caregiver.phone,
        notes=link.caregiver.notes,
        priority=link.priority,
        notify_after_minutes=link.notify_after_minutes,
        status=link.caregiver.status,
        claimed_at=link.caregiver.claimed_at,
    )


@router.patch(
    "/me/caregivers/{caregiver_id}",
    response_model=PatientCaregiverRead,
    summary="Edit a caregiver or move them in the escalation ring",
)
def update_caregiver(
    caregiver_id: int,
    payload: PatientCaregiverUpdate,
    current_user: PatientUser,
    db: DbSession,
) -> PatientCaregiverRead:
    patient = _patient_profile(current_user)
    link = caregiver_service.update_caregiver(db, patient.id, caregiver_id, payload)
    return _caregiver_read(link)


@router.post(
    "/me/caregivers",
    response_model=CaregiverCodeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a caregiver and get their login code",
)
def add_caregiver(
    payload: CaregiverCreate, current_user: PatientUser, db: DbSession
) -> CaregiverCodeRead:
    """The code is shown once; regenerate it if it gets lost."""
    patient = _patient_profile(current_user)
    profile, code = caregiver_service.create_caregiver(db, patient, payload)
    return _code_response(db, patient.id, profile, code)


@router.post(
    "/me/caregivers/{caregiver_id}/code",
    response_model=CaregiverCodeRead,
    summary="Generate a new code (invalidates the previous one)",
)
def regenerate_caregiver_code(
    caregiver_id: int, current_user: PatientUser, db: DbSession
) -> CaregiverCodeRead:
    patient = _patient_profile(current_user)
    profile, code = caregiver_service.regenerate_code(db, patient.id, caregiver_id)
    return _code_response(db, patient.id, profile, code)


@router.delete(
    "/me/caregivers/{caregiver_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a caregiver: deletes their account and sessions",
)
def remove_caregiver(
    caregiver_id: int, current_user: PatientUser, db: DbSession
) -> None:
    patient = _patient_profile(current_user)
    caregiver_service.remove_caregiver(db, patient.id, caregiver_id)
