import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_TIME_24H = re.compile(r"^(\d{1,2}):([0-5]\d)$")
_TIME_AMPM = re.compile(r"^(\d{1,2})(?::([0-5]\d))?\s*([ap])m$")


def utcnow() -> datetime:
    """Current UTC time as a naive datetime (how SQLite stores timestamps)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_naive_utc(value: datetime) -> datetime:
    """Normalise any datetime to naive UTC so comparisons stay consistent."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def normalize_hhmm(value: str) -> str:
    """Return a canonical ``HH:MM`` time.

    Accepts 24-hour values (``"08:00"``, ``"8:00"``) and 12-hour values
    (``"8am"``, ``"8:30 PM"``, ``"12am"``, ``"12pm"``).
    """
    text = value.strip().lower()
    match = _TIME_24H.match(text)
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2))
        if hour > 23:
            raise ValueError("Hour must be between 00 and 23")
    else:
        match = _TIME_AMPM.match(text)
        if match is None:
            raise ValueError("Time must use HH:MM or h AM/PM format")
        hour = int(match.group(1))
        minute = int(match.group(2) or 0)
        if hour < 1 or hour > 12:
            raise ValueError("12-hour clock hour must be between 1 and 12")
        if hour == 12:
            hour = 0
        if match.group(3) == "p":
            hour += 12
    return f"{hour:02d}:{minute:02d}"


def normalize_hhmm_list(values: list[str]) -> list[str]:
    """Normalise, deduplicate and sort a list of times."""
    return sorted({normalize_hhmm(value) for value in values})


def validate_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError("Unknown IANA timezone") from error
    return value
