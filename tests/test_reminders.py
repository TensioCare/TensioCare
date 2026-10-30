from datetime import datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.timeutils import utcnow
from app.models.notification import Notification
from app.models.reminder import MeasurementWindow, ReminderSchedule
from app.services import reminders as reminder_service
from tests.test_auth import add_caregiver, caregiver_login

PATIENT: dict[str, Any] = {
    "email": "reminder.patient@solvex-demo.com",
    "password": "strong-password",
    "first_name": "Mona",
    "last_name": "Adel",
    "age": 67,
    "target_systolic": 130,
    "target_diastolic": 80,
}

CAREGIVER_A: dict[str, Any] = {
    "first_name": "Sara",
    "last_name": "Adel",
    "relationship": "Daughter",
    "phone": "+1 555 0101",
}

CAREGIVER_B: dict[str, Any] = {
    "first_name": "Omar",
    "last_name": "Adel",
    "relationship": "Son",
    "phone": "+1 555 0102",
}


def register(client: TestClient, payload: dict[str, Any]) -> dict[str, Any]:
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def setup_patient(client: TestClient) -> dict[str, Any]:
    return register(client, PATIENT)


def setup_caregiver(
    client: TestClient, patient_token: str, payload: dict[str, Any], priority: int
) -> dict[str, Any]:
    invite = add_caregiver(
        client, patient_token, **payload, priority=priority, notify_after_minutes=15
    )
    return caregiver_login(client, invite["code"])


