from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, overridable through environment variables or .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SolveX API"
    api_v1_prefix: str = "/api/v1"
    debug: bool = False
    # Background scheduler for reminders/escalations. Disable in tests.
    enable_scheduler: bool = True

    database_url: str = "sqlite:///./solvex.db"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ]

    # Push notifications (Expo). In-app notifications are always stored.
    push_enabled: bool = True
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    push_timeout_seconds: float = 5.0

    # Auth
    secret_key: str = "dev-only-secret-key-change-me-in-production-please"
    algorithm: str = "HS256"
    # Short-lived access token; the mobile app refreshes it silently.
    access_token_expire_minutes: int = 30
    # Long-lived, rotating refresh token (stored hashed, revocable).
    refresh_token_expire_days: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
