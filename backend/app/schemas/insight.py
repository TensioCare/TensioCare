from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.bp import BPTrend
from app.schemas.reading import ReadingAnalysis, ReadingRead
from app.schemas.reminder import AdherenceSummary

RiskLevel = Literal["no_data", "low", "moderate", "high", "critical"]


class DailyAssessment(BaseModel):
    generated_at: datetime
    risk_level: RiskLevel
    headline: str
    summary: str
    reasons: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)

    readings_last_24h: int
    average_systolic: float | None = None
    average_diastolic: float | None = None
    latest_reading: ReadingRead | None = None

    missed_last_7_days: int
    adherence_percent_7_days: float | None = None
    trend_7_days: BPTrend


class PeriodReport(BaseModel):
    period_days: int
    generated_at: datetime
    risk_level: RiskLevel
    headline: str
    narrative: str
    highlights: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    analysis: ReadingAnalysis
    adherence: AdherenceSummary


class AssistantQuestion(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class AssistantAnswer(BaseModel):
    intent: str
    answer: str
    data: dict[str, Any] = Field(default_factory=dict)
