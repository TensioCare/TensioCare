from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.bp import BPCategory, BPTrend

Arm = Literal["left", "right"]
Position = Literal["sitting", "standing", "lying"]


class ReadingCreate(BaseModel):
    systolic: int = Field(ge=50, le=300)
    diastolic: int = Field(ge=30, le=200)
    pulse: int | None = Field(default=None, ge=20, le=250)
    measured_at: datetime | None = Field(
        default=None, description="ISO datetime; defaults to now (UTC)"
    )
    device_serial: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    arm: Arm | None = None
    position: Position | None = None
    resting_minutes: int | None = Field(default=None, ge=0, le=180)
    client_reading_id: str | None = Field(
        default=None,
        max_length=80,
        description="Idempotency key: posting it twice returns the same reading",
    )

    @model_validator(mode="after")
    def validate_pressure(self) -> "ReadingCreate":
        if self.systolic <= self.diastolic:
            raise ValueError("systolic must be greater than diastolic")
        return self


class ReadingUpdate(BaseModel):
    systolic: int | None = Field(default=None, ge=50, le=300)
    diastolic: int | None = Field(default=None, ge=30, le=200)
    pulse: int | None = Field(default=None, ge=20, le=250)
    measured_at: datetime | None = None
    notes: str | None = None
    arm: Arm | None = None
    position: Position | None = None
    resting_minutes: int | None = Field(default=None, ge=0, le=180)


class ReadingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    systolic: int
    diastolic: int
    pulse: int | None = None
    measured_at: datetime
    device_id: int | None = None
    notes: str | None = None
    source: str
    arm: Arm | None = None
    position: Position | None = None
    resting_minutes: int | None = None
    client_reading_id: str | None = None
    category: BPCategory
    pulse_pressure: int
    mean_arterial_pressure: float


class DailyReadingStats(BaseModel):
    date: date
    reading_count: int
    average_systolic: float
    average_diastolic: float
    average_pulse: float | None = None
    min_systolic: int
    max_systolic: int
    readings_above_target: int = 0


class PeriodComparison(BaseModel):
    """The window immediately before the analysed period."""

    period_days: int
    reading_count: int
    average_systolic: float
    average_diastolic: float
    average_pulse: float | None = None
    delta_systolic: float
    delta_diastolic: float
    direction: Literal["better", "worse", "stable"]


class ReadingAnalysis(BaseModel):
    period_days: int
    reading_count: int

    average_systolic: float | None = None
    average_diastolic: float | None = None
    average_pulse: float | None = None
    min_systolic: int | None = None
    max_systolic: int | None = None
    min_diastolic: int | None = None
    max_diastolic: int | None = None

    latest_reading: ReadingRead | None = None
    category_counts: dict[str, int] = Field(default_factory=dict)
    daily: list[DailyReadingStats] = Field(default_factory=list)
    previous_period: PeriodComparison | None = None

    target_systolic: int | None = None
    target_diastolic: int | None = None
    readings_above_target: int = 0
    in_target_percent: float | None = None

    trend: BPTrend
    alerts: list[str] = Field(default_factory=list)


class DeviceCreate(BaseModel):
    serial_number: str = Field(min_length=3, max_length=120)
    label: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=80)


class DeviceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    serial_number: str
    label: str | None = None
    model: str | None = None
    is_active: bool
    last_synced_at: datetime | None = None
    created_at: datetime
