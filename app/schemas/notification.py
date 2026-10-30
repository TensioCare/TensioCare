from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PushDeviceCreate(BaseModel):
    token: str = Field(min_length=8, max_length=255)
    platform: Literal["ios", "android", "web"] = "android"


class PushDeviceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    platform: str
    is_active: bool
    created_at: datetime
    last_seen_at: datetime


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    body: str
    data: dict[str, Any] = Field(default_factory=dict)
    status: str
    window_id: int | None = None
    created_at: datetime
    sent_at: datetime | None = None
    read_at: datetime | None = None
    acknowledged_at: datetime | None = None


class NotificationList(BaseModel):
    items: list[NotificationRead]
    total: int
    unread: int
