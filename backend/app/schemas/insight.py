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


class ChatTurn(BaseModel):
    """One OpenAI-style turn in the conversation history."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    """Full conversation history ending with the latest user question."""

    messages: list[ChatTurn] = Field(min_length=1, max_length=40)


class RiskAssessment(BaseModel):
    """Current danger level for a patient (0-100 score + explainable reasons)."""

    generated_at: datetime
    risk_level: RiskLevel
    risk_score: int = Field(ge=0, le=100)
    classification: str
    reasons: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    model_version: str
    assessed_reading_id: int | None = None
    readings_used: int
    disclaimer: str


class FutureProjection(BaseModel):
    """Projected blood pressure at a given horizon."""

    horizon_days: int
    projected_systolic: float | None = None
    projected_diastolic: float | None = None
    projected_category: str | None = None
    confidence: Literal["high", "moderate", "low", "insufficient_data"]


class RiskPrediction(BaseModel):
    """Current danger plus a forward-looking trajectory projection."""

    generated_at: datetime
    current: RiskAssessment
    direction: Literal["rising", "stable", "falling"]
    slope_systolic_per_day: float | None = None
    slope_diastolic_per_day: float | None = None
    variability_systolic: float | None = None
    projections: list[FutureProjection] = Field(default_factory=list)
    days_until_target_breach: int | None = None
    days_until_stage_2: int | None = None
    days_until_crisis: int | None = None
    probability_of_missing_next_measurement: float | None = None
    future_risk_level: RiskLevel
    future_reasons: list[str] = Field(default_factory=list)
    disclaimer: str