def put_schedule(client: TestClient, token: str, **overrides: Any) -> dict[str, Any]:
    payload = {
        "timezone": "UTC",
        "times": ["08:00"],
        "grace_minutes": 60,
        "is_active": True,
        **overrides,
    }
    response = client.put(
        "/api/v1/patients/me/reminders", headers=auth(token), json=payload
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_schedule_crud_and_validation(client: TestClient) -> None:
    patient = setup_patient(client)
    headers = auth(patient["access_token"])

    empty = client.get("/api/v1/patients/me/reminders", headers=headers)
    assert empty.status_code == 200
    assert empty.json() is None

    created = put_schedule(
        client, patient["access_token"], times=["8:00 PM", "8:00 AM", "08:00"]
    )
    assert created["times"] == ["08:00", "20:00"]
    assert created["grace_minutes"] == 60

    bad_time = client.put(
        "/api/v1/patients/me/reminders",
        headers=headers,
        json={"timezone": "UTC", "times": ["25:00"]},
    )
    assert bad_time.status_code == 422

    bad_timezone = client.put(
        "/api/v1/patients/me/reminders",
        headers=headers,
        json={"timezone": "Mars/Olympus", "times": ["08:00"]},
    )
    assert bad_timezone.status_code == 422

    assert (
        client.delete("/api/v1/patients/me/reminders", headers=headers).status_code
        == 204
    )
    assert client.get("/api/v1/patients/me/reminders", headers=headers).json() is None


def test_window_generation_is_idempotent(client: TestClient, session_factory) -> None:
    patient = setup_patient(client)
    put_schedule(client, patient["access_token"])

    start = datetime(2026, 1, 1, 0, 0, 0)
    with session_factory() as db:
        created = reminder_service.generate_windows(db, start)
        again = reminder_service.generate_windows(db, start)
        windows = db.scalars(select(MeasurementWindow)).all()

    assert created == 2  # today and tomorrow at 08:00 (36h horizon)
    assert again == 0
    assert {window.due_at.hour for window in windows} == {8}


def test_edited_plan_does_not_backfill_past_windows(
    client: TestClient, session_factory
) -> None:
    patient = setup_patient(client)
    patient_id = patient["user"]["patient_profile"]["id"]

    schedule = ReminderSchedule(
        patient_id=patient_id,
        timezone="UTC",
        times=["08:00"],
        days_of_week=[0, 1, 2, 3, 4, 5, 6],
        grace_minutes=60,
        is_active=True,
    )
    schedule.updated_at = datetime(2026, 1, 1, 10, 0)

    with session_factory() as db:
        created = reminder_service.materialize_schedule(
            db, schedule, datetime(2026, 1, 1, 10, 0)
        )
        windows = db.scalars(
            select(MeasurementWindow).where(MeasurementWindow.patient_id == patient_id)
        ).all()

    # The 08:00 slot before the 10:00 edit is skipped; tomorrow's is kept.
    assert created == 1
    assert [window.due_at for window in windows] == [datetime(2026, 1, 2, 8, 0)]


def test_reminder_then_escalation_chain(client: TestClient, session_factory) -> None:
    patient = setup_patient(client)
    caregiver_a = setup_caregiver(
        client, patient["access_token"], CAREGIVER_A, priority=1
    )
    caregiver_b = setup_caregiver(
        client, patient["access_token"], CAREGIVER_B, priority=2
    )
    put_schedule(client, patient["access_token"], grace_minutes=60)

    with session_factory() as db:
        reminder_service.generate_windows(db, datetime(2026, 1, 1, 0, 0))

        # 08:01 -> reminder to the patient only.
        summary = reminder_service.process_windows(db, datetime(2026, 1, 1, 8, 1))
        assert summary["reminders"] == 1
        reminders = db.scalars(
            select(Notification).where(Notification.type == "measurement_reminder")
        ).all()
        assert [item.user_id for item in reminders] == [patient["user"]["id"]]

        # 09:05 -> grace (60 min) passed, priority 1 caregiver is alerted.
        summary = reminder_service.process_windows(db, datetime(2026, 1, 1, 9, 5))
        assert summary["missed"] == 1
        assert summary["escalations"] == 1
        escalations = db.scalars(
            select(Notification)
            .where(Notification.type == "caregiver_escalation")
            .order_by(Notification.id)
        ).all()
        assert [item.user_id for item in escalations] == [caregiver_a["user"]["id"]]

        # 09:21 -> no acknowledgement, fall back to priority 2.
        summary = reminder_service.process_windows(db, datetime(2026, 1, 1, 9, 21))
        assert summary["escalations"] == 1
        escalations = db.scalars(
            select(Notification)
            .where(Notification.type == "caregiver_escalation")
            .order_by(Notification.id)
        ).all()
        assert [item.user_id for item in escalations] == [
            caregiver_a["user"]["id"],
            caregiver_b["user"]["id"],
        ]

        # 09:37 -> ring exhausted, everybody is told it is unresolved.
        summary = reminder_service.process_windows(db, datetime(2026, 1, 1, 9, 37))
        assert summary["unresolved"] == 1
        unresolved = db.scalars(
            select(Notification).where(Notification.type == "escalation_unresolved")
        ).all()
        assert {item.user_id for item in unresolved} == {
            patient["user"]["id"],
            caregiver_a["user"]["id"],
            caregiver_b["user"]["id"],
        }


def test_acknowledgement_stops_the_ring(client: TestClient, session_factory) -> None:
    patient = setup_patient(client)
    caregiver_a = setup_caregiver(
        client, patient["access_token"], CAREGIVER_A, priority=1
    )
    caregiver_b = setup_caregiver(
        client, patient["access_token"], CAREGIVER_B, priority=2
    )
    put_schedule(client, patient["access_token"])

    with session_factory() as db:
        reminder_service.generate_windows(db, datetime(2026, 1, 1, 0, 0))
        reminder_service.process_windows(db, datetime(2026, 1, 1, 9, 5))
        escalation = db.scalar(
            select(Notification).where(Notification.type == "caregiver_escalation")
        )
        assert escalation is not None
        notification_id = escalation.id
        escalated_window_id = escalation.window_id

    acked = client.post(
        f"/api/v1/notifications/{notification_id}/ack",
        headers=auth(caregiver_a["access_token"]),
    )
    assert acked.status_code == 200, acked.text
    assert acked.json()["acknowledged_at"] is not None

    with session_factory() as db:
        window = db.get(MeasurementWindow, escalated_window_id)
        assert window is not None
        assert window.status == "acknowledged"

        summary = reminder_service.process_windows(db, datetime(2026, 1, 1, 10, 30))
        assert summary["escalations"] == 0
        assert summary["unresolved"] == 0

        ack_note = db.scalar(
            select(Notification).where(
                Notification.type == "escalation_acknowledged",
                Notification.user_id == patient["user"]["id"],
            )
        )
        assert ack_note is not None
        assert caregiver_a["user"]["first_name"] in ack_note.title

    # Another caregiver cannot acknowledge someone else's notification.
    stolen = client.post(
        f"/api/v1/notifications/{notification_id}/ack",
        headers=auth(caregiver_b["access_token"]),
    )
    assert stolen.status_code == 404


def test_patient_cannot_acknowledge_escalation(
    client: TestClient, session_factory
) -> None:
    patient = setup_patient(client)
    setup_caregiver(client, patient["access_token"], CAREGIVER_A, priority=1)
    put_schedule(client, patient["access_token"])

    with session_factory() as db:
        reminder_service.generate_windows(db, datetime(2026, 1, 1, 0, 0))
        reminder_service.process_windows(db, datetime(2026, 1, 1, 8, 1))
        reminder = db.scalar(
            select(Notification).where(Notification.type == "measurement_reminder")
        )
        assert reminder is not None
        notification_id = reminder.id

    response = client.post(
        f"/api/v1/notifications/{notification_id}/ack",
        headers=auth(patient["access_token"]),
    )
    assert response.status_code == 403


def test_reading_closes_the_window(client: TestClient, session_factory) -> None:
    patient = setup_patient(client)
    put_schedule(client, patient["access_token"])

    with session_factory() as db:
        reminder_service.generate_windows(db, datetime(2026, 1, 1, 0, 0))

    response = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json={
            "systolic": 128,
            "diastolic": 79,
            "pulse": 70,
            "measured_at": "2026-01-01T08:10:00Z",
        },
    )
    assert response.status_code == 201, response.text

    with session_factory() as db:
        window = db.scalar(
            select(MeasurementWindow).where(
                MeasurementWindow.due_at == datetime(2026, 1, 1, 8, 0)
            )
        )
        assert window is not None
        assert window.status == "completed"

        summary = reminder_service.process_windows(db, datetime(2026, 1, 1, 8, 30))
        assert summary["reminders"] == 0


