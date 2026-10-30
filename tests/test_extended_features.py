from datetime import datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.timeutils import utcnow
from app.models.notification import Notification
from app.models.reading import BloodPressureReading
from app.services import reminders as reminder_service
from app.services.insights import send_daily_assessments
from app.services.notifications import notify
from tests.test_auth import (
    PATIENT_PAYLOAD,
    add_caregiver,
    caregiver_login,
    headers,
    register,
)


def auth(token: str) -> dict[str, str]:
    return headers(token)


def setup_patient(client: TestClient, **overrides: Any) -> dict[str, Any]:
    return register(client, {**PATIENT_PAYLOAD, **overrides})


def setup_caregiver(client: TestClient, patient: dict[str, Any]) -> dict[str, Any]:
    invite = add_caregiver(client, patient["access_token"])
    return caregiver_login(client, invite["code"])


def test_patient_edits_caregiver_details_and_ring(client: TestClient) -> None:
    patient = setup_patient(client)
    created = add_caregiver(client, patient["access_token"], priority=2)

    response = client.patch(
        f"/api/v1/patients/me/caregivers/{created['caregiver_id']}",
        headers=auth(patient["access_token"]),
        json={
            "first_name": "Sara",
            "relationship": "Daughter",
            "priority": 1,
            "notify_after_minutes": 30,
            "notes": "Works nearby",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["first_name"] == "Sara"
    assert body["relationship"] == "Daughter"
    assert body["priority"] == 1
    assert body["notify_after_minutes"] == 30
    assert body["notes"] == "Works nearby"

    listed = client.get(
        "/api/v1/patients/me/caregivers", headers=auth(patient["access_token"])
    ).json()
    assert listed[0]["first_name"] == "Sara"

    other = setup_patient(client, email="other.patient@solvex-demo.com")
    forbidden = client.patch(
        f"/api/v1/patients/me/caregivers/{created['caregiver_id']}",
        headers=auth(other["access_token"]),
        json={"priority": 3},
    )
    assert forbidden.status_code == 404


def test_caregiver_edits_own_details(client: TestClient) -> None:
    patient = setup_patient(client)
    caregiver = setup_caregiver(client, patient)

    response = client.patch(
        "/api/v1/caregivers/me",
        headers=auth(caregiver["access_token"]),
        json={
            "first_name": "Sara",
            "last_name": "Adel",
            "relationship": "Daughter",
            "phone": "+1 555 0999",
            "notes": "Prefers calls after 6pm",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["first_name"] == "Sara"
    assert body["caregiver_profile"]["phone"] == "+1 555 0999"
    assert body["caregiver_profile"]["notes"] == "Prefers calls after 6pm"

    me = client.get("/api/v1/auth/me", headers=auth(caregiver["access_token"]))
    assert me.json()["caregiver_profile"]["relationship"] == "Daughter"


def test_reading_context_idempotency_edit_and_delete(client: TestClient) -> None:
    patient = setup_patient(client)
    payload = {
        "systolic": 148,
        "diastolic": 94,
        "pulse": 88,
        "arm": "left",
        "position": "sitting",
        "resting_minutes": 5,
        "client_reading_id": "device-sync-0001",
    }

    first = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json=payload,
    )
    assert first.status_code == 201, first.text
    reading = first.json()
    assert reading["arm"] == "left"
    assert reading["position"] == "sitting"
    assert reading["resting_minutes"] == 5
    assert reading["client_reading_id"] == "device-sync-0001"

    # A retried device upload is ignored instead of creating a duplicate.
    retry = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json=payload,
    )
    assert retry.status_code == 201
    assert retry.json()["id"] == reading["id"]

    listed = client.get(
        "/api/v1/patients/me/readings", headers=auth(patient["access_token"])
    ).json()
    assert len(listed) == 1

    edited = client.patch(
        f"/api/v1/patients/me/readings/{reading['id']}",
        headers=auth(patient["access_token"]),
        json={"systolic": 138, "diastolic": 86, "notes": "Corrected cuff reading"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["systolic"] == 138
    assert edited.json()["category"] == "stage_1"
    assert edited.json()["notes"] == "Corrected cuff reading"

    invalid = client.patch(
        f"/api/v1/patients/me/readings/{reading['id']}",
        headers=auth(patient["access_token"]),
        json={"systolic": 80, "diastolic": 90},
    )
    assert invalid.status_code == 422

    deleted = client.delete(
        f"/api/v1/patients/me/readings/{reading['id']}",
        headers=auth(patient["access_token"]),
    )
    assert deleted.status_code == 204
    assert (
        client.get(
            "/api/v1/patients/me/readings", headers=auth(patient["access_token"])
        ).json()
        == []
    )


def test_csv_export_for_patient_and_caregiver(client: TestClient) -> None:
    patient = setup_patient(client)
    for systolic, diastolic in ((135, 85), (150, 95)):
        client.post(
            "/api/v1/patients/me/readings",
            headers=auth(patient["access_token"]),
            json={"systolic": systolic, "diastolic": diastolic},
        )

    export = client.get(
        "/api/v1/patients/me/readings/export.csv",
        headers=auth(patient["access_token"]),
    )
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    assert "measured_at_utc" in export.text
    assert "stage_2" in export.text

    caregiver = setup_caregiver(client, patient)
    patient_id = patient["user"]["patient_profile"]["id"]
    caregiver_export = client.get(
        f"/api/v1/caregivers/me/patients/{patient_id}/readings/export.csv",
        headers=auth(caregiver["access_token"]),
    )
    assert caregiver_export.status_code == 200
    assert "stage_2" in caregiver_export.text


def test_weekday_schedule_and_snooze(client: TestClient, session_factory) -> None:
    patient = setup_patient(client)

    schedule = client.put(
        "/api/v1/patients/me/reminders",
        headers=auth(patient["access_token"]),
        json={
            "timezone": "UTC",
            "times": ["08:00"],
            "days_of_week": [0],
            "grace_minutes": 60,
        },
    )
    assert schedule.status_code == 200, schedule.text
    assert schedule.json()["days_of_week"] == [0]

    # 2026-01-01 is a Thursday: a Monday-only schedule creates no windows.
    with session_factory() as db:
        assert reminder_service.generate_windows(db, datetime(2026, 1, 1, 0, 0)) == 0

    schedule = client.put(
        "/api/v1/patients/me/reminders",
        headers=auth(patient["access_token"]),
        json={
            "timezone": "UTC",
            "times": ["08:00"],
            "days_of_week": [0, 1, 2, 3, 4, 5, 6],
            "grace_minutes": 60,
        },
    )
    assert schedule.status_code == 200

    # Saving an active schedule materialises the upcoming windows right away.
    windows = client.get(
        "/api/v1/patients/me/reminders/windows?days=30",
        headers=auth(patient["access_token"]),
    ).json()
    assert windows
    window = windows[0]
    original_due = datetime.fromisoformat(window["due_at"])

    snoozed = client.post(
        f"/api/v1/patients/me/reminders/windows/{window['id']}/snooze",
        headers=auth(patient["access_token"]),
        json={"minutes": 15},
    )
    assert snoozed.status_code == 200, snoozed.text
    assert datetime.fromisoformat(snoozed.json()["due_at"]) == original_due + timedelta(
        minutes=15
    )
    assert snoozed.json()["status"] == "pending"

    # Only pending windows can be snoozed.
    with session_factory() as db:
        item = db.get(reminder_service.MeasurementWindow, window["id"])
        assert item is not None
        item.status = "missed"
        db.commit()
    rejected = client.post(
        f"/api/v1/patients/me/reminders/windows/{window['id']}/snooze",
        headers=auth(patient["access_token"]),
        json={"minutes": 15},
    )
    assert rejected.status_code == 409


def test_daily_assessment_report_and_assistant(client: TestClient) -> None:
    patient = setup_patient(client)
    tokens = auth(patient["access_token"])

    empty = client.get("/api/v1/patients/me/assessment", headers=tokens)
    assert empty.status_code == 200, empty.text
    assert empty.json()["risk_level"] == "no_data"
    assert empty.json()["actions"]

    now = utcnow()
    for hours, systolic, diastolic in ((2, 150, 95), (26, 148, 94), (50, 152, 96)):
        response = client.post(
            "/api/v1/patients/me/readings",
            headers=tokens,
            json={
                "systolic": systolic,
                "diastolic": diastolic,
                "pulse": 90,
                "measured_at": (now - timedelta(hours=hours)).isoformat(),
            },
        )
        assert response.status_code == 201, response.text

    assessment = client.get("/api/v1/patients/me/assessment", headers=tokens)
    assert assessment.status_code == 200, assessment.text
    body = assessment.json()
    assert body["risk_level"] in {"high", "critical"}
    assert body["readings_last_24h"] == 1
    assert body["latest_reading"]["systolic"] == 150
    assert body["reasons"]

    report = client.get("/api/v1/patients/me/reports/15-day", headers=tokens)
    assert report.status_code == 200, report.text
    report_body = report.json()
    assert report_body["period_days"] == 15
    assert report_body["analysis"]["reading_count"] == 3
    assert "In the last 15 days" in report_body["narrative"]
    assert report_body["recommendations"]

    average = client.post(
        "/api/v1/patients/me/assistant",
        headers=tokens,
        json={"question": "What is the average blood pressure?"},
    )
    assert average.status_code == 200, average.text
    assert average.json()["intent"] == "average"
    assert "average" in average.json()["answer"].lower()

    latest = client.post(
        "/api/v1/patients/me/assistant",
        headers=tokens,
        json={"question": "What was the last reading?"},
    )
    assert latest.json()["intent"] == "latest"

    emergency = client.post(
        "/api/v1/patients/me/assistant",
        headers=tokens,
        json={"question": "Is this an emergency?"},
    )
    assert emergency.json()["intent"] == "emergency"

    help_answer = client.post(
        "/api/v1/patients/me/assistant",
        headers=tokens,
        json={"question": "Tell me a joke"},
    )
    assert help_answer.json()["intent"] == "help"


def test_notification_type_filter(client: TestClient, session_factory) -> None:
    patient = setup_patient(client)
    with session_factory() as db:
        notify(
            db,
            user_id=patient["user"]["id"],
            type="measurement_reminder",
            title="Measure now",
            body="Scheduled measurement",
        )
        notify(
            db,
            user_id=patient["user"]["id"],
            type="caregiver_escalation",
            title="Missed",
            body="Escalated",
        )
        db.commit()

    everything = client.get(
        "/api/v1/notifications", headers=auth(patient["access_token"])
    )
    assert everything.status_code == 200
    assert everything.json()["total"] == 2

    filtered = client.get(
        "/api/v1/notifications?type=measurement_reminder",
        headers=auth(patient["access_token"]),
    )
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["type"] == "measurement_reminder"


def test_daily_assessment_job_notifies_once_per_day(
    client: TestClient, session_factory
) -> None:
    patient = setup_patient(client)
    patient_id = patient["user"]["patient_profile"]["id"]

    schedule = client.put(
        "/api/v1/patients/me/reminders",
        headers=auth(patient["access_token"]),
        json={
            "timezone": "UTC",
            "times": ["08:00"],
            "days_of_week": [0, 1, 2, 3, 4, 5, 6],
        },
    )
    assert schedule.status_code == 200, schedule.text

    now = utcnow().replace(hour=9, minute=0, second=0, microsecond=0)
    with session_factory() as db:
        db.add(
            BloodPressureReading(
                patient_id=patient_id,
                systolic=150,
                diastolic=95,
                measured_at=now - timedelta(hours=1),
                source="manual",
            )
        )
        db.commit()

        assert send_daily_assessments(db, now)["sent"] == 1
        # The same local day is deduplicated even if the hourly job runs again.
        assert send_daily_assessments(db, now + timedelta(hours=1))["sent"] == 0

        notes = db.scalars(
            select(Notification).where(Notification.type == "daily_assessment")
        ).all()
        assert len(notes) == 1
        assert notes[0].user_id == patient["user"]["id"]
        assert notes[0].data["risk_level"] in {"high", "critical"}

    with session_factory() as db:
        db.add(
            BloodPressureReading(
                patient_id=patient_id,
                systolic=155,
                diastolic=98,
                measured_at=now + timedelta(days=1) - timedelta(hours=1),
                source="manual",
            )
        )
        db.commit()
        assert send_daily_assessments(db, now + timedelta(days=1))["sent"] == 1


def test_measurement_plan_on_registration_and_profile(
    client: TestClient,
) -> None:
    body = register(
        client,
        {
            **PATIENT_PAYLOAD,
            "measurements_per_day": 2,
            "measurement_times": ["8am", "8pm"],
            "timezone": "Africa/Cairo",
        },
    )
    header = auth(body["access_token"])
    profile = body["user"]["patient_profile"]
    assert profile["measurements_per_day"] == 2
    assert profile["measurement_times"] == ["08:00", "20:00"]
    assert profile["timezone"] == "Africa/Cairo"

    schedule = client.get("/api/v1/patients/me/reminders", headers=header)
    assert schedule.status_code == 200
    assert schedule.json()["times"] == ["08:00", "20:00"]
    assert schedule.json()["timezone"] == "Africa/Cairo"

    updated = client.patch(
        "/api/v1/patients/me",
        headers=header,
        json={
            "measurements_per_day": 3,
            "measurement_times": ["8:00", "2pm", "8pm"],
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["measurements_per_day"] == 3
    assert updated.json()["measurement_times"] == ["08:00", "14:00", "20:00"]

    schedule = client.get("/api/v1/patients/me/reminders", headers=header)
    assert schedule.json()["times"] == ["08:00", "14:00", "20:00"]

    # Saving the reminder schedule directly also updates the profile fields.
    put = client.put(
        "/api/v1/patients/me/reminders",
        headers=header,
        json={
            "timezone": "UTC",
            "times": ["7:30", "9:30pm"],
            "days_of_week": [0, 1, 2, 3, 4],
            "grace_minutes": 90,
        },
    )
    assert put.status_code == 200, put.text
    profile = client.get("/api/v1/patients/me", headers=header).json()
    assert profile["measurements_per_day"] == 2
    assert profile["measurement_times"] == ["07:30", "21:30"]
    assert profile["timezone"] == "UTC"

    # An empty list disables reminders and clears the plan.
    cleared = client.patch(
        "/api/v1/patients/me",
        headers=header,
        json={"measurement_times": []},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["measurements_per_day"] is None
    assert cleared.json()["measurement_times"] == []
    assert client.get("/api/v1/patients/me/reminders", headers=header).json() is None


def test_measurement_plan_validation(client: TestClient) -> None:
    mismatch = client.post(
        "/api/v1/auth/register",
        json={
            **PATIENT_PAYLOAD,
            "email": "plan-mismatch@solvex-demo.com",
            "measurements_per_day": 3,
            "measurement_times": ["08:00", "20:00"],
        },
    )
    assert mismatch.status_code == 422

    missing_times = client.post(
        "/api/v1/auth/register",
        json={
            **PATIENT_PAYLOAD,
            "email": "plan-missing@solvex-demo.com",
            "measurements_per_day": 2,
        },
    )
    assert missing_times.status_code == 422

    bad_time = client.post(
        "/api/v1/auth/register",
        json={
            **PATIENT_PAYLOAD,
            "email": "plan-time@solvex-demo.com",
            "measurement_times": ["25:00"],
        },
    )
    assert bad_time.status_code == 422

    patient = register(
        client,
        {
            **PATIENT_PAYLOAD,
            "email": "plan-patch@solvex-demo.com",
            "measurement_times": ["08:00", "20:00"],
        },
    )
    header = auth(patient["access_token"])

    mismatch_patch = client.patch(
        "/api/v1/patients/me",
        headers=header,
        json={
            "measurements_per_day": 3,
            "measurement_times": ["08:00", "20:00"],
        },
    )
    assert mismatch_patch.status_code == 422

    count_only = client.patch(
        "/api/v1/patients/me",
        headers=header,
        json={"measurements_per_day": 1},
    )
    assert count_only.status_code == 422


def test_caregiver_insights_require_a_link(client: TestClient) -> None:
    patient = setup_patient(client)
    patient_id = patient["user"]["patient_profile"]["id"]
    client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json={"systolic": 130, "diastolic": 84},
    )

    caregiver = setup_caregiver(client, patient)
    for path in (
        f"/api/v1/caregivers/me/patients/{patient_id}/assessment",
        f"/api/v1/caregivers/me/patients/{patient_id}/reports/15-day",
    ):
        response = client.get(path, headers=auth(caregiver["access_token"]))
        assert response.status_code == 200, response.text

    assistant = client.post(
        f"/api/v1/caregivers/me/patients/{patient_id}/assistant",
        headers=auth(caregiver["access_token"]),
        json={"question": "How is the adherence?"},
    )
    assert assistant.status_code == 200
    assert assistant.json()["intent"] == "adherence"

    other = setup_patient(client, email="other.patient@solvex-demo.com")
    stranger = setup_caregiver(client, other)
    forbidden = client.get(
        f"/api/v1/caregivers/me/patients/{patient_id}/assessment",
        headers=auth(stranger["access_token"]),
    )
    assert forbidden.status_code == 403
