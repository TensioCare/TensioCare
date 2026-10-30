from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from tests.test_auth import (
    PATIENT_PAYLOAD,
    add_caregiver,
    caregiver_login,
    headers,
    register,
)


def auth(token: str) -> dict[str, str]:
    return headers(token)


def setup_patient(client: TestClient) -> tuple[dict, int]:
    patient = register(client, PATIENT_PAYLOAD)
    return patient, patient["user"]["patient_profile"]["id"]


def test_create_reading_and_classification(client: TestClient) -> None:
    patient, _ = setup_patient(client)
    token = patient["access_token"]

    response = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(token),
        json={"systolic": 150, "diastolic": 95, "pulse": 88},
    )
    assert response.status_code == 201, response.text
    reading = response.json()
    assert reading["category"] == "stage_2"
    assert reading["pulse_pressure"] == 55
    assert reading["mean_arterial_pressure"] == 113.3
    assert reading["source"] == "manual"

    latest = client.get("/api/v1/patients/me/readings/latest", headers=auth(token))
    assert latest.status_code == 200
    assert latest.json()["id"] == reading["id"]

    listed = client.get("/api/v1/patients/me/readings", headers=auth(token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_invalid_reading_is_rejected(client: TestClient) -> None:
    patient, _ = setup_patient(client)
    response = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json={"systolic": 80, "diastolic": 120},
    )
    assert response.status_code == 422


def test_device_pairing_and_unknown_device(client: TestClient) -> None:
    patient, _ = setup_patient(client)
    token = patient["access_token"]

    device = client.post(
        "/api/v1/patients/me/devices",
        headers=auth(token),
        json={"serial_number": "BP-1000", "label": "Home monitor", "model": "OMRON M3"},
    )
    assert device.status_code == 201, device.text

    duplicate = client.post(
        "/api/v1/patients/me/devices",
        headers=auth(token),
        json={"serial_number": "BP-1000"},
    )
    assert duplicate.status_code == 409

    reading = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(token),
        json={
            "systolic": 128,
            "diastolic": 78,
            "pulse": 70,
            "device_serial": "BP-1000",
        },
    )
    assert reading.status_code == 201
    assert reading.json()["device_id"] == device.json()["id"]
    assert reading.json()["source"] == "device"

    devices = client.get("/api/v1/patients/me/devices", headers=auth(token))
    assert devices.json()[0]["last_synced_at"] is not None

    unknown = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(token),
        json={"systolic": 120, "diastolic": 75, "device_serial": "NOPE"},
    )
    assert unknown.status_code == 404


def test_analysis_returns_trend_and_alerts(client: TestClient) -> None:
    patient, _ = setup_patient(client)
    token = patient["access_token"]
    now = datetime.now(timezone.utc)

    samples = [
        (145, 95, 5),
        (135, 85, 3),
        (125, 82, 1),
        (118, 76, 0),
    ]
    for systolic, diastolic, days_ago in samples:
        measured_at = (now - timedelta(days=days_ago)).isoformat()
        response = client.post(
            "/api/v1/patients/me/readings",
            headers=auth(token),
            json={
                "systolic": systolic,
                "diastolic": diastolic,
                "pulse": 80,
                "measured_at": measured_at,
            },
        )
        assert response.status_code == 201, response.text

    analysis = client.get(
        "/api/v1/patients/me/readings/analysis?days=7", headers=auth(token)
    )
    assert analysis.status_code == 200, analysis.text
    body = analysis.json()

    assert body["reading_count"] == 4
    assert body["average_systolic"] == 130.8
    assert body["average_diastolic"] == 84.5
    assert body["max_systolic"] == 145
    assert body["min_diastolic"] == 76
    assert body["category_counts"] == {"normal": 1, "stage_1": 2, "stage_2": 1}
    assert body["latest_reading"]["systolic"] == 118
    assert body["trend"] == "improving"
    assert body["target_systolic"] == 130
    assert body["readings_above_target"] == 3
    assert body["in_target_percent"] == 25.0
    assert any("stage 1" in alert for alert in body["alerts"])
    assert any("above the target" in alert for alert in body["alerts"])


def test_crisis_reading_is_flagged(client: TestClient) -> None:
    patient, _ = setup_patient(client)

    response = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json={"systolic": 190, "diastolic": 125},
    )
    assert response.status_code == 201
    assert response.json()["category"] == "crisis"

    analysis = client.get(
        "/api/v1/patients/me/readings/analysis", headers=auth(patient["access_token"])
    ).json()
    assert analysis["category_counts"]["crisis"] == 1
    assert any("crisis" in alert for alert in analysis["alerts"])


def test_caregiver_can_read_linked_patient_only(client: TestClient) -> None:
    patient, patient_profile_id = setup_patient(client)
    client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json={"systolic": 132, "diastolic": 86},
    )

    caregiver = caregiver_login(
        client, add_caregiver(client, patient["access_token"])["code"]
    )
    readings = client.get(
        f"/api/v1/caregivers/me/patients/{patient_profile_id}/readings",
        headers=auth(caregiver["access_token"]),
    )
    assert readings.status_code == 200
    assert len(readings.json()) == 1

    analysis = client.get(
        f"/api/v1/caregivers/me/patients/{patient_profile_id}/analysis",
        headers=auth(caregiver["access_token"]),
    )
    assert analysis.status_code == 200
    assert analysis.json()["reading_count"] == 1

    other_patient = register(
        client,
        {**PATIENT_PAYLOAD, "email": "other.patient@solvex-demo.com"},
    )
    stranger = caregiver_login(
        client, add_caregiver(client, other_patient["access_token"])["code"]
    )
    forbidden = client.get(
        f"/api/v1/caregivers/me/patients/{patient_profile_id}/readings",
        headers=auth(stranger["access_token"]),
    )
    assert forbidden.status_code == 403
