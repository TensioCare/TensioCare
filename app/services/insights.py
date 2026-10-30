"""Rule-based insights: daily risk, 15-day report and the caregiver assistant.

The numbers come from deterministic rules over the readings table, so they are
explainable and testable. An LLM can be added later to rewrite ``summary`` /
``narrative`` / ``answer``; the calculations should stay here.
"""

from datetime import datetime, timedelta, timezone
from statistics import mean
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.bp import BPCategory, BPTrend
from app.core.timeutils import to_naive_utc, utcnow
from app.models.notification import Notification
from app.models.patient import PatientProfile
from app.models.reading import BloodPressureReading
from app.models.reminder import ReminderSchedule
from app.schemas.insight import (
    AssistantAnswer,
    DailyAssessment,
    PeriodReport,
)
from app.services.monitoring import analyse_readings, get_latest_reading
from app.services.notifications import notify
from app.services.reminders import adherence_summary, get_schedule

CRISIS_ADVICE = (
    "Sit down and rest for 5 minutes, then measure again. If the reading stays "
    "at or above 180/120, or you have chest pain, shortness of breath, vision "
    "changes, weakness or trouble speaking, seek emergency care now."
)

# Local quiet window for the automatic daily notification.
DAILY_START_HOUR = 8
DAILY_END_HOUR = 12


def _round(value: float | None) -> float | None:
    return round(value, 1) if value is not None else None


def _missed(adherence: object) -> int:
    return (
        adherence.missed  # type: ignore[attr-defined]
        + adherence.escalated  # type: ignore[attr-defined]
        + adherence.unresolved  # type: ignore[attr-defined]
    )


def _readings_since(
    db: Session, patient_id: int, start: datetime, end: datetime | None = None
) -> list[BloodPressureReading]:
    stmt = select(BloodPressureReading).where(
        BloodPressureReading.patient_id == patient_id,
        BloodPressureReading.measured_at >= start,
    )
    if end is not None:
        stmt = stmt.where(BloodPressureReading.measured_at <= end)
    return list(
        db.scalars(
            stmt.order_by(
                BloodPressureReading.measured_at.asc(),
                BloodPressureReading.id.asc(),
            )
        )
    )


def daily_assessment(
    db: Session, patient: PatientProfile, now: datetime | None = None
) -> DailyAssessment:
    """Today's risk level with explicit reasons and actions."""
    now = to_naive_utc(now) if now is not None else utcnow()
    readings = _readings_since(db, patient.id, now - timedelta(hours=24), now)
    analysis = analyse_readings(db, patient, 7)
    adherence = adherence_summary(db, patient.id, 7)
    latest = get_latest_reading(db, patient.id)

    average_systolic = (
        _round(mean(item.systolic for item in readings)) if readings else None
    )
    average_diastolic = (
        _round(mean(item.diastolic for item in readings)) if readings else None
    )
    crisis_count = sum(1 for item in readings if item.category is BPCategory.crisis)
    missed = _missed(adherence)
    trend = analysis.trend

    reasons: list[str] = []
    if latest is None:
        risk = "no_data"
    else:
        if crisis_count or (latest and latest.category is BPCategory.crisis):
            risk = "critical"
        elif (
            (average_systolic is not None and average_systolic >= 140)
            or (average_diastolic is not None and average_diastolic >= 90)
            or missed >= 2
            or trend is BPTrend.worsening
        ):
            risk = "high"
        elif (
            (average_systolic is not None and average_systolic >= 130)
            or (average_diastolic is not None and average_diastolic >= 80)
            or missed == 1
            or not readings
        ):
            risk = "moderate"
        else:
            risk = "low"

    if crisis_count:
        reasons.append(f"{crisis_count} crisis reading(s) in the last 24 hours")
    if latest is not None and latest.category is BPCategory.crisis:
        reasons.append("The latest reading is in crisis range")
    if average_systolic is not None and (
        average_systolic >= 140 or (average_diastolic or 0) >= 90
    ):
        reasons.append("The 24-hour average is in stage 2 range")
    elif average_systolic is not None and (
        average_systolic >= 130 or (average_diastolic or 0) >= 80
    ):
        reasons.append("The 24-hour average is in stage 1 range")
    if analysis.readings_above_target:
        reasons.append(
            f"{analysis.readings_above_target} of {analysis.reading_count} readings "
            "were above the target in the last 7 days"
        )
    if missed:
        reasons.append(f"{missed} measurement(s) missed in the last 7 days")
    if trend is BPTrend.worsening:
        reasons.append("The systolic average is rising")
    if latest is None:
        reasons.append("No readings have been recorded yet")
    elif not readings:
        reasons.append("No reading in the last 24 hours")

    actions = {
        "critical": [
            CRISIS_ADVICE,
            "Tell your caregiver or a family member now.",
            "Do not drive yourself to the hospital.",
        ],
        "high": [
            "Measure again tonight and follow your measurement schedule.",
            "Take medications exactly as prescribed.",
            "Contact your clinician if the average stays high for 2 days.",
        ],
        "moderate": [
            "Keep measuring at the scheduled times.",
            "Reduce salt and caffeine, and stay active.",
            "Log any symptoms (headache, dizziness, chest pain) in the notes.",
        ],
        "low": [
            "Keep up the current routine and scheduled measurements.",
            "Continue your medications as prescribed.",
        ],
        "no_data": [
            "Take a blood pressure reading now and save it in the app.",
            "Set a measurement schedule so reminders can start.",
        ],
    }[risk]

    if risk == "no_data":
        headline = "Not enough data yet"
        summary = (
            "No readings have been recorded yet, so today's risk cannot be "
            "estimated. Take a measurement and save it in the app."
        )
    elif average_systolic is None:
        headline = f"{risk.title()} risk today"
        summary = (
            "No readings in the last 24 hours. Your latest saved reading is shown "
            "below."
        )
    else:
        headline = f"{risk.title()} risk today"
        summary = (
            f"Your 24-hour average is {average_systolic}/{average_diastolic} mmHg "
            f"across {len(readings)} reading(s)."
        )

    return DailyAssessment(
        generated_at=now,
        risk_level=risk,
        headline=headline,
        summary=summary,
        reasons=reasons,
        actions=actions,
        readings_last_24h=len(readings),
        average_systolic=average_systolic,
        average_diastolic=average_diastolic,
        latest_reading=None if latest is None else latest,
        missed_last_7_days=missed,
        adherence_percent_7_days=adherence.adherence_percent,
        trend_7_days=trend,
    )


