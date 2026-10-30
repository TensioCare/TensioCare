import hashlib
import re
import secrets

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.timeutils import utcnow
from app.models.caregiver import CaregiverPatient, CaregiverProfile
from app.models.patient import PatientProfile
from app.models.user import User, UserRole
from app.schemas.user import (
    CaregiverCreate,
    CaregiverSelfUpdate,
    PatientCaregiverUpdate,
)
from app.services.users import get_user_by_id

# No 0/O/1/I: codes are read from a screen and typed by hand.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8

_NON_CODE_CHARS = re.compile(r"[^A-Z0-9]")


def normalize_code(value: str) -> str:
    return _NON_CODE_CHARS.sub("", value.upper())


def _hash_code(value: str) -> str:
    return hashlib.sha256(normalize_code(value).encode("utf-8")).hexdigest()


def format_code(raw: str) -> str:
    return f"{raw[:4]}-{raw[4:]}"


def _new_code(db: Session) -> tuple[str, str]:
    """Return ``(display_code, hash)``, retrying on the unlikely collision."""
    for _ in range(20):
        raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        hashed = _hash_code(raw)
        exists = db.scalar(
            select(CaregiverProfile.id).where(
                CaregiverProfile.login_code_hash == hashed
            )
        )
        if exists is None:
            return format_code(raw), hashed
    raise RuntimeError("Could not generate a unique caregiver code")


def list_links(db: Session, patient_id: int) -> list[CaregiverPatient]:
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


def get_link(db: Session, patient_id: int, caregiver_id: int) -> CaregiverPatient:
    link = db.scalar(
        select(CaregiverPatient)
        .options(
            selectinload(CaregiverPatient.caregiver).selectinload(CaregiverProfile.user)
        )
        .where(
            CaregiverPatient.patient_id == patient_id,
            CaregiverPatient.caregiver_id == caregiver_id,
        )
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caregiver is not linked to this patient",
        )
    return link


def create_caregiver(
    db: Session, patient: PatientProfile, payload: CaregiverCreate
) -> tuple[CaregiverProfile, str]:
    """Create a caregiver account in ``pending`` state and return its code."""
    code, code_hash = _new_code(db)

    user = User(
        email=None,
        hashed_password=None,
        first_name=payload.first_name,
        last_name=payload.last_name,
        age=None,
        role=UserRole.caregiver,
        caregiver_profile=CaregiverProfile(
            relationship=payload.relationship,
            phone=payload.phone,
            notes=payload.notes,
            login_code_hash=code_hash,
        ),
    )
    db.add(user)
    db.flush()

    profile = user.caregiver_profile
    assert profile is not None
    db.add(
        CaregiverPatient(
            caregiver_id=profile.id,
            patient_id=patient.id,
            priority=payload.priority,
            notify_after_minutes=payload.notify_after_minutes,
        )
    )
    db.commit()
    db.refresh(profile)
    return profile, code


def regenerate_code(
    db: Session, patient_id: int, caregiver_id: int
) -> tuple[CaregiverProfile, str]:
    link = get_link(db, patient_id, caregiver_id)
    code, code_hash = _new_code(db)
    link.caregiver.login_code_hash = code_hash
    db.commit()
    db.refresh(link.caregiver)
    return link.caregiver, code


def update_caregiver(
    db: Session,
    patient_id: int,
    caregiver_id: int,
    payload: PatientCaregiverUpdate,
) -> CaregiverPatient:
    """The patient edits a caregiver's details, ring position or timeout."""
    link = get_link(db, patient_id, caregiver_id)
    changes = payload.model_dump(exclude_unset=True)

    for field in ("first_name", "last_name"):
        if field in changes:
            setattr(link.caregiver.user, field, changes[field])
    for field in ("relationship", "phone", "notes"):
        if field in changes:
            setattr(link.caregiver, field, changes[field])
    for field in ("priority", "notify_after_minutes"):
        if field in changes:
            setattr(link, field, changes[field])

    db.commit()
    return get_link(db, patient_id, caregiver_id)


def update_self(
    db: Session, caregiver_user: User, payload: CaregiverSelfUpdate
) -> User:
    """The caregiver edits their own name, relationship and contact details."""
    profile = caregiver_user.caregiver_profile
    assert profile is not None

    changes = payload.model_dump(exclude_unset=True)
    for field in ("first_name", "last_name"):
        if field in changes:
            setattr(caregiver_user, field, changes[field])
    for field in ("relationship", "phone", "notes"):
        if field in changes:
            setattr(profile, field, changes[field])

    db.commit()
    updated = get_user_by_id(db, caregiver_user.id)
    assert updated is not None
    return updated


def remove_caregiver(db: Session, patient_id: int, caregiver_id: int) -> None:
    """Delete the caregiver account, its link and all of its sessions."""
    link = get_link(db, patient_id, caregiver_id)
    db.delete(link.caregiver.user)
    db.commit()


def find_by_code(db: Session, code: str) -> CaregiverProfile | None:
    return db.scalar(
        select(CaregiverProfile)
        .options(
            selectinload(CaregiverProfile.user),
            selectinload(CaregiverProfile.links)
            .selectinload(CaregiverPatient.patient)
            .selectinload(PatientProfile.user),
        )
        .where(CaregiverProfile.login_code_hash == _hash_code(code))
    )


def preview(db: Session, code: str) -> CaregiverProfile:
    profile = find_by_code(db, code)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid caregiver code"
        )
    return profile


def login_with_code(db: Session, code: str) -> User:
    """Sign a caregiver in. The first successful use activates the account."""
    profile = find_by_code(db, code)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid caregiver code",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not profile.user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user"
        )

    if profile.claimed_at is None:
        profile.claimed_at = utcnow()
        db.commit()

    user = get_user_by_id(db, profile.user_id)
    assert user is not None
    return user
