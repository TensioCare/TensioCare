"""RAG (Retrieval-Augmented Generation) chat service on NVIDIA NIM.

Pipeline:
  1. RETRIEVE  – pull the relevant patient data from the dataset based on
     what the question is about (readings, adherence, schedule, alerts…).
  2. AUGMENT   – format the retrieved rows into a compact context block.
  3. GENERATE  – send the context + question to an NVIDIA NIM LLM which
     answers strictly from that context.

If no API key is configured or the model call fails, we fall back to the
deterministic rule-based assistant so the chat never breaks.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Literal

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutils import utcnow
from app.models.patient import PatientProfile
from app.models.reading import BloodPressureReading
from app.models.reminder import MeasurementWindow
from app.schemas.insight import AssistantAnswer
from app.services import insights
from app.services.monitoring import analyse_readings
from app.services.reminders import adherence_summary

logger = logging.getLogger(__name__)

MAX_HISTORY_TURNS = 10

Role = Literal["user", "assistant"]

SYSTEM_PROMPT = """\
You are TensioCare Assistant, a caring, concise support assistant inside a \
blood-pressure monitoring app. You answer a **caregiver** using ONLY the \
patient data provided below (their Retrieval-Augmented Generation dataset).

Retrieved patient dataset (JSON):
{context}

Rules:
- Think briefly, then answer in English, in 1-4 short sentences. Plain prose,
  no bullet lists.
- Output plain ASCII text only: no markdown, no **bold**, no asterisks, no
  headings. Use regular hyphens and regular spaces, never special Unicode
  characters such as non-breaking hyphens or narrow spaces.