def period_report(
    db: Session, patient: PatientProfile, days: int = 15, now: datetime | None = None
) -> PeriodReport:
    """A shareable narrative report for the last ``days`` days."""
    now = to_naive_utc(now) if now is not None else utcnow()
    analysis = analyse_readings(db, patient, days)
    adherence = adherence_summary(db, patient.id, days)
    missed = _missed(adherence)
    crisis_count = analysis.category_counts.get(BPCategory.crisis.value, 0)

    target = f"{patient.target_systolic or '-'}/{patient.target_diastolic or '-'} mmHg"
    highlights: list[str] = []
    if analysis.reading_count == 0:
        narrative = (
            f"No readings were recorded in the last {days} days, so this report "
            "cannot assess the blood pressure. Set a measurement schedule and "
            "take a reading to start the record."
        )
        highlights.append("No readings in the period")
    else:
        if adherence.expected:
            adherence_sentence = (
                f"{adherence.completed} of {adherence.expected} expected "
                f"measurements were completed ({adherence.adherence_percent}%)."
            )
        elif get_schedule(db, patient.id) is None:
            adherence_sentence = "No measurement schedule was set for this period."
        else:
            adherence_sentence = "No measurement window has elapsed yet in this period."

        target_sentence = (
            f"{analysis.in_target_percent}% of readings were within the target "
            f"of {target}."
            if analysis.in_target_percent is not None
            else "No personal blood pressure target is set."
        )
        trend_sentence = {
            BPTrend.improving: (
                "The systolic average is falling, which is a good sign."
            ),
            BPTrend.worsening: (
                "The systolic average is rising, which needs attention."
            ),
            BPTrend.stable: "The systolic average is stable across the period.",
            BPTrend.not_enough_data: (
                "There are not enough readings to establish a trend."
            ),
        }[analysis.trend]

        narrative = (
            f"In the last {days} days, {analysis.reading_count} readings were "
            f"recorded. {adherence_sentence} The average blood pressure was "
            f"{analysis.average_systolic}/{analysis.average_diastolic} mmHg. "
            f"{target_sentence} {trend_sentence}"
        )

        if analysis.category_counts.get(BPCategory.crisis.value):
            narrative += (
                f" There were {analysis.category_counts[BPCategory.crisis.value]} "
                "crisis reading(s); these need immediate medical review."
            )
        if _missed(adherence):
            narrative += (
                f" {_missed(adherence)} measurement(s) were missed or escalated."
            )

        highlights.extend(
            [
                (
                    f"Average: {analysis.average_systolic}/"
                    f"{analysis.average_diastolic} mmHg"
                ),
                f"Readings: {analysis.reading_count}",
                f"In target: {analysis.in_target_percent}%",
                f"Trend: {analysis.trend.value}",
            ]
        )
        if adherence.expected:
            highlights.append(f"Adherence: {adherence.adherence_percent}%")

    if analysis.reading_count == 0:
        risk = "no_data"
        headline = f"No readings in the last {days} days"
    elif crisis_count:
        risk = "critical"
        headline = f"Critical risk over the last {days} days"
    elif (
        (analysis.average_systolic or 0) >= 140
        or (analysis.average_diastolic or 0) >= 90
        or analysis.trend is BPTrend.worsening
        or (
            adherence.adherence_percent is not None and adherence.adherence_percent < 50
        )
    ):
        risk = "high"
        headline = f"High risk over the last {days} days"
    elif (
        (analysis.average_systolic or 0) >= 130
        or (analysis.average_diastolic or 0) >= 80
        or missed
        or (analysis.in_target_percent is not None and analysis.in_target_percent < 70)
    ):
        risk = "moderate"
        headline = f"Moderate risk over the last {days} days"
    else:
        risk = "low"
        headline = f"Low risk over the last {days} days"

    recommendations: list[str] = []
    if risk == "no_data":
        recommendations = [
            "Take a reading and save it so the next report has data.",
            "Set a measurement schedule in the app.",
        ]
    else:
        if crisis_count:
            recommendations.append(
                "Arrange immediate medical review for the crisis reading(s)."
            )
        if (analysis.average_systolic or 0) >= 140 or (
            analysis.average_diastolic or 0
        ) >= 90:
            recommendations.append(
                "Book a clinician review of the current medication plan."
            )
        elif (analysis.average_systolic or 0) >= 130 or (
            analysis.average_diastolic or 0
        ) >= 80:
            recommendations.append(
                "Review salt, caffeine and activity, and keep measuring."
            )
        if analysis.in_target_percent is not None and analysis.in_target_percent < 80:
            recommendations.append(
                "Most readings are above target; discuss the target with the clinician."
            )
        if missed:
            recommendations.append(
                "Measure at the scheduled times; snooze instead of skipping."
            )
        if analysis.trend is BPTrend.worsening:
            recommendations.append(
                "Take two readings a day and share this report with the caregiver."
            )
        if not recommendations:
            recommendations.append(
                "Keep the current routine; the numbers are in a good range."
            )

    return PeriodReport(
        period_days=days,
        generated_at=now,
        risk_level=risk,
        headline=headline,
        narrative=narrative,
        highlights=highlights,
        recommendations=recommendations,
        analysis=analysis,
        adherence=adherence,
    )


