"""Persisted risk assessments (audit trail for the rule-based risk engine)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assessed_reading_id: Mapped[int | None] = mapped_column(
        ForeignKey("blood_pressure_readings.id", ondelete="SET NULL")
    )
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)
    classification: Mapped[str] = mapped_column(String(40), nullable=False)
    direction: Mapped[str | None] = mapped_column(String(20))
    reasons: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    recommendations: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    model_version: Mapped[str] = mapped_column(String(40), nullable=False)
    readings_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    patient: Mapped["PatientProfile"] = relationship()  # noqa: F821
