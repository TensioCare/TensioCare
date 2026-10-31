"""Rule-based risk scoring and future-danger prediction.

Ported and extended from the TensiGuard DZ reference model (ai.py). The
scoring is a transparent weighted sum so every point is explainable, which
matters for a health app. The ``symptoms`` argument is optional and defaults
to an empty list: when symptom capture ships (a dedicated column + UI chips)
the same function is activated with one extra argument.

Two entry points:
- ``assess_risk``  -> danger *now* (0-100 score + level + reasons)
- ``predict_risk`` -> danger *now* + a forward-looking trajectory projection
"""

from __future__ import annotations

import json
from datetime import timedelta
from statistics import mean, pstdev

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.bp import (
    BPCategory,
    classify,
    fit_slope,
)
from app.core.timeutils import utcnow, to_naive_utc
from app.models.caregiver import CaregiverPatient, CaregiverProfile
from app.models.notification import Notification
from app.models.patient import PatientProfile
from app.models.reading import BloodPressureReading
from app.models.risk_assessment import RiskAssessment as RiskAssessmentRow
from app.models.user import User
from app.schemas.insight import (
    FutureProjection,
    RiskAssessment,
    RiskPrediction,
)
from app.services.notifications import notify
from app.services.reminders import _ordered_links, adherence_summary

MODEL_VERSION = "rules-v1.1"

DISCLAIMER = (
    "Educational decision support only; not a diagnosis. Contact a healthcare "
    "professional for high readings or concerning symptoms."
)

EMERGENCY_SYMPTOMS = {
    "chest pain",
    "severe headache",
    "shortness of breath",
    "fainting",
    "vision problems",
    "weakness on one side",
}

# Thresholds for the "rising" trigger (mmHg per day).
RISING_THRESHOLD_PER_DAY = 2.0


def _readings(db: Session, patient_id: int, days: int) -> list[BloodPressureReading]:
    start = to_naive_utc(utcnow() - timedelta(days=days))
    return list(
        db.scalars(
            select(BloodPressureReading)
            .where(
                BloodPressureReading.patient_id == patient_id,
                BloodPressureReading.measured_at >= start,
            )
            .order_by(
                BloodPressureReading.measured_at.asc(),
                BloodPressureReading.id.asc(),
            )
        )
    )


def _age(patient: PatientProfile) -> int | None:
    user = getattr(patient, "user", None)
    if isinstance(user, User):
        return user.age
    return None


