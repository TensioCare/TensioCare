from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.timeutils import normalize_hhmm_list, validate_timezone


class ReminderScheduleUpsert(BaseModel):
    timezone: str = Field(default="UTC", max_length=64)
    times: list[str] = Field(min_length=1, max_length=8)
    days_of_week: list[int] = Field(
        default_factory=lambda: [0, 1, 2, 3, 4, 5, 6],
        min_length=1,
        max_length=7,
        description="0 = Monday ... 6 = Sunday",
    )
    grace_minutes: int = Field(default=60, ge=5, le=720)
    is_active: bool = True

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        return validate_timezone(value)

    @field_validator("times")
    @classmethod
    def valid_times(cls, values: list[str]) -> list[str]:
        return normalize_hhmm_list(values)

    @field_validator("days_of_week")
    @classmethod
    def valid_days(cls, values: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in values):
            raise ValueError("days_of_week must contain values from 0 to 6")
        return sorted(set(values))


class ReminderScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    timezone: str
    times: list[str]
    days_of_week: list[int] = Field(default_factory=list)
    grace_minutes: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WindowSnooze(BaseModel):
    minutes: int = Field(default=15, ge=5, le=240)


class MeasurementWindowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    due_at: datetime
    status: str
    escalation_level: int
    next_escalation_at: datetime | None = None
    reminded_at: datetime | None = None
    missed_at: datetime | None = None
    escalated_at: datetime | None = None
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None


class AdherenceSummary(BaseModel):
    period_days: int
    expected: int
    completed: int
    missed: int
    escalated: int
    unresolved: int
    adherence_percent: float | None = None
    last_completed_at: datetime | None = None