def test_early_reading_cancels_the_reminder(
    client: TestClient, session_factory
) -> None:
    patient = setup_patient(client)
    put_schedule(client, patient["access_token"])

    with session_factory() as db:
        reminder_service.generate_windows(db, datetime(2026, 1, 1, 0, 0))

    response = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json={
            "systolic": 126,
            "diastolic": 78,
            "pulse": 70,
            "measured_at": "2026-01-01T07:50:00Z",
        },
    )
    assert response.status_code == 201, response.text

    with session_factory() as db:
        window = db.scalar(
            select(MeasurementWindow).where(
                MeasurementWindow.due_at == datetime(2026, 1, 1, 8, 0)
            )
        )
        assert window is not None
        assert window.status == "completed"

        summary = reminder_service.process_windows(db, datetime(2026, 1, 1, 8, 5))
        assert summary["reminders"] == 0


def test_reading_more_than_an_hour_early_does_not_cancel_the_reminder(
    client: TestClient, session_factory
) -> None:
    patient = setup_patient(client)
    put_schedule(client, patient["access_token"])

    with session_factory() as db:
        reminder_service.generate_windows(db, datetime(2026, 1, 1, 0, 0))

    response = client.post(
        "/api/v1/patients/me/readings",
        headers=auth(patient["access_token"]),
        json={
            "systolic": 126,
            "diastolic": 78,
            "pulse": 70,
            "measured_at": "2026-01-01T06:30:00Z",
        },
    )
    assert response.status_code == 201, response.text

    with session_factory() as db:
        window = db.scalar(
            select(MeasurementWindow).where(
                MeasurementWindow.due_at == datetime(2026, 1, 1, 8, 0)
            )
        )
        assert window is not None
        assert window.status == "pending"

        summary = reminder_service.process_windows(db, datetime(2026, 1, 1, 8, 0))
        assert summary["reminders"] == 1


