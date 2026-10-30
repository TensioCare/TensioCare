from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Liveness probe used by the frontend and deployment tooling."""
    return {"status": "ok", "app": settings.app_name}
