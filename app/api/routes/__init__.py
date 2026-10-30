from fastapi import APIRouter

from app.api.routes import (
    auth,
    caregivers,
    devices,
    health,
    insights,
    notifications,
    patients,
    readings,
    reminders,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(patients.router)
api_router.include_router(caregivers.router)
api_router.include_router(readings.router)
api_router.include_router(devices.router)
api_router.include_router(reminders.router)
api_router.include_router(notifications.router)
api_router.include_router(insights.router)
