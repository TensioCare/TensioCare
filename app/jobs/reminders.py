"""Materialise reminder windows, send reminders and advance escalations.

The scheduler calls :func:`run_once` every minute. For local testing you can
run it on demand with an injected clock:

    python -m app.jobs.reminders
    python -m app.jobs.reminders --at 2026-10-31T08:05:00Z
"""

import argparse
import logging
from datetime import datetime

from app.core.timeutils import to_naive_utc, utcnow
from app.db.session import SessionLocal
from app.services.reminders import generate_windows, process_windows

logger = logging.getLogger(__name__)


def run_once(now: datetime | None = None) -> dict[str, int]:
    """Run one reminder cycle. Safe to call repeatedly (idempotent)."""
    moment = to_naive_utc(now) if now is not None else utcnow()
    with SessionLocal() as db:
        created = generate_windows(db, moment)
        summary = process_windows(db, moment)
    summary["windows_created"] = created
    logger.info("reminder cycle %s -> %s", moment.isoformat(), summary)
    return summary


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Run one reminder/escalation cycle")
    parser.add_argument(
        "--at",
        help="ISO datetime used as 'now' (useful to simulate a miss)",
        default=None,
    )
    args = parser.parse_args()

    at = datetime.fromisoformat(args.at.replace("Z", "+00:00")) if args.at else None
    print(run_once(at))


if __name__ == "__main__":
    main()
