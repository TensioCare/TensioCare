import logging
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutils import utcnow
from app.models.caregiver import CaregiverPatient
from app.models.notification import Notification, PushDevice
from app.models.user import User, UserRole
from app.schemas.notification import PushDeviceCreate

logger = logging.getLogger(__name__)


def notify(
    db: Session,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    window_id: int | None = None,
) -> Notification:
    """Create an in-app notification and hand it to the push provider.

    The console sender is intentionally the only provider wired in: swap
    ``_send_push`` for FCM/APNs (or Expo) when the mobile app is ready.
    """
    now = utcnow()
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        data=data or {},
        status="sent",
        window_id=window_id,
        created_at=now,
        sent_at=now,
    )
    db.add(notification)
    db.flush()
    _send_push(notification)
    return notification


def _send_push(notification: Notification) -> None:
    """Placeholder push transport. Replace with FCM/APNs in production."""
    logger.info(
        "push user=%s type=%s title=%r",
        notification.user_id,
        notification.type,
        notification.title,
    )


def unread_count(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )


def mark_read(db: Session, user: User, notification: Notification) -> Notification:
    notification.read_at = notification.read_at or utcnow()
    notification.status = "read"
    db.commit()
    return notification


def mark_all_read(db: Session, user_id: int) -> int:
    now = utcnow()
    notifications = db.scalars(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
    ).all()
    for notification in notifications:
        notification.read_at = now
        notification.status = "read"
    db.commit()
    return len(notifications)


def acknowledge(db: Session, user: User, notification: Notification) -> Notification:
    """Acknowledge an escalation. This stops the caregiver ring for that window."""
    now = utcnow()
    notification.read_at = notification.read_at or now
    notification.status = "read"
    notification.acknowledged_at = now

    window = notification.window
    if window is not None:
        if user.role is not UserRole.caregiver or user.caregiver_profile is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a caregiver can acknowledge an escalation",
            )
        link = db.get(CaregiverPatient, (user.caregiver_profile.id, window.patient_id))
        if link is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This patient is not linked to your account",
            )
        if window.acknowledged_at is None:
            window.status = "acknowledged"
            window.acknowledged_at = now
            window.acknowledged_by_user_id = user.id
            window.next_escalation_at = None
            notify(
                db,
                user_id=window.patient.user_id,
                type="escalation_acknowledged",
                title=f"{user.first_name} acknowledged the alert",
                body=(
                    f"{user.first_name} knows you missed a measurement. "
                    "Please measure when you can."
                ),
                data={
                    "patient_id": window.patient_id,
                    "window_id": window.id,
                    "caregiver_user_id": user.id,
                },
                window_id=window.id,
            )

    db.commit()
    return notification


def register_push_device(
    db: Session, user: User, payload: PushDeviceCreate
) -> PushDevice:
    """Register (or refresh) a push token. A token belongs to one user at a time."""
    now = utcnow()
    device = db.scalar(select(PushDevice).where(PushDevice.token == payload.token))
    if device is None:
        device = PushDevice(
            user_id=user.id,
            token=payload.token,
            platform=payload.platform,
            is_active=True,
            created_at=now,
            last_seen_at=now,
        )
        db.add(device)
    else:
        device.user_id = user.id
        device.platform = payload.platform
        device.is_active = True
        device.last_seen_at = now

    db.commit()
    db.refresh(device)
    return device


def remove_push_device(db: Session, user: User, device_id: int) -> None:
    device = db.get(PushDevice, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Push device not found"
        )
    db.delete(device)
    db.commit()