def test_adherence_summary(client: TestClient, session_factory) -> None:
    patient = setup_patient(client)
    patient_id = patient["user"]["patient_profile"]["id"]
    now = utcnow()

    with session_factory() as db:
        db.add_all(
            [
                MeasurementWindow(
                    patient_id=patient_id,
                    due_at=now - timedelta(hours=2),
                    grace_minutes=60,
                    status="completed",
                    resolved_at=now - timedelta(hours=1),
                ),
                MeasurementWindow(
                    patient_id=patient_id,
                    due_at=now - timedelta(hours=26),
                    grace_minutes=60,
                    status="missed",
                ),
                MeasurementWindow(
                    patient_id=patient_id,
                    due_at=now - timedelta(hours=50),
                    grace_minutes=60,
                    status="escalated",
                ),
                MeasurementWindow(
                    patient_id=patient_id,
                    due_at=now - timedelta(hours=74),
                    grace_minutes=60,
                    status="acknowledged",
                    acknowledged_at=now - timedelta(hours=73),
                ),
            ]
        )
        db.commit()
        summary = reminder_service.adherence_summary(db, patient_id, days=30)

    assert summary.expected == 4
    assert summary.completed == 1
    assert summary.missed == 2
    assert summary.escalated == 1
    assert summary.adherence_percent == 25.0

    response = client.get(
        "/api/v1/patients/me/adherence?days=30",
        headers=auth(patient["access_token"]),
    )
    assert response.status_code == 200
    assert response.json()["expected"] == 4


def test_pending_window_within_grace_is_not_counted_yet(
    client: TestClient, session_factory
) -> None:
    patient = setup_patient(client)
    patient_id = patient["user"]["patient_profile"]["id"]
    now = utcnow()

    with session_factory() as db:
        db.add_all(
            [
                MeasurementWindow(
                    patient_id=patient_id,
                    due_at=now - timedelta(minutes=10),
                    grace_minutes=60,
                    status="pending",
                ),
                MeasurementWindow(
                    patient_id=patient_id,
                    due_at=now - timedelta(hours=3),
                    grace_minutes=60,
                    status="pending",
                ),
            ]
        )
        db.commit()
        summary = reminder_service.adherence_summary(db, patient_id, days=30)

        assert summary.expected == 1
        assert summary.missed == 0
        assert summary.completed == 0


def test_notifications_api_and_push_devices(
    client: TestClient, session_factory
) -> None:
    patient = setup_patient(client)
    headers = auth(patient["access_token"])
    user_id = patient["user"]["id"]

    with session_factory() as db:
        reminder_service.notify(
            db,
            user_id=user_id,
            type="measurement_reminder",
            title="Hello",
            body="First",
        )
        reminder_service.notify(
            db,
            user_id=user_id,
            type="measurement_missed",
            title="Hello again",
            body="Second",
        )
        db.commit()

    listing = client.get("/api/v1/notifications", headers=headers)
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 2
    assert body["unread"] == 2
    first_id = body["items"][0]["id"]

    assert client.get("/api/v1/notifications/unread-count", headers=headers).json() == {
        "unread": 2
    }

    read = client.post(f"/api/v1/notifications/{first_id}/read", headers=headers)
    assert read.status_code == 200
    assert read.json()["status"] == "read"
    assert client.get("/api/v1/notifications/unread-count", headers=headers).json() == {
        "unread": 1
    }

    assert client.post("/api/v1/notifications/read-all", headers=headers).json() == {
        "updated": 1
    }
    assert client.get("/api/v1/notifications/unread-count", headers=headers).json() == {
        "unread": 0
    }

    device = client.post(
        "/api/v1/notifications/devices",
        headers=headers,
        json={"token": "fcm-token-123456789", "platform": "android"},
    )
    assert device.status_code == 201, device.text
    device_id = device.json()["id"]

    again = client.post(
        "/api/v1/notifications/devices",
        headers=headers,
        json={"token": "fcm-token-123456789", "platform": "ios"},
    )
    assert again.status_code == 201
    assert again.json()["id"] == device_id
    assert again.json()["platform"] == "ios"

    devices = client.get("/api/v1/notifications/devices", headers=headers).json()
    assert len(devices) == 1

    assert (
        client.delete(
            f"/api/v1/notifications/devices/{device_id}", headers=headers
        ).status_code
        == 204
    )
    assert client.get("/api/v1/notifications/devices", headers=headers).json() == []