def send_daily_assessments(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Notify patients once per local day when today's risk is high/critical.

    The scheduler calls this hourly. Patients are processed between
    ``DAILY_START_HOUR`` and ``DAILY_END_HOUR`` in their schedule timezone (UTC
    when they have no schedule). Low/moderate results stay on demand so the
    inbox is not noisy.
    """
    moment = to_naive_utc(now) if now is not None else utcnow()
    schedules = {
        schedule.patient_id: schedule
        for schedule in db.scalars(
            select(ReminderSchedule).where(ReminderSchedule.is_active.is_(True))
        )
    }

    sent = 0
    for patient in db.scalars(select(PatientProfile)):
        schedule = schedules.get(patient.id)
        try:
            tz = ZoneInfo(schedule.timezone) if schedule else timezone.utc
        except (ZoneInfoNotFoundError, ValueError):
            tz = timezone.utc

        local_now = moment.replace(tzinfo=timezone.utc).astimezone(tz)
        if not (DAILY_START_HOUR <= local_now.hour < DAILY_END_HOUR):
            continue

        day_start = to_naive_utc(
            local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        )
        already_sent = db.scalar(
            select(Notification.id).where(
                Notification.user_id == patient.user_id,
                Notification.type == "daily_assessment",
                Notification.created_at >= day_start,
            )
        )
        if already_sent is not None:
            continue

        assessment = daily_assessment(db, patient, moment)
        if assessment.risk_level not in {"high", "critical"}:
            continue

        reason = assessment.reasons[0] if assessment.reasons else ""
        notify(
            db,
            user_id=patient.user_id,
            type="daily_assessment",
            title=f"Daily check: {assessment.risk_level} risk",
            body=assessment.summary + (f" {reason}." if reason else ""),
            data={
                "patient_id": patient.id,
                "risk_level": assessment.risk_level,
                "reasons": assessment.reasons,
                "actions": assessment.actions,
                "latest_reading_id": (
                    None
                    if assessment.latest_reading is None
                    else assessment.latest_reading.id
                ),
            },
        )
        sent += 1

    db.commit()
    return {"sent": sent}


def answer_question(
    db: Session, patient: PatientProfile, question: str
) -> AssistantAnswer:
    """Answer common caregiver questions from the patient's own data."""
    text = question.lower()
    analysis = analyse_readings(db, patient, 7)
    adherence = adherence_summary(db, patient.id, 7)
    latest = get_latest_reading(db, patient.id)
    missed = _missed(adherence)

    def fmt(reading: object) -> str:
        return (
            f"{reading.systolic}/{reading.diastolic} mmHg "  # type: ignore[attr-defined]
            f"({reading.category.value}) on "  # type: ignore[attr-defined]
            f"{reading.measured_at:%Y-%m-%d %H:%M} UTC"  # type: ignore[attr-defined]
        )

    if any(word in text for word in ("emergency", "crisis", "urgent", "danger")):
        crisis = analysis.category_counts.get(BPCategory.crisis.value, 0)
        if crisis:
            answer = (
                f"There were {crisis} crisis reading(s) in the last 7 days. "
                f"{CRISIS_ADVICE}"
            )
        else:
            answer = (
                "There are no crisis readings in the last 7 days. If the patient "
                f"feels unwell, call emergency services. {CRISIS_ADVICE}"
            )
        return AssistantAnswer(
            intent="emergency",
            answer=answer,
            data={"crisis_readings_7_days": crisis},
        )

    if any(word in text for word in ("average", "avg", "mean", "متوسط")):
        if analysis.average_systolic is None:
            answer = (
                "No readings were recorded in the last 7 days, so there is no "
                "average yet."
            )
        else:
            answer = (
                f"The 7-day average is {analysis.average_systolic}/"
                f"{analysis.average_diastolic} mmHg across "
                f"{analysis.reading_count} readings."
            )
        return AssistantAnswer(
            intent="average",
            answer=answer,
            data={
                "average_systolic": analysis.average_systolic,
                "average_diastolic": analysis.average_diastolic,
                "reading_count": analysis.reading_count,
            },
        )

    if any(word in text for word in ("adherence", "miss", "missed", "التزام")):
        if adherence.expected == 0:
            answer = (
                "No measurement schedule is set, so adherence cannot be calculated."
            )
        else:
            answer = (
                f"{adherence.completed} of {adherence.expected} expected measurements "
                f"were completed in the last 7 days ({adherence.adherence_percent}%). "
                f"{missed} were missed or escalated."
            )
        return AssistantAnswer(
            intent="adherence",
            answer=answer,
            data={
                "expected": adherence.expected,
                "completed": adherence.completed,
                "missed_or_escalated": missed,
                "adherence_percent": adherence.adherence_percent,
            },
        )

    if any(word in text for word in ("target", "goal", "within")):
        if patient.target_systolic is None and patient.target_diastolic is None:
            answer = "No personal blood pressure target is set yet."
        else:
            answer = (
                f"{analysis.readings_above_target} of {analysis.reading_count} "
                f"readings were above the target of {patient.target_systolic or '-'}/"
                f"{patient.target_diastolic or '-'} mmHg in the last 7 days. "
                f"{analysis.in_target_percent or 0}% were within target."
            )
        return AssistantAnswer(
            intent="target",
            answer=answer,
            data={
                "readings_above_target": analysis.readings_above_target,
                "reading_count": analysis.reading_count,
                "in_target_percent": analysis.in_target_percent,
            },
        )

    if any(
        word in text for word in ("trend", "worse", "worsening", "better", "improving")
    ):
        answer = {
            BPTrend.improving: (
                "The systolic average is falling, which is a good sign."
            ),
            BPTrend.worsening: (
                "The systolic average is rising, which needs attention."
            ),
            BPTrend.stable: "The systolic average is stable.",
            BPTrend.not_enough_data: (
                "There are not enough readings to establish a trend."
            ),
        }[analysis.trend]
        return AssistantAnswer(
            intent="trend",
            answer=answer,
            data={
                "trend": analysis.trend.value,
                "reading_count": analysis.reading_count,
            },
        )

    if any(word in text for word in ("latest", "last reading", "recent", "آخر")):
        if latest is None:
            answer = "No readings have been recorded yet."
        else:
            answer = f"The latest reading was {fmt(latest)}."
        return AssistantAnswer(
            intent="latest",
            answer=answer,
            data={} if latest is None else {"reading_id": latest.id},
        )

    if any(word in text for word in ("summary", "report", "overview", "حالة")):
        report = period_report(db, patient, 15)
        answer = report.narrative
        return AssistantAnswer(
            intent="summary",
            answer=answer,
            data={"risk_level": report.risk_level},
        )

    return AssistantAnswer(
        intent="help",
        answer=(
            "I can answer questions about the latest reading, the 7-day average, "
            "target compliance, adherence, trend, crisis readings, or a 15-day "
            "summary. Ask, for example: 'What is the average blood pressure?'"
        ),
        data={},
    )
