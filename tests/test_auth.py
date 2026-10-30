from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models.caregiver import CaregiverPatient

PATIENT_PAYLOAD: dict[str, Any] = {
    "email": "jane.doe@solvex-demo.com",
    "password": "strong-password",
    "first_name": "Jane",
    "last_name": "Doe",
    "age": 34,
    "diagnosis": "Hypertension stage 1",
    "medical_history": "Hypertension since 2023",
    "allergies": "Penicillin",
    "medications": "Amlodipine 5mg",
    "target_systolic": 130,
    "target_diastolic": 80,
}

CAREGIVER_PAYLOAD: dict[str, Any] = {
    "first_name": "John",
    "last_name": "Doe",
    "relationship": "Brother",
    "phone": "+1 555 0111",
    "notes": "Lives with the patient",
    "priority": 1,
    "notify_after_minutes": 15,
}


def register(client: TestClient, payload: dict[str, Any]) -> dict[str, Any]:
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def add_caregiver(
    client: TestClient, patient_token: str, **overrides: Any
) -> dict[str, Any]:
    response = client.post(
        "/api/v1/patients/me/caregivers",
        headers=headers(patient_token),
        json={**CAREGIVER_PAYLOAD, **overrides},
    )
    assert response.status_code == 201, response.text
    return response.json()


def caregiver_login(client: TestClient, code: str) -> dict[str, Any]:
    response = client.post("/api/v1/auth/caregiver/login", json={"code": code})
    assert response.status_code == 200, response.text
    return response.json()


