from app.core.config import settings
from app.core.timeutils import utcnow
from app.models.notification import Notification, PushDevice
from app.models.user import User, UserRole
from app.services.push import send_expo_push


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


def test_expo_push_sends_and_deactivates_stale_token(
    session_factory, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "push_enabled", True)

    with session_factory() as db:
        user = User(
            email="push@example.com",
            first_name="Push",
            last_name="Tester",
            age=40,
            role=UserRole.patient,
            is_active=True,
        )
        db.add(user)
        db.flush()
        device = PushDevice(
            user_id=user.id,
            token="ExponentPushToken[test-token]",
            platform="android",
            is_active=True,
        )
        notification = Notification(
            user_id=user.id,
            type="measurement_missed",
            title="Measurement missed",
            body="Please measure when you can.",
            data={"window_id": 7},
            status="sent",
            created_at=utcnow(),
            sent_at=utcnow(),
        )
        db.add_all([device, notification])
        db.flush()

        captured: dict = {}

        def fake_post(url, *, json, headers, timeout):
            captured.update(
                {"url": url, "messages": json, "headers": headers, "timeout": timeout}
            )
            return FakeResponse(
                {
                    "data": [
                        {
                            "status": "error",
                            "message": "Device is not registered",
                            "details": {"error": "DeviceNotRegistered"},
                        }
                    ]
                }
            )

        monkeypatch.setattr("app.services.push.httpx.post", fake_post)

        send_expo_push(db, notification)

        assert captured["url"] == settings.expo_push_url
        assert captured["messages"][0]["to"] == "ExponentPushToken[test-token]"
        assert captured["messages"][0]["title"] == "Measurement missed"
        assert captured["messages"][0]["data"]["notification_id"] == notification.id
        assert captured["messages"][0]["data"]["type"] == "measurement_missed"
        assert device.is_active is False
