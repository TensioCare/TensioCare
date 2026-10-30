from datetime import datetime, timezone

import pytest

from app.core.config import settings
from app.jobs.cli import ensure_simulation_is_safe, parse_at


def test_parse_at_accepts_z_suffix() -> None:
    assert parse_at("2026-01-01T08:05:00Z") == datetime(
        2026, 1, 1, 8, 5, tzinfo=timezone.utc
    )
    assert parse_at(None) is None


def test_parse_at_rejects_invalid_values() -> None:
    with pytest.raises(SystemExit, match="Invalid --at"):
        parse_at("not-a-date")


def test_simulation_is_refused_while_scheduler_is_enabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "enable_scheduler", True)

    with pytest.raises(SystemExit, match="ENABLE_SCHEDULER=true"):
        ensure_simulation_is_safe(
            datetime(2026, 1, 1, 8, 0),
            job="the reminder job",
        )

    # A real run without --at is always allowed.
    ensure_simulation_is_safe(None, job="the reminder job")

    # --force is an explicit escape hatch for a stopped scheduler.
    ensure_simulation_is_safe(
        datetime(2026, 1, 1, 8, 0),
        job="the reminder job",
        force=True,
    )


def test_simulation_is_allowed_when_scheduler_is_disabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "enable_scheduler", False)
    ensure_simulation_is_safe(
        datetime(2026, 1, 1, 8, 0),
        job="the reminder job",
    )
