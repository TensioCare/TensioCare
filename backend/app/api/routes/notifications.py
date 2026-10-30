from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.models.notification import Notification, PushDevice
from app.schemas.notification import (
    NotificationList,
    NotificationRead,
    PushDeviceCreate,
    PushDeviceRead,
)
from app.services import notifications as notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _get_notification(
    db: DbSession, user_id: int, notification_id: int
) -> Notification:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )
    return notification


@router.get("", response_model=NotificationList, summary="My notifications")
def list_notifications(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    unread_only: bool = False,
    notification_type: str | None = Query(default=None, alias="type"),
) -> NotificationList:
    conditions = [Notification.user_id == current_user.id]
    if unread_only:
        conditions.append(Notification.read_at.is_(None))
    if notification_type:
        conditions.append(Notification.type == notification_type)

    items = db.scalars(
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    total = db.scalar(select(func.count(Notification.id)).where(*conditions)) or 0

    return NotificationList(
        items=[NotificationRead.model_validate(item) for item in items],
        total=total,
        unread=notification_service.unread_count(db, current_user.id),
    )


@router.get("/unread-count", summary="Badge count")
def get_unread_count(current_user: CurrentUser, db: DbSession) -> dict[str, int]:
    return {"unread": notification_service.unread_count(db, current_user.id)}


@router.post("/{notification_id}/read", response_model=NotificationRead)
def read_notification(
    notification_id: int, current_user: CurrentUser, db: DbSession
) -> Notification:
    notification = _get_notification(db, current_user.id, notification_id)
    return notification_service.mark_read(db, current_user, notification)


@router.post("/read-all", summary="Mark every notification as read")
def read_all(current_user: CurrentUser, db: DbSession) -> dict[str, int]:
    return {"updated": notification_service.mark_all_read(db, current_user.id)}


@router.post(
    "/{notification_id}/ack",
    response_model=NotificationRead,
    summary="Acknowledge an escalation (stops the caregiver ring)",
)
def acknowledge_notification(
    notification_id: int, current_user: CurrentUser, db: DbSession
) -> Notification:
    notification = _get_notification(db, current_user.id, notification_id)
    return notification_service.acknowledge(db, current_user, notification)


@router.post(
    "/devices",
    response_model=PushDeviceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register this phone for push notifications",
)
def register_device(
    payload: PushDeviceCreate, current_user: CurrentUser, db: DbSession
) -> PushDevice:
    return notification_service.register_push_device(db, current_user, payload)


@router.get("/devices", response_model=list[PushDeviceRead])
def list_devices(current_user: CurrentUser, db: DbSession) -> list[PushDevice]:
    return list(
        db.scalars(
            select(PushDevice)
            .where(PushDevice.user_id == current_user.id)
            .order_by(PushDevice.id)
        )
    )


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(device_id: int, current_user: CurrentUser, db: DbSession) -> None:
    notification_service.remove_push_device(db, current_user, device_id)
