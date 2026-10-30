from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.reading import BloodPressureReading
    from app.models.reminder import MeasurementWindow, ReminderSchedule
    from app.models.user import User


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )

    diagnosis: Mapped[str | None] = mapped_column(String(160))
    medical_history: Mapped[str | None] = mapped_column(Text)
    allergies: Mapped[str | None] = mapped_column(Text)
    medications: Mapped[str | None] = mapped_column(Text)

    # Personal goals, used to flag readings above target.
    target_systolic: Mapped[int | None] = mapped_column(Integer)
    target_diastolic: Mapped[int | None] = mapped_column(Integer)

    # Measurement plan, kept in sync with the reminder schedule.
    measurements_per_day: Mapped[int | None] = mapped_column(Integer)
    measurement_times: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="patient_profile")
    devices: Mapped[list["Device"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    readings: Mapped[list["BloodPressureReading"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    reminder_schedule: Mapped["ReminderSchedule | None"] = relationship(
        back_populates="patient", uselist=False, cascade="all, delete-orphan"
    )
    measurement_windows: Mapped[list["MeasurementWindow"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )

    @property
    def first_name(self) -> str:
        return self.user.first_name

    @property
    def last_name(self) -> str:
        return self.user.last_name

    @property
    def email(self) -> str:
        return self.user.email