def test_register_patient_and_read_me(client: TestClient) -> None:
    body = register(client, PATIENT_PAYLOAD)
    assert body["token_type"] == "bearer"
    assert body["refresh_token"]
    assert body["user"]["role"] == "patient"
    assert body["user"]["email"] == PATIENT_PAYLOAD["email"]
    assert body["user"]["patient_profile"]["diagnosis"] == "Hypertension stage 1"
    assert body["user"]["caregiver_profile"] is None

    me = client.get("/api/v1/auth/me", headers=headers(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == PATIENT_PAYLOAD["email"]
    assert me.json()["patient_profile"]["target_systolic"] == 130


def test_patient_adds_caregiver_who_logs_in_with_the_code(
    client: TestClient,
) -> None:
    patient = register(client, PATIENT_PAYLOAD)
    patient_profile_id = patient["user"]["patient_profile"]["id"]

    created = add_caregiver(client, patient["access_token"])
    code = created["code"]
    assert len(code) == 9 and code[4] == "-"
    assert created["relationship"] == "Brother"
    assert created["priority"] == 1

    pending = client.get(
        "/api/v1/patients/me/caregivers", headers=headers(patient["access_token"])
    ).json()
    assert pending[0]["status"] == "pending"
    assert pending[0]["claimed_at"] is None

    preview = client.get(f"/api/v1/auth/caregiver-codes/{code}")
    assert preview.status_code == 200, preview.text
    assert preview.json() == {
        "patient_first_name": "Jane",
        "patient_last_name": "Doe",
        "caregiver_first_name": "John",
        "caregiver_last_name": "Doe",
        "relationship": "Brother",
        "claimed": False,
    }

    body = caregiver_login(client, code)
    assert body["user"]["role"] == "caregiver"
    assert body["user"]["email"] is None
    assert body["user"]["caregiver_profile"]["relationship"] == "Brother"
    assert (
        body["user"]["caregiver_profile"]["patients"][0]["patient_id"]
        == patient_profile_id
    )
    assert body["user"]["caregiver_profile"]["status"] == "active"

    linked = client.get(
        "/api/v1/caregivers/me/patients", headers=headers(body["access_token"])
    )
    assert linked.status_code == 200
    assert linked.json()[0]["patient_id"] == patient_profile_id

    # The same code signs the caregiver back in later.
    again = caregiver_login(client, code)
    assert again["user"]["id"] == body["user"]["id"]

    # The patient sees the caregiver as active.
    listed = client.get(
        "/api/v1/patients/me/caregivers", headers=headers(patient["access_token"])
    )
    assert listed.status_code == 200
    assert listed.json()[0]["status"] == "active"
    assert listed.json()[0]["claimed_at"] is not None


def test_code_is_case_and_dash_insensitive(client: TestClient) -> None:
    patient = register(client, PATIENT_PAYLOAD)
    code = add_caregiver(client, patient["access_token"])["code"]

    messy = f"  {code.lower().replace('-', ' ')}  "
    body = caregiver_login(client, messy)
    assert body["user"]["role"] == "caregiver"


def test_patient_has_many_caregivers_but_each_caregiver_has_one_patient(
    client: TestClient, db
) -> None:
    patient = register(client, PATIENT_PAYLOAD)
    first = add_caregiver(
        client, patient["access_token"], first_name="Sara", priority=1
    )
    second = add_caregiver(
        client, patient["access_token"], first_name="Omar", priority=2
    )

    first_login = caregiver_login(client, first["code"])
    second_login = caregiver_login(client, second["code"])

    for caregiver in (first_login, second_login):
        patients = client.get(
            "/api/v1/caregivers/me/patients",
            headers=headers(caregiver["access_token"]),
        ).json()
        assert [item["patient_id"] for item in patients] == [
            patient["user"]["patient_profile"]["id"]
        ]

    listed = client.get(
        "/api/v1/patients/me/caregivers", headers=headers(patient["access_token"])
    ).json()
    assert [item["first_name"] for item in listed] == ["Sara", "Omar"]

    # The database itself rejects a caregiver linked to a second patient.
    other = register(
        client, {**PATIENT_PAYLOAD, "email": "other.patient@solvex-demo.com"}
    )
    caregiver_id = first_login["user"]["caregiver_profile"]["id"]
    db.add(
        CaregiverPatient(
            caregiver_id=caregiver_id,
            patient_id=other["user"]["patient_profile"]["id"],
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_regenerating_the_code_invalidates_the_old_one(
    client: TestClient,
) -> None:
    patient = register(client, PATIENT_PAYLOAD)
    created = add_caregiver(client, patient["access_token"])

    regenerated = client.post(
        f"/api/v1/patients/me/caregivers/{created['caregiver_id']}/code",
        headers=headers(patient["access_token"]),
    )
    assert regenerated.status_code == 200, regenerated.text
    new_code = regenerated.json()["code"]
    assert new_code != created["code"]

    old = client.post("/api/v1/auth/caregiver/login", json={"code": created["code"]})
    assert old.status_code == 401

    caregiver_login(client, new_code)


def test_removing_a_caregiver_revokes_the_account_and_sessions(
    client: TestClient,
) -> None:
    patient = register(client, PATIENT_PAYLOAD)
    created = add_caregiver(client, patient["access_token"])
    caregiver = caregiver_login(client, created["code"])
    token = caregiver["access_token"]
    refresh_token = caregiver["refresh_token"]

    removed = client.delete(
        f"/api/v1/patients/me/caregivers/{created['caregiver_id']}",
        headers=headers(patient["access_token"]),
    )
    assert removed.status_code == 204

    assert client.get("/api/v1/auth/me", headers=headers(token)).status_code == 401
    rejected = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
    )
    assert rejected.status_code == 401
    assert (
        client.post(
            "/api/v1/auth/caregiver/login", json={"code": created["code"]}
        ).status_code
        == 401
    )
    assert (
        client.get(
            "/api/v1/patients/me/caregivers", headers=headers(patient["access_token"])
        ).json()
        == []
    )


def test_one_patient_cannot_remove_another_patients_caregiver(
    client: TestClient,
) -> None:
    patient = register(client, PATIENT_PAYLOAD)
    other = register(
        client, {**PATIENT_PAYLOAD, "email": "other.patient@solvex-demo.com"}
    )
    created = add_caregiver(client, patient["access_token"])

    response = client.delete(
        f"/api/v1/patients/me/caregivers/{created['caregiver_id']}",
        headers=headers(other["access_token"]),
    )
    assert response.status_code == 404


def test_patient_updates_profile(client: TestClient) -> None:
    patient = register(client, PATIENT_PAYLOAD)
    auth = headers(patient["access_token"])

    response = client.patch(
        "/api/v1/patients/me",
        headers=auth,
        json={
            "diagnosis": "Hypertension stage 2",
            "medical_history": "Hypertension, sleep apnea",
            "medications": "Amlodipine 10mg",
            "target_systolic": 125,
            "target_diastolic": 75,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["diagnosis"] == "Hypertension stage 2"
    assert body["target_diastolic"] == 75


def test_duplicate_email_is_rejected(client: TestClient) -> None:
    register(client, PATIENT_PAYLOAD)
    response = client.post("/api/v1/auth/register", json=PATIENT_PAYLOAD)
    assert response.status_code == 409


def test_caregiver_fields_are_rejected_on_registration(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={**PATIENT_PAYLOAD, "role": "caregiver", "relationship": "Son"},
    )
    assert response.status_code == 422


def test_login_success_and_failure(client: TestClient) -> None:
    register(client, PATIENT_PAYLOAD)

    ok = client.post(
        "/api/v1/auth/login",
        json={"email": PATIENT_PAYLOAD["email"], "password": "strong-password"},
    )
    assert ok.status_code == 200
    assert ok.json()["user"]["role"] == "patient"

    bad = client.post(
        "/api/v1/auth/login",
        json={"email": PATIENT_PAYLOAD["email"], "password": "wrong-password"},
    )
    assert bad.status_code == 401

    token_form = client.post(
        "/api/v1/auth/token",
        data={
            "username": PATIENT_PAYLOAD["email"],
            "password": "strong-password",
        },
    )
    assert token_form.status_code == 200
    assert "access_token" in token_form.json()


def test_refresh_token_rotation(client: TestClient) -> None:
    body = register(client, PATIENT_PAYLOAD)
    assert body["refresh_token"]
    assert body["expires_in"] == settings.access_token_expire_minutes * 60

    first_refresh = body["refresh_token"]
    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first_refresh}
    )
    assert refreshed.status_code == 200, refreshed.text
    data = refreshed.json()
    assert data["refresh_token"] != first_refresh
    assert data["expires_in"] == settings.access_token_expire_minutes * 60

    me = client.get("/api/v1/auth/me", headers=headers(data["access_token"]))
    assert me.status_code == 200

    # Refresh tokens are single-use: replaying the rotated one is rejected.
    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert replay.status_code == 401


def test_logout_revokes_refresh_token(client: TestClient) -> None:
    body = register(client, PATIENT_PAYLOAD)
    token = body["refresh_token"]

    out = client.post("/api/v1/auth/logout", json={"refresh_token": token})
    assert out.status_code == 204
    # Idempotent: logging out twice is not an error.
    assert (
        client.post("/api/v1/auth/logout", json={"refresh_token": token}).status_code
        == 204
    )

    rejected = client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert rejected.status_code == 401


def test_refresh_rejects_unknown_or_malformed_token(client: TestClient) -> None:
    unknown = client.post("/api/v1/auth/refresh", json={"refresh_token": "x" * 64})
    assert unknown.status_code == 401

    malformed = client.post("/api/v1/auth/refresh", json={"refresh_token": "short"})
    assert malformed.status_code == 422


def test_protected_routes_require_token_and_role(client: TestClient) -> None:
    anonymous = client.get("/api/v1/auth/me")
    assert anonymous.status_code == 401

    patient = register(client, PATIENT_PAYLOAD)
    patient_auth = headers(patient["access_token"])

    patient_on_caregiver_route = client.get(
        "/api/v1/caregivers/me/patients", headers=patient_auth
    )
    assert patient_on_caregiver_route.status_code == 403

    caregiver = caregiver_login(
        client, add_caregiver(client, patient["access_token"])["code"]
    )
    caregiver_on_patient_route = client.post(
        "/api/v1/patients/me/readings",
        headers=headers(caregiver["access_token"]),
        json={"systolic": 120, "diastolic": 80},
    )
    assert caregiver_on_patient_route.status_code == 403

    garbage = client.get("/api/v1/auth/me", headers=headers("not-a-real-token"))
    assert garbage.status_code == 401


def test_invalid_caregiver_code_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/auth/caregiver/login", json={"code": "ZZZZ-ZZZZ"})
    assert response.status_code == 401

    preview = client.get("/api/v1/auth/caregiver-codes/ZZZZ-ZZZZ")
    assert preview.status_code == 404