def assess_risk(
    db: Session,
    patient: PatientProfile,
    symptoms: list[str] | None = None,
) -> RiskAssessment:
    """Compute the current danger level for a patient."""
    rows = _readings(db, patient.id, 7)

    if symptoms is None:
        latest_for_symptoms = rows[-1] if rows else None
        symptom_source = (
            latest_for_symptoms.symptoms_list
            if latest_for_symptoms is not None
            else []
        )
    else:
        symptom_source = symptoms
    symptom_set = {s.strip().lower() for s in symptom_source if s.strip()}
    generated_at = utcnow()

    if not rows:
        return RiskAssessment(
            generated_at=generated_at,
            risk_level="no_data",
            risk_score=0,
            classification="Insufficient data",
            reasons=["No readings have been recorded in the last 7 days."],
            recommendations=[
                "Take a blood pressure reading now and save it in the app.",
                "Set a measurement schedule so reminders can start.",
            ],
            model_version=MODEL_VERSION,
            assessed_reading_id=None,
            readings_used=0,
            disclaimer=DISCLAIMER,
        )

    latest = rows[-1]
    score = 0
    reasons: list[str] = []
    systolic = latest.systolic
    diastolic = latest.diastolic

    # Blood pressure thresholds (mutually exclusive tiers).
    if systolic >= 180 or diastolic >= 120:
        score += 45
        reasons.append(
            f"Systolic pressure is {systolic} mmHg, above the urgent threshold."
        )
    elif systolic >= 140 or diastolic >= 90:
        score += 25
        reasons.append(
            f"Latest pressure is {systolic}/{diastolic} mmHg, which is very high."
        )
    elif systolic >= 130 or diastolic >= 80:
        score += 12

    # Pulse.
    if latest.pulse is not None:
        if latest.pulse >= 120:
            score += 12
            reasons.append("The pulse is very high.")
        elif latest.pulse < 45:
            score += 6

    # Repeated high readings in the last 7 days.
    high = [r for r in rows if r.systolic >= 130 or r.diastolic >= 80]
    if len(high) >= 3:
        score += min(20, len(high) * 4)
        reasons.append(
            f"{len(high)} high readings were recorded in the last seven days."
        )

    # Rising trend (least-squares slope over elapsed days).
    slope, _, _ = fit_slope(
        [ (r.measured_at - rows[0].measured_at).total_seconds() / 86400.0
          for r in rows ],
        [float(r.systolic) for r in rows],
    )
    if slope > RISING_THRESHOLD_PER_DAY:
        score += 10
        reasons.append("Systolic pressure is rising over the last week.")

    # Variability.
    systolic_values = [r.systolic for r in rows]
    variability = pstdev(systolic_values) if len(systolic_values) > 1 else 0.0
    if variability > 15:
        score += 8
        reasons.append("Blood pressure readings vary more than usual.")

    # Symptoms (optional, activated when capture ships).
    urgent = symptom_set & EMERGENCY_SYMPTOMS
    if urgent:
        score += 35
        reasons.append(
            "Urgent symptoms were reported, including "
            + ", ".join(sorted(urgent))
            + "."
        )
    elif symptom_set:
        score += 7
        reasons.append("A symptom was reported with the latest measurement.")

    # Age.
    age = _age(patient)
    if age is not None and age >= 65:
        score += 5

    score = min(score, 100)

    # Crisis reading anywhere in the window forces Urgent.
    crisis_in_window = any(r.category is BPCategory.crisis for r in rows)
    if urgent or crisis_in_window or score >= 75 or systolic >= 180 or diastolic >= 120:
        level = "critical"
    elif score >= 50:
        level = "high"
    elif score >= 25:
        level = "moderate"
    else:
        level = "low"

    if not reasons:
        reasons.append("No concerning signals in the last 7 days.")

    recommendations = _recommendations(level, crisis_in_window)
    classification = classify(systolic, diastolic).value

    # Persist an audit row (best-effort; never break the read path).
    try:
        db.add(
            RiskAssessmentRow(
                patient_id=patient.id,
                assessed_reading_id=latest.id,
                risk_level=level,
                risk_score=score,
                classification=classification,
                reasons=json.dumps(reasons, ensure_ascii=False),
                recommendations=json.dumps(recommendations, ensure_ascii=False),
                model_version=MODEL_VERSION,
                readings_used=len(rows),
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()

    return RiskAssessment(
        generated_at=generated_at,
        risk_level=level,
        risk_score=score,
        classification=classification,
        reasons=reasons,
        recommendations=recommendations,
        model_version=MODEL_VERSION,
        assessed_reading_id=latest.id,
        readings_used=len(rows),
        disclaimer=DISCLAIMER,
    )


def anomalies(db: Session, patient: PatientProfile) -> dict:
    """Detect suspicious/extreme/sudden readings in the last 30 days."""
    rows = _readings(db, patient.id, 30)[-30:]
    findings: list[dict] = []
    for i, reading in enumerate(rows):
        if reading.systolic <= reading.diastolic:
            findings.append(
                {
                    "reading_id": reading.id,
                    "kind": "suspicious_values",
                    "message": "Systolic pressure is not above diastolic pressure.",
                }
            )
        if (
            reading.systolic < 70
            or reading.systolic > 260
            or reading.diastolic < 40
            or reading.diastolic > 160
            or (reading.pulse is not None and (reading.pulse < 25 or reading.pulse > 220))
        ):
            findings.append(
                {
                    "reading_id": reading.id,
                    "kind": "extreme_value",
                    "message": "This reading contains an extreme value and should be checked again.",
                }
            )
        if i and abs(reading.systolic - rows[i - 1].systolic) >= 30:
            findings.append(
                {
                    "reading_id": reading.id,
                    "kind": "sudden_spike",
                    "message": "The systolic pressure changed suddenly between measurements.",
                }
            )
    return {
        "count": len(findings),
        "findings": findings,
        "disclaimer": DISCLAIMER,
    }


def notify_caregivers_of_critical_risk(
    db: Session, patient: PatientProfile, risk: RiskAssessment
) -> None:
    """Best-effort notification to linked caregivers when risk is critical."""
    if risk.risk_level != "critical":
        return
    try:
        links = _ordered_links(db, patient.id)
    except Exception:  # noqa: BLE001
        links = []
    reason = risk.reasons[0] if risk.reasons else ""
    for link in links:
        try:
            notify(
                db,
                user_id=link.caregiver.user_id,
                type="risk_critical",
                title=f"{patient.user.first_name if patient.user else 'Patient'} is at critical risk",
                body=f"Risk score {risk.risk_score}/100. {reason}",
                data={
                    "patient_id": patient.id,
                    "risk_level": risk.risk_level,
                    "risk_score": risk.risk_score,
                },
            )
        except Exception:  # noqa: BLE001
            pass
    try:
        notify(
            db,
            user_id=patient.user_id,
            type="risk_critical",
            title="Critical risk detected",
            body=f"Risk score {risk.risk_score}/100. {reason}",
            data={"patient_id": patient.id, "risk_level": risk.risk_level},
        )
    except Exception:  # noqa: BLE001
        pass
    try:
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def _recommendations(level: str, crisis: bool) -> list[str]:
    if level == "critical":
        return [
            "Sit down and rest quietly.",
            "Repeat the measurement after five minutes if it is safe.",
            "Call emergency assistance now if symptoms persist or readings stay "
            "at or above 180/120.",
            "Tell your caregiver or a family member.",
        ]
    if level == "high":
        return [
            "Measure again tonight and follow your measurement schedule.",
            "Take medications exactly as prescribed.",
            "Contact your clinician if the average stays high for 2 days.",
        ]
    if level == "moderate":
        return [
            "Keep measuring at the scheduled times.",
            "Reduce salt and caffeine, and stay active.",
            "Log any symptoms in the notes.",
        ]
    return [
        "Keep up the current routine and scheduled measurements.",
        "Continue your medications as prescribed.",
    ]


def predict_risk(
    db: Session,
    patient: PatientProfile,
    symptoms: list[str] | None = None,
) -> RiskPrediction:
    """Current danger plus a forward-looking trajectory projection."""
    current = assess_risk(db, patient, symptoms)
    generated_at = utcnow()
    rows = _readings(db, patient.id, 14)

    # Miss probability (ported from the reference adherence model).
    miss_probability: float | None = None
    try:
        adherence = adherence_summary(db, patient.id, 7)
        misses = adherence.missed
        if rows:
            naive = [
                (r.measured_at.replace(tzinfo=None) if r.measured_at.tzinfo else r.measured_at)
                for r in rows
            ]
            intervals = [
                (naive[i] - naive[i - 1]).total_seconds() / 86400.0
                for i in range(1, len(naive))
            ]
            irregularity = pstdev(intervals) if len(intervals) > 1 else 0.0
            frequency = len(rows) / max(
                1, (utcnow() - naive[0]).days or 1
            )
            probability = min(
                0.95,
                0.15
                + irregularity * 0.025
                + misses * 0.08
                + max(0, 0.25 - frequency * 0.03),
            )
            miss_probability = round(probability, 2)
    except Exception:  # noqa: BLE001
        miss_probability = None

    # Insufficient data -> return a minimal prediction.
    if len(rows) < 4:
        return RiskPrediction(
            generated_at=generated_at,
            current=current,
            direction="stable",
            slope_systolic_per_day=None,
            slope_diastolic_per_day=None,
            variability_systolic=None,
            projections=[],
            days_until_target_breach=None,
            days_until_stage_2=None,
            days_until_crisis=None,
            probability_of_missing_next_measurement=miss_probability,
            future_risk_level=current.risk_level,
            future_reasons=[
                "Not enough readings to establish a trajectory. "
                "Keep measuring at the scheduled times."
            ],
            disclaimer=DISCLAIMER,
        )

    xs = [
        (r.measured_at - rows[0].measured_at).total_seconds() / 86400.0
        for r in rows
    ]
    slope_sys, _, r2_sys = fit_slope(xs, [float(r.systolic) for r in rows])
    slope_dia, _, _ = fit_slope(xs, [float(r.diastolic) for r in rows])

    ss = [r.systolic for r in rows]
    variability = pstdev(ss) if len(ss) > 1 else 0.0

    recent = rows[-3:]
    cur_sys = mean(r.systolic for r in recent)
    cur_dia = mean(r.diastolic for r in recent)

    if slope_sys > 1.0:
        direction = "rising"
    elif slope_sys < -1.0:
        direction = "falling"
    else:
        direction = "stable"

    # Confidence.
    n = len(rows)
    if n >= 10 and r2_sys >= 0.4 and variability < 15:
        confidence = "high"
    elif n >= 6 and r2_sys >= 0.2:
        confidence = "moderate"
    else:
        confidence = "low"

    projections: list[FutureProjection] = []
    for horizon in (7, 14, 30):
        ps = cur_sys + slope_sys * horizon
        pd = cur_dia + slope_dia * horizon
        projections.append(
            FutureProjection(
                horizon_days=horizon,
                projected_systolic=round(ps, 1),
                projected_diastolic=round(pd, 1),
                projected_category=classify(round(ps), round(pd)).value,
                confidence=confidence,
            )
        )

    def days_until(threshold: float) -> int | None:
        if slope_sys <= 0:
            return None
        needed = threshold - cur_sys
        if needed <= 0:
            return 0
        return max(1, int(needed / slope_sys) + 1)

    target = patient.target_systolic if patient.target_systolic is not None else 130
    days_target = days_until(target)
    days_stage_2 = days_until(140)
    days_crisis = days_until(180)

    # Future risk level + reasons.
    future_reasons: list[str] = []
    future_level = current.risk_level

    if direction == "rising":
        future_reasons.append(
            f"Systolic pressure is rising by about {round(slope_sys, 1)} mmHg per day."
        )
        if days_stage_2 is not None and days_stage_2 <= 14:
            future_reasons.append(
                f"At this rate it could reach stage 2 (>=140) in about "
                f"{days_stage_2} day(s)."
            )
            if future_level in ("low", "moderate"):
                future_level = "high"
        if days_crisis is not None and days_crisis <= 30:
            future_reasons.append(
                f"Projected to reach crisis (>=180) in about {days_crisis} day(s)."
            )
            future_level = "critical"
    elif direction == "falling":
        future_reasons.append(
            "Systolic pressure is trending down, which is a good sign."
        )
    else:
        future_reasons.append("Systolic pressure is stable across the period.")

    if miss_probability is not None and miss_probability >= 0.5:
        future_reasons.append(
            f"About {round(miss_probability * 100)}% chance of missing the "
            "next measurement."
        )

    if not future_reasons:
        future_reasons.append("No concerning trajectory detected.")

    return RiskPrediction(
        generated_at=generated_at,
        current=current,
        direction=direction,
        slope_systolic_per_day=round(slope_sys, 2),
        slope_diastolic_per_day=round(slope_dia, 2),
        variability_systolic=round(variability, 1),
        projections=projections,
        days_until_target_breach=days_target,
        days_until_stage_2=days_stage_2,
        days_until_crisis=days_crisis,
        probability_of_missing_next_measurement=miss_probability,
        future_risk_level=future_level,
        future_reasons=future_reasons,
        disclaimer=DISCLAIMER,
    )
