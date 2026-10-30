"""Send the daily high/critical risk notification.

The scheduler calls :func:`run_once` hourly; the service only sends between 08:00
and 12:00 in each patient's timezone and deduplicates per local day. Run it on
demand with:

    python -m app.jobs.insights
    python -m app.jobs.insights --at 2026-10-31T08:05:00Z
"""

import argparse
import logging
from datetime import datetime

from app.core.timeutils import to_naive_utc, utcnow
from app.db.session import SessionLocal
from app.jobs.cli import add_clock_arguments, ensure_simulation_is_safe, parse_at
from app.services.insights import send_daily_assessments

logger = logging.getLogger(__name__)


def run_once(now: datetime | None = None) -> dict[str, int]:
    """Run one daily-assessment cycle. Safe to call repeatedly."""
    moment = to_naive_utc(now) if now is not None else utcnow()
    with SessionLocal() as db:
        summary = send_daily_assessments(db, moment)
    logger.info("daily assessment cycle %s -> %s", moment.isoformat(), summary)
    return summary


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(
        description="Send daily high/critical risk notifications"
    )
    add_clock_arguments(parser)
    args = parser.parse_args()

    at = parse_at(args.at)
    ensure_simulation_is_safe(at, job="the daily-insight job", force=args.force)
    print(run_once(at))


if __name__ == "__main__":
    main()
