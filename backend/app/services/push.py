"""Expo Push delivery for in-app notifications.

The notification row is the source of truth. Push is best-effort: a failed
provider call must never lose the in-app alert or break the request that
created it.
"""

import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notification import Notification, PushDevice

logger = logging.getLogger(__name__)


def _messages_for(
    notification: Notification, tokens: list[str]
) -> list[dict[str, Any]]:
    data = {
        **(notification.data or {}),
        "notification_id": notification.id,
        "type": notification.type,
    }
    return [
        {
            "to": token,
            "title": notification.title,
            "body": notification.body,
            "data": data,
            "sound": "default",
            "priority": "high",
            "channelId": "measurements",
        }
        for token in tokens
    ]


def _deactivate_invalid_devices(
    db: Session, devices: list[PushDevice], tickets: list[dict[str, Any]]
) -> None:
    for device, ticket in zip(devices, tickets, strict=False):
        details = ticket.get("details") or {}
        if (
            ticket.get("status") == "error"
            and details.get("error") == "DeviceNotRegistered"
        ):
            device.is_active = False
            logger.info("Deactivated stale push device id=%s", device.id)


def send_expo_push(db: Session, notification: Notification) -> None:
    """Send one notification to every active Expo token for the user."""
    if not settings.push_enabled:
        return

    devices = list(
        db.scalars(
            select(PushDevice).where(
                PushDevice.user_id == notification.user_id,
                PushDevice.is_active.is_(True),
            )
        )
    )
    if not devices:
        return

    messages = _messages_for(notification, [device.token for device in devices])
    try:
        response = httpx.post(
            settings.expo_push_url,
            json=messages,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=settings.push_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        logger.warning(
            "Expo push failed user=%s type=%s error=%s",
            notification.user_id,
            notification.type,
            error,
        )
        return

    if not isinstance(payload, dict):
        logger.warning("Expo push returned an unexpected payload")
        return

    tickets = payload.get("data", [])
    if isinstance(tickets, dict):
        tickets = [tickets]
    if isinstance(tickets, list):
        _deactivate_invalid_devices(db, devices, tickets)
        db.flush()