def test_notifications_are_private(client: TestClient) -> None:
    patient = setup_patient(client)
    other = register(
        client,
        {
            **PATIENT,
            "email": "other.patient@solvex-demo.com",
            "first_name": "Other",
        },
    )

    listed = client.get("/api/v1/notifications", headers=auth(other["access_token"]))
    assert listed.status_code == 200
    assert listed.json()["total"] == 0

    notifications = client.get(
        "/api/v1/notifications", headers=auth(patient["access_token"])
    )
    assert notifications.status_code == 200


def test_escalation_ring_order_and_update(client: TestClient) -> None:
    patient = setup_patient(client)
    patient_id = patient["user"]["patient_profile"]["id"]
    caregiver_a = setup_caregiver(
        client, patient["access_token"], CAREGIVER_A, priority=2
    )
    caregiver_b = setup_caregiver(
        client, patient["access_token"], CAREGIVER_B, priority=1
    )

    ring = client.get(
        "/api/v1/patients/me/caregivers", headers=auth(patient["access_token"])
    )
    assert ring.status_code == 200
    assert [item["priority"] for item in ring.json()] == [1, 2]
    assert ring.json()[0]["first_name"] == "Omar"

    updated = client.patch(
        f"/api/v1/caregivers/me/patients/{patient_id}",
        headers=auth(caregiver_a["access_token"]),
        json={"priority": 1, "notify_after_minutes": 30},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["priority"] == 1
    assert updated.json()["notify_after_minutes"] == 30
    assert updated.json()["is_primary_contact"] is True

    invalid = client.patch(
        f"/api/v1/caregivers/me/patients/{patient_id}",
        headers=auth(caregiver_a["access_token"]),
        json={"priority": 0},
    )
    assert invalid.status_code == 422

    # Caregiver B keeps priority 1 but has been linked earlier than A.
    caregiver_links = client.get(
        "/api/v1/caregivers/me/patients", headers=auth(caregiver_b["access_token"])
    )
    assert caregiver_links.status_code == 200
    assert caregiver_links.json()[0]["priority"] == 1


def test_caregiver_adherence_requires_a_link(client: TestClient) -> None:
    patient = setup_patient(client)
    patient_id = patient["user"]["patient_profile"]["id"]
    caregiver = setup_caregiver(
        client, patient["access_token"], CAREGIVER_A, priority=1
    )

    other_patient = register(
        client,
        {**PATIENT, "email": "other.patient@solvex-demo.com", "first_name": "Other"},
    )
    stranger = setup_caregiver(
        client, other_patient["access_token"], CAREGIVER_B, priority=1
    )

    linked = client.get(
        f"/api/v1/caregivers/me/patients/{patient_id}/adherence",
        headers=auth(caregiver["access_token"]),
    )
    assert linked.status_code == 200
    assert linked.json()["expected"] == 0

    forbidden = client.get(
        f"/api/v1/caregivers/me/patients/{patient_id}/adherence",
        headers=auth(stranger["access_token"]),
    )
    assert forbidden.status_code == 403
