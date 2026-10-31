from fastapi import APIRouter, Query

from app.api.deps import CaregiverUser, CurrentUser, DbSession, PatientUser
from app.models.patient import PatientProfile
from app.schemas.insight import (
    AssistantAnswer,
    AssistantQuestion,
    ChatRequest,
    DailyAssessment,
    PeriodReport,
    RiskPrediction,
)
from app.services import insights
from app.services.monitoring import ensure_caregiver_can_access, get_patient_or_404

router = APIRouter(tags=["insights"])


def _profile(user: CurrentUser) -> PatientProfile:
    profile = user.patient_profile
    assert profile is not None
    return profile


def _linked_patient(
    db: DbSession, user: CaregiverUser, patient_id: int
) -> PatientProfile:
    patient = get_patient_or_404(db, patient_id)
    ensure_caregiver_can_access(db, user, patient_id)
    return patient


@router.get(
    "/patients/me/assessment",
    response_model=DailyAssessment,
    summary="Today's risk level with reasons and actions",
)
def my_daily_assessment(current_user: PatientUser, db: DbSession) -> DailyAssessment:
    return insights.daily_assessment(db, _profile(current_user))


@router.get(
    "/patients/me/risk",
    response_model=RiskPrediction,
    summary="Current danger (0-100) plus a forward-looking trajectory prediction",
)
def my_risk(current_user: PatientUser, db: DbSession) -> RiskPrediction:
    from app.services import risk

    return risk.predict_risk(db, _profile(current_user))


@router.get(
    "/patients/me/reports/15-day",
    response_model=PeriodReport,
    summary="Narrative report for the last 15 days",
)
def my_report(
    current_user: PatientUser,
    db: DbSession,
    days: int = Query(default=15, ge=1, le=365),
) -> PeriodReport:
    return insights.period_report(db, _profile(current_user), days=days)


@router.post(
    "/patients/me/assistant",
    response_model=AssistantAnswer,
    summary="Ask a question about my readings",
)
def ask_my_assistant(
    payload: AssistantQuestion, current_user: PatientUser, db: DbSession
) -> AssistantAnswer:
    return insights.answer_question(db, _profile(current_user), payload.question)


@router.get(
    "/caregivers/me/patients/{patient_id}/assessment",
    response_model=DailyAssessment,
    summary="Today's risk level for a linked patient",
)
def patient_daily_assessment(
    patient_id: int, current_user: CaregiverUser, db: DbSession
) -> DailyAssessment:
    return insights.daily_assessment(db, _linked_patient(db, current_user, patient_id))


@router.get(
    "/caregivers/me/patients/{patient_id}/risk",
    response_model=RiskPrediction,
    summary="Current danger (0-100) plus a forward-looking trajectory prediction",
)
def patient_risk(
    patient_id: int, current_user: CaregiverUser, db: DbSession
) -> RiskPrediction:
    from app.services import risk

    return risk.predict_risk(db, _linked_patient(db, current_user, patient_id))


@router.get(
    "/caregivers/me/patients/{patient_id}/reports/15-day",
    response_model=PeriodReport,
    summary="15-day report for a linked patient",
)
def patient_report(
    patient_id: int,
    current_user: CaregiverUser,
    db: DbSession,
    days: int = Query(default=15, ge=1, le=365),
) -> PeriodReport:
    return insights.period_report(
        db, _linked_patient(db, current_user, patient_id), days=days
    )


@router.post(
    "/caregivers/me/patients/{patient_id}/assistant",
    response_model=AssistantAnswer,
    summary="Ask a question about a linked patient",
)
def ask_patient_assistant(
    patient_id: int,
    payload: AssistantQuestion,
    current_user: CaregiverUser,
    db: DbSession,
) -> AssistantAnswer:
    return insights.answer_question(
        db, _linked_patient(db, current_user, patient_id), payload.question
    )


@router.post(
    "/caregivers/me/patients/{patient_id}/assistant/chat",
    response_model=AssistantAnswer,
    summary="RAG chat: retrieve patient data, answer with NVIDIA NIM",
)
async def caregiver_assistant_chat(
    patient_id: int,
    payload: ChatRequest,
    current_user: CaregiverUser,
    db: DbSession,
) -> AssistantAnswer:
    """Retrieval-Augmented Generation chat over the patient's dataset.

    Retrieves the relevant rows (readings, adherence, windows, alerts),
    builds a context block, and generates an answer with an NVIDIA NIM
    model. Falls back to rule-based answers when no API key is set.
    """
    from app.services import ai_chat

    patient = _linked_patient(db, current_user, patient_id)
    history = [{"role": t.role, "content": t.content} for t in payload.messages]
    return await ai_chat.ask(db, patient, history)


@router.get(
    "/patients/me/anomalies",
    summary="Detect suspicious/extreme/sudden readings for the patient",
)
def my_anomalies(current_user: PatientUser, db: DbSession) -> dict:
    from app.services import risk

    return risk.anomalies(db, _profile(current_user))


@router.get(
    "/caregivers/me/patients/{patient_id}/anomalies",
    summary="Detect suspicious/extreme/sudden readings for a linked patient",
)
def patient_anomalies(
    patient_id: int, current_user: CaregiverUser, db: DbSession
) -> dict:
    from app.services import risk

    return risk.anomalies(db, _linked_patient(db, current_user, patient_id))


@router.post(
    "/patients/me/assistant/chat",
    response_model=AssistantAnswer,
    summary="RAG chat for the patient over their own data",
)
async def patient_assistant_chat(
    payload: ChatRequest, current_user: PatientUser, db: DbSession
) -> AssistantAnswer:
    from app.services import ai_chat

    history = [{"role": t.role, "content": t.content} for t in payload.messages]
    return await ai_chat.ask(db, _profile(current_user), history)
