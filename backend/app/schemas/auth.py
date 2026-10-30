from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.core.timeutils import normalize_hhmm_list, validate_timezone
from app.schemas.user import UserRead


class PatientRegister(BaseModel):
    """Account creation always creates a patient.

    Caregivers do not register: the patient adds them and they sign in with a
    code (see ``CaregiverCodeLogin``).
    """

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    age: int = Field(ge=0, le=120)
    diagnosis: str | None = Field(default=None, max_length=160)
    medical_history: str | None = None
    allergies: str | None = None
    medications: str | None = None
    target_systolic: int | None = Field(default=None, ge=60, le=250)
    target_diastolic: int | None = Field(default=None, ge=30, le=150)

    measurements_per_day: int | None = Field(
        default=None,
        ge=1,
        le=6,
        description="How many times per day the patient measures BP",
    )
    measurement_times: list[str] = Field(
        default_factory=list,
        max_length=6,
        description='Local times such as ["08:00", "20:00"]',
    )
    timezone: str = Field(default="UTC", max_length=64)

    @field_validator("measurement_times")
    @classmethod
    def valid_measurement_times(cls, values: list[str]) -> list[str]:
        return normalize_hhmm_list(values)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        return validate_timezone(value)

    @model_validator(mode="after")
    def valid_measurement_plan(self) -> "PatientRegister":
        if self.measurement_times:
            expected = len(self.measurement_times)
            if self.measurements_per_day is None:
                self.measurements_per_day = expected
            elif self.measurements_per_day != expected:
                raise ValueError(
                    "measurements_per_day must match the number of measurement_times"
                )
        elif self.measurements_per_day is not None:
            raise ValueError(
                "measurement_times is required when measurements_per_day is set"
            )
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=16)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthResponse(Token):
    """Returned by register, login, caregiver login and refresh."""

    refresh_token: str
    expires_in: int  # seconds until access_token expires
    user: UserRead
