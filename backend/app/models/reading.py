from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.bp import BPCategory, classify, mean_arterial_pressure, pulse_pressure
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.patient import PatientProfile


class BloodPressureReading(Base):
    __tablename__ = "blood_pressure_readings"
    __table_args__ = (
        Index("ix_bp_readings_patient_measured", "patient_id", "measured_at"),
        UniqueConstraint(
            "patient_id",
            "client_reading_id",
            name="uq_bp_readings_patient_client_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL")
    )

    systolic: Mapped[int] = mapped_column(Integer, nullable=False)
    diastolic: Mapped[int] = mapped_column(Integer, nullable=False)
    pulse: Mapped[int | None] = mapped_column(Integer)
    measured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)
    # Comma-separated symptom labels (e.g. "chest pain, severe headache").
    # Stored as text to match the reference model; parsed into a list by the
    # schema. Used by the risk engine (+35 for emergency symptoms).
    symptoms: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20), default="device", nullable=False)

    # Measurement context (all optional, useful for device sync and manual entry).
    arm: Mapped[str | None] = mapped_column(String(10))
    position: Mapped[str | None] = mapped_column(String(12))
    resting_minutes: Mapped[int | None] = mapped_column(Integer)
    # Idempotency key supplied by the client/device: a retried upload is ignored.
    client_reading_id: Mapped[str | None] = mapped_column(String(80))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    patient: Mapped["PatientProfile"] = relationship(back_populates="readings")
    device: Mapped["Device | None"] = relationship(back_populates="readings")

    @property
    def category(self) -> BPCategory:
        return classify(self.systolic, self.diastolic)

    @property
    def pulse_pressure(self) -> int:
        return pulse_pressure(self.systolic, self.diastolic)

    @property
    def mean_arterial_pressure(self) -> float:
        return mean_arterial_pressure(self.systolic, self.diastolic)

    @property
    def symptoms_list(self) -> list[str]:
        if not self.symptoms:
            return []
        return [s.strip() for s in self.symptoms.split(",") if s.strip()]
