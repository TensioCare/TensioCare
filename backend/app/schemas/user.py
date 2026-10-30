from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.timeutils import normalize_hhmm_list, validate_timezone
from app.models.user import UserRole


class PatientProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    diagnosis: str | None = None
    medical_history: str | None = None
    allergies: str | None = None
    medications: str | None = None
    target_systolic: int | None = None
    target_diastolic: int | None = None
    measurements_per_day: int | None = None
    measurement_times: list[str] = Field(default_factory=list)
    timezone: str = "UTC"


class LinkedPatientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    patient_id: int
    patient_user_id: int
    first_name: str
    last_name: str
    priority: int
    notify_after_minutes: int
    is_primary_contact: bool
    diagnosis: str | None = None
    medical_history: str | None = None
    allergies: str | None = None
    medications: str | None = None
    target_systolic: int | None = None
    target_diastolic: int | None = None
    measurement_times: list[str] = Field(default_factory=list)
    timezone: str = "UTC"


class PatientCaregiverRead(BaseModel):
    """A caregiver as seen by the patient, in escalation order."""

    caregiver_id: int
    caregiver_user_id: int
    first_name: str
    last_name: str
    relationship: str
    phone: str | None = None
    notes: str | None = None
    priority: int
    notify_after_minutes: int
    status: str
    claimed_at: datetime | None = None


class PatientCaregiverUpdate(BaseModel):
    """The patient can edit everything about their caregiver."""

    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    relationship: str | None = Field(default=None, min_length=1, max_length=60)
    phone: str | None = Field(default=None, max_length=32)
    notes: str | None = None
    priority: int | None = Field(default=None, ge=1, le=50)
    notify_after_minutes: int | None = Field(default=None, ge=5, le=1440)


class CaregiverSelfUpdate(BaseModel):
    """A caregiver can edit their own identity and contact details."""

    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    relationship: str | None = Field(default=None, min_length=1, max_length=60)
    phone: str | None = Field(default=None, max_length=32)
    notes: str | None = None


class CaregiverCreate(BaseModel):
    """Details the patient enters when adding a caregiver."""

    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    relationship: str = Field(min_length=1, max_length=60)
    phone: str | None = Field(default=None, max_length=32)
    notes: str | None = None
    priority: int = Field(default=1, ge=1, le=50)
    notify_after_minutes: int = Field(default=15, ge=5, le=1440)


class CaregiverCodeRead(BaseModel):
    """Returned once when a code is created or regenerated."""

    caregiver_id: int
    user_id: int
    first_name: str
    last_name: str
    relationship: str
    priority: int
    notify_after_minutes: int
    code: str


class CaregiverCodePreview(BaseModel):
    """Public preview so the caregiver sees who shared the code."""

    patient_first_name: str
    patient_last_name: str
    caregiver_first_name: str
    caregiver_last_name: str
    relationship: str
    claimed: bool


class CaregiverCodeLogin(BaseModel):
    code: str = Field(min_length=6, max_length=16)


class CaregiverProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    relationship: str
    phone: str | None = None
    notes: str | None = None
    status: str
    claimed_at: datetime | None = None
    patients: list[LinkedPatientRead] = Field(default_factory=list)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr | None = None
    first_name: str
    last_name: str
    age: int | None = None
    role: UserRole
    is_active: bool
    created_at: datetime

    patient_profile: PatientProfileRead | None = None
    caregiver_profile: CaregiverProfileRead | None = None


class PatientProfileUpdate(BaseModel):
    diagnosis: str | None = Field(default=None, max_length=160)
    medical_history: str | None = None
    allergies: str | None = None
    medications: str | None = None
    target_systolic: int | None = Field(default=None, ge=60, le=250)
    target_diastolic: int | None = Field(default=None, ge=30, le=150)

    measurements_per_day: int | None = Field(default=None, ge=1, le=6)
    measurement_times: list[str] | None = Field(default=None, max_length=6)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("measurement_times")
    @classmethod
    def valid_measurement_times(cls, values: list[str] | None) -> list[str] | None:
        return None if values is None else normalize_hhmm_list(values)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        return None if value is None else validate_timezone(value)


class LinkedPatientUpdate(BaseModel):
    priority: int | None = Field(default=None, ge=1, le=50)
    notify_after_minutes: int | None = Field(default=None, ge=5, le=1440)
