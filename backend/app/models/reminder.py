from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.notification import Notification
    from app.models.patient import PatientProfile


class ReminderSchedule(Base):
    """When a patient is expected to measure their blood pressure."""

    __tablename__ = "reminder_schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patient_profiles.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    # Local wall-clock times, e.g. ["08:00", "20:00"].
    times: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    # 0 = Monday ... 6 = Sunday. Empty/absent means every day.
    days_of_week: Mapped[list[int]] = mapped_column(
        JSON, default=lambda: [0, 1, 2, 3, 4, 5, 6], nullable=False
    )
    grace_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    patient: Mapped["PatientProfile"] = relationship(back_populates="reminder_schedule")


class MeasurementWindow(Base):
    """One expected measurement and how it was handled.

    ``status`` follows this lifecycle::

        pending -> completed      (a reading arrived in time)
        pending -> missed         (grace period passed with no reading)
        missed  -> escalated      (first caregiver notified)
        escalated -> acknowledged (a caregiver acknowledged)
        escalated -> unresolved   (nobody acknowledged after the last tier)
    """

    __tablename__ = "measurement_windows"
    __table_args__ = (
        UniqueConstraint("patient_id", "due_at", name="uq_window_patient_due"),
        Index("ix_windows_patient_due", "patient_id", "due_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False
    )
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    grace_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_escalation_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    missed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    patient: Mapped["PatientProfile"] = relationship(
        back_populates="measurement_windows"
    )
    notifications: Mapped[list["Notification"]] = relationship(back_populates="window")
