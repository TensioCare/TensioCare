"""Shared command-line helpers for the background jobs.

The jobs can be run on demand with an injected clock (``--at``). That is only
safe when the in-process scheduler is not also running, otherwise both processes
can process the same measurement windows.
"""

import argparse
from datetime import datetime

from app.core.config import settings


def add_clock_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--at",
        help="ISO datetime used as 'now' (for example 2026-10-31T08:05:00Z)",
        default=None,
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Run --at even when ENABLE_SCHEDULER=true (use with care)",
    )


def parse_at(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise SystemExit(f"Invalid --at value {value!r}: {error}") from error


def ensure_simulation_is_safe(
    at: datetime | None, *, job: str, force: bool = False
) -> None:
    """Refuse an injected clock while the live scheduler may be running.

    The scheduler runs inside the API process, so this CLI process cannot turn
    it off. Blocking is safer than silently double-processing windows.
    """
    if at is None or force or not settings.enable_scheduler:
        return
    raise SystemExit(
        f"Refusing to run {job} with --at while ENABLE_SCHEDULER=true.\n"
        "Stop the API or set ENABLE_SCHEDULER=false for it, then retry. "
        "Use --force only when you know no live scheduler is running."
    )
