import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.jobs.insights import run_once as run_daily_insights
from app.jobs.reminders import run_once

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def start_scheduler() -> None:
    if not settings.enable_scheduler:
        logger.info("reminder scheduler disabled (ENABLE_SCHEDULER=false)")
        return

    scheduler.add_job(
        run_once,
        "interval",
        seconds=60,
        id="reminder-cycle",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        run_daily_insights,
        "cron",
        minute=5,
        id="daily-insights",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info("reminder + daily-insight scheduler started")


def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