- Use ONLY numbers present in the dataset above. Never invent or estimate \
readings, dates or percentages that are not there.
- The context lists exactly one patient, so questions like "how is his \
health" refer to that patient. Never ask who you mean.
- If the dataset does not contain the answer, say exactly what is missing.
- For emergencies, medication changes or diagnosis, advise contacting the \
patient's clinician or emergency services. You are not a doctor.
- Be warm and reassuring, but never minimise a warning sign.
"""


# ---------------------------------------------------------------------------
# 1. RETRIEVE
# ---------------------------------------------------------------------------

@dataclass
class RetrievedData:
    """The slice of the dataset relevant to the question."""

    meta: dict[str, Any] = field(default_factory=dict)
    readings: list[dict[str, Any]] = field(default_factory=list)
    windows: list[dict[str, Any]] = field(default_factory=list)
    adherence: dict[str, Any] = field(default_factory=dict)
    analysis: dict[str, Any] = field(default_factory=dict)
    alerts: int = 0
    topics: set[str] = field(default_factory=set)


def _detect_topics(question: str) -> set[str]:
    """Keyword routing: which parts of the dataset the question needs."""
    q = question.lower()
    topics: set[str] = set()

    if any(w in q for w in ("reading", "value", "systolic", "diastolic",
                            "latest", "recent", "last", "measure", "mmhg",
                            "blood pressure", "bp", "high", "low")):
        topics |= {"readings", "latest"}
    if any(w in q for w in ("average", "avg", "mean", "trend", "worse",
                            "better", "improv", "week", "month", "history")):
        topics |= {"readings", "analysis"}
    if any(w in q for w in ("adherence", "compliance", "miss", "missed",
                            "skipped", "taken", "completed", "follow")):
        topics |= {"adherence", "windows"}
    if any(w in q for w in ("time", "schedule", "plan", "when", "due",
                            "window", "reminder", "next", "upcoming")):
        topics |= {"windows"}
    if any(w in q for w in ("alert", "alarm", "escalat", "urgent", "emergency",
                            "crisis", "danger", "acknowledg")):
        topics |= {"alerts", "readings"}
    if any(w in q for w in ("target", "goal", "within", "range")):
        topics |= {"analysis", "readings"}
    if any(w in q for w in ("name", "who", "diagnosis", "age", "condition")):
        topics |= {"meta"}

    # Default: pull everything (small dataset, cheap to retrieve).
    if not topics:
        topics = {"meta", "readings", "analysis", "adherence", "windows", "alerts"}
    return topics


def retrieve(db: Session, patient: PatientProfile, question: str) -> RetrievedData:
    """Pull the relevant rows from the dataset for this question."""
    topics = _detect_topics(question)
    data = RetrievedData(topics=topics)

    # --- meta ---
    data.meta = {
        "name": f"{patient.user.first_name} {patient.user.last_name}".strip(),
        "diagnosis": patient.diagnosis,
        "target_systolic": patient.target_systolic,
        "target_diastolic": patient.target_diastolic,
        "measurement_times": patient.measurement_times or [],
        "timezone": patient.timezone,
    }

    # --- readings (recent 30 days, newest first) ---
    if "readings" in topics or "analysis" in topics or "latest" in topics:
        start = utcnow() - timedelta(days=30)
        rows = db.scalars(
            select(BloodPressureReading)
            .where(
                BloodPressureReading.patient_id == patient.id,
                BloodPressureReading.measured_at >= start,
            )
            .order_by(BloodPressureReading.measured_at.desc())
            .limit(60)
        ).all()
        data.readings = [
            {
                "systolic": r.systolic,
                "diastolic": r.diastolic,
                "pulse": r.pulse,
                "category": r.category.value,
                "measured_at": r.measured_at.strftime("%Y-%m-%d %H:%M UTC"),
                "note": r.notes,
            }
            for r in rows
        ]

    # --- analysis aggregates (7-day) ---
    if "analysis" in topics or "readings" in topics:
        analysis = analyse_readings(db, patient, 7)
        data.analysis = {
            "days": 7,
            "reading_count": analysis.reading_count,
            "average_systolic": analysis.average_systolic,
            "average_diastolic": analysis.average_diastolic,
            "trend": analysis.trend.value,
            "readings_above_target": analysis.readings_above_target,
            "in_target_percent": analysis.in_target_percent,
            "category_counts": dict(analysis.category_counts),
        }

    # --- adherence (7-day) ---
    if "adherence" in topics or "windows" in topics:
        adherence = adherence_summary(db, patient.id, days=7)
        missed = adherence.missed + adherence.escalated + adherence.unresolved
        data.adherence = {
            "days": 7,
            "expected": adherence.expected,
            "completed": adherence.completed,
            "missed_or_escalated": missed,
            "adherence_percent": adherence.adherence_percent,
        }

    # --- measurement windows (today + yesterday) ---
    if "windows" in topics:
        now = utcnow()
        start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        rows = db.scalars(
            select(MeasurementWindow)
            .where(
                MeasurementWindow.patient_id == patient.id,
                MeasurementWindow.due_at >= start,
            )
            .order_by(MeasurementWindow.due_at.desc())
            .limit(20)
        ).all()
        data.windows = [
            {
                "due_at": w.due_at.strftime("%Y-%m-%d %H:%M UTC"),
                "status": w.status,
            }
            for w in rows
        ]

    # --- alerts (unacknowledged escalations) ---
    if "alerts" in topics:
        from sqlalchemy import func

        data.alerts = (
            db.scalar(
                select(func.count())
                .select_from(MeasurementWindow)
                .where(
                    MeasurementWindow.patient_id == patient.id,
                    MeasurementWindow.status == "escalated",
                    MeasurementWindow.acknowledged_at.is_(None),
                )
            )
            or 0
        )

    return data


# ---------------------------------------------------------------------------
# 2. AUGMENT
# ---------------------------------------------------------------------------

def augment(data: RetrievedData) -> str:
    """Format the retrieved rows into a compact JSON context block."""
    payload: dict[str, Any] = {"meta": data.meta}
    if data.analysis:
        payload["analysis_7d"] = data.analysis
    if data.adherence:
        payload["adherence_7d"] = data.adherence
    if data.alerts:
        payload["unacknowledged_alerts"] = data.alerts
    if data.windows:
        payload["measurement_windows_recent"] = data.windows
    if data.readings:
        # Keep the newest ~30 readings so the prompt stays small.
        payload["readings_recent_newest_first"] = data.readings[:30]
    payload["retrieved_topics"] = sorted(data.topics)
    return json.dumps(payload, ensure_ascii=False, default=str)


# ---------------------------------------------------------------------------
# 3. GENERATE
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    """Normalise model output for a plain-text RN UI.

    Models occasionally emit markdown or typographic Unicode even when told
    not to, which renders as literal asterisks or odd glyphs in the app.
    """
    import re
    import unicodedata

    # Strip markdown emphasis/headers/code fences.
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\w)[*_]{1,3}|[*_]{1,3}(?!\w)", "", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)

    # Fold typographic punctuation back to ASCII equivalents.
    replacements = {
        "\u2011": "-",   # non-breaking hyphen
        "\u2010": "-",   # hyphen
        "\u2012": "-",   # figure dash
        "\u2013": "-",   # en dash
        "\u2014": " - ",  # em dash
        "\u2018": "'", "\u2019": "'",  # single quotes
        "\u201c": '"', "\u201d": '"',  # double quotes
        "\u00a0": " ",   # nbsp
        "\u202f": " ",   # narrow nbsp
        "\u2009": " ",   # thin space
        "\u200b": "",    # zero-width space
        "\u00ad": "",    # soft hyphen
        "\u2212": "-",   # minus sign
        "\u00b7": ".",   # middle dot
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)

    # Drop any other non-ASCII that survived (except common accented letters).
    text = "".join(
        ch
        for ch in text
        if ord(ch) < 128 or unicodedata.category(ch).startswith("L")
    )

    return re.sub(r"\s+", " ", text).strip()


async def _generate(system: str, history: list[dict[str, str]]) -> str | None:
    """Call NVIDIA NIM. Returns the text or None on failure.

    The available NIM models are reasoning models: they emit an internal
    ``reasoning`` trace before ``content``, so the token budget must leave
    room for both or the answer comes back empty.
    """
    async with httpx.AsyncClient(timeout=settings.nvidia_timeout_seconds) as client:
        response = await client.post(
            f"{settings.nvidia_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.nvidia_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.nvidia_model,
                "messages": [{"role": "system", "content": system}, *history],
                "temperature": 0.2,
                "top_p": 0.9,
                "max_tokens": 3000,
                "stream": False,
            },
        )
        response.raise_for_status()
        body = response.json()

    message = body["choices"][0]["message"]
    content = (message.get("content") or "").strip()

    # Never return reasoning_content: on reasoning models it is the raw
    # thinking trace, not an answer. An empty content means the model ran
    # out of budget, so signal failure and let the caller fall back.
    return content or None


# ---------------------------------------------------------------------------
# ORCHESTRATOR
# ---------------------------------------------------------------------------

async def ask(
    db: Session,
    patient: PatientProfile,
    messages: list[dict[str, str]],
) -> AssistantAnswer:
    """Full RAG pipeline: retrieve → augment → generate (rule-based fallback)."""
    if not messages:
        return _fallback(db, patient, "help")

    question = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"),
        "",
    ).strip()

    if not settings.nvidia_api_key:
        logger.info("No NVIDIA API key configured; using rule-based fallback")
        return _fallback(db, patient, question or "help")

    # 1. RETRIEVE
    try:
        data = retrieve(db, patient, question)
        # 2. AUGMENT
        context = augment(data)
    except Exception:
        logger.exception("RAG retrieve/augment failed; using fallback")
        return _fallback(db, patient, question or "help")

    system = SYSTEM_PROMPT.format(context=context)

    history = [
        {"role": m["role"], "content": m["content"]}
        for m in messages[-MAX_HISTORY_TURNS:]
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    if not history or history[-1]["role"] != "user":
        history.append({"role": "user", "content": question or "help"})

    # 3. GENERATE
    try:
        answer = await _generate(system, history)
    except Exception:
        logger.exception("NVIDIA NIM call failed; using fallback")
        return _fallback(db, patient, question or "help")

    if not answer:
        return _fallback(db, patient, question or "help")

    answer = _clean(answer)
    if not answer:
        return _fallback(db, patient, question or "help")

    return AssistantAnswer(
        intent="rag",
        answer=answer,
        data={
            "source": "rag_nvidia_nim",
            "model": settings.nvidia_model,
            "retrieved_topics": sorted(data.topics),
            "readings_retrieved": len(data.readings),
        },
    )


def _fallback(db: Session, patient: PatientProfile, question: str) -> AssistantAnswer:
    """Deterministic rule-based answer; never depends on the network."""
    answer = insights.answer_question(db, patient, question)
    answer.data["source"] = "rule_based_fallback"
    return answer
