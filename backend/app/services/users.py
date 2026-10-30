from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import hash_password, verify_password
from app.models.caregiver import CaregiverPatient, CaregiverProfile
from app.models.patient import PatientProfile
from app.models.user import User, UserRole
from app.schemas.auth import PatientRegister
from app.schemas.reminder import ReminderScheduleUpsert
from app.services.reminders import upsert_schedule


def user_query() -> Select[tuple[User]]:
    """Select users with their profile (and nested relations) eagerly loaded."""
    return select(User).options(
        selectinload(User.patient_profile),
        selectinload(User.caregiver_profile)
        .selectinload(CaregiverProfile.links)
        .selectinload(CaregiverPatient.patient)
        .selectinload(PatientProfile.user),
    )


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.scalar(user_query().where(User.id == user_id))


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(user_query().where(User.email == email.lower()))


def register_user(payload: PatientRegister, db: Session) -> User:
    """Create a patient account. Caregivers are created by a patient instead."""
    email = payload.email.lower()

    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        age=payload.age,
        role=UserRole.patient,
        patient_profile=PatientProfile(
            diagnosis=payload.diagnosis,
            medical_history=payload.medical_history,
            allergies=payload.allergies,
            medications=payload.medications,
            target_systolic=payload.target_systolic,
            target_diastolic=payload.target_diastolic,
            measurements_per_day=payload.measurements_per_day,
            measurement_times=payload.measurement_times,
            timezone=payload.timezone,
        ),
    )

    db.add(user)
    db.commit()

    created = get_user_by_id(db, user.id)
    assert created is not None
    assert created.patient_profile is not None

    if payload.measurement_times:
        upsert_schedule(
            db,
            created.patient_profile,
            ReminderScheduleUpsert(
                timezone=payload.timezone,
                times=payload.measurement_times,
            ),
        )
    return created


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)

    if (
        user is None
        or not user.hashed_password
        or not verify_password(password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user"
        )
    return user
