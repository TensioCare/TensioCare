"""Tests for the rule-based risk scoring and future-danger prediction."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from tests.test_auth import PATIENT_PAYLOAD, headers, register


def setup_patient(client: TestClient) -> tuple[str, int]:
    patient = register(client, PATIENT_PAYLOAD)
    token = patient["access_token"]
    profile_id = patient["user"]["patient_profile"]["id"]
    return token, profile_id


def post_reading(client: TestClient, token: str, systolic: int, diastolic: int, pulse: int = 72, days_ago: int = 0):
    measured_at = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return client.post(
        "/api/v1/patients/me/readings",
        headers=headers(token),
        json={
            "systolic": systolic,
            "diastolic": diastolic,
            "pulse": pulse,
            "measured_at": measured_at,
        },
    )


def test_risk_no_data(client: TestClient) -> None:
    token, _ = setup_patient(client)
    response = client.get("/api/v1/patients/me/risk", headers=headers(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current"]["risk_level"] == "no_data"
    assert body["current"]["risk_score"] == 0
    assert body["future_risk_level"] == "no_data"
    assert body["projections"] == []


def test_risk_single_high_reading(client: TestClient) -> None:
    token, _ = setup_patient(client)
    post_reading(client, token, 150, 95)
    response = client.get("/api/v1/patients/me/risk", headers=headers(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current"]["risk_score"] >= 25
    assert body["current"]["risk_level"] in {"moderate", "high", "critical"}
    assert body["current"]["readings_used"] == 1
    assert body["current"]["assessed_reading_id"] is not None


def test_risk_crisis_reading_is_critical(client: TestClient) -> None:
    token, _ = setup_patient(client)
    post_reading(client, token, 190, 125)
    response = client.get("/api/v1/patients/me/risk", headers=headers(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current"]["risk_level"] == "critical"
    assert body["current"]["risk_score"] >= 45


def test_risk_rising_trend_increases_score(client: TestClient) -> None:
    token, _ = setup_patient(client)
    # Flat baseline then rising.
    for i, s in enumerate([120, 122, 121, 123, 135, 145, 155]):
        post_reading(client, token, s, 85, days_ago=6 - i)
    response = client.get("/api/v1/patients/me/risk", headers=headers(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current"]["risk_score"] >= 25
    assert "rising" in body["direction"]
    assert body["slope_systolic_per_day"] is not None
    assert body["slope_systolic_per_day"] > 0


def test_risk_prediction_insufficient_data(client: TestClient) -> None:
    token, _ = setup_patient(client)
    for s in (120, 125):
        post_reading(client, token, s, 80)
    response = client.get("/api/v1/patients/me/risk", headers=headers(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["projections"] == []
    assert body["future_risk_level"] in {"low", "moderate", "high", "critical", "no_data"}


def test_risk_prediction_projects_breach(client: TestClient) -> None:
    token, _ = setup_patient(client)
    # Steady rise of ~5 mmHg/day.
    for i in range(8):
        post_reading(client, token, 118 + i * 5, 78, days_ago=7 - i)
    response = client.get("/api/v1/patients/me/risk", headers=headers(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["projections"]) == 3
    assert body["projections"][0]["horizon_days"] == 7
    assert body["days_until_stage_2"] is not None
    assert body["days_until_stage_2"] <= 14
    assert body["future_reasons"]


