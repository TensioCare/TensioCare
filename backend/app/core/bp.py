"""Blood pressure classification and trend helpers (pure logic, no IO)."""

from enum import Enum


class BPCategory(str, Enum):
    low = "low"
    normal = "normal"
    elevated = "elevated"
    stage_1 = "stage_1"
    stage_2 = "stage_2"
    crisis = "crisis"


class BPTrend(str, Enum):
    improving = "improving"
    worsening = "worsening"
    stable = "stable"
    not_enough_data = "not_enough_data"


# American Heart Association thresholds (mmHg).
CRISIS_SYSTOLIC = 180
CRISIS_DIASTOLIC = 120
STAGE_2_SYSTOLIC = 140
STAGE_2_DIASTOLIC = 90
STAGE_1_SYSTOLIC = 130
STAGE_1_DIASTOLIC = 80
ELEVATED_SYSTOLIC = 120
LOW_SYSTOLIC = 90
LOW_DIASTOLIC = 60

TREND_THRESHOLD = 3.0
MIN_READINGS_FOR_TREND = 4


def classify(systolic: int, diastolic: int) -> BPCategory:
    """Classify a reading using AHA categories.

    Low pressure is checked after the hypertensive ranges because a high
    systolic value is the more important signal when the two disagree.
    """
    if systolic > CRISIS_SYSTOLIC or diastolic > CRISIS_DIASTOLIC:
        return BPCategory.crisis
    if systolic >= STAGE_2_SYSTOLIC or diastolic >= STAGE_2_DIASTOLIC:
        return BPCategory.stage_2
    if systolic >= STAGE_1_SYSTOLIC or diastolic >= STAGE_1_DIASTOLIC:
        return BPCategory.stage_1
    if systolic < LOW_SYSTOLIC or diastolic < LOW_DIASTOLIC:
        return BPCategory.low
    if systolic >= ELEVATED_SYSTOLIC:
        return BPCategory.elevated
    return BPCategory.normal


def pulse_pressure(systolic: int, diastolic: int) -> int:
    return systolic - diastolic


def mean_arterial_pressure(systolic: int, diastolic: int) -> float:
    return round(diastolic + (systolic - diastolic) / 3, 1)


def trend_from_averages(first_half: float, second_half: float) -> BPTrend:
    """Lower blood pressure counts as improvement."""
    delta = second_half - first_half
    if delta <= -TREND_THRESHOLD:
        return BPTrend.improving
    if delta >= TREND_THRESHOLD:
        return BPTrend.worsening
    return BPTrend.stable


def line_slope(values: list[float]) -> float:
    """Least-squares slope of ``values`` against their index (reference compat)."""
    if len(values) < 2:
        return 0.0
    return fit_slope(list(range(len(values))), values)[0]


def fit_slope(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """Least-squares linear fit ``y = intercept + slope * x``.

    Returns ``(slope, intercept, r_squared)``. ``r_squared`` is clamped to
    ``[0, 1]`` and is 0 when there is no variance. Used both for trend
    detection and for projecting future values, where ``x`` is elapsed days.
    """
    n = len(xs)
    if n < 2 or len(ys) != n:
        return 0.0, (ys[0] if ys else 0.0), 0.0
    xm = sum(xs) / n
    ym = sum(ys) / n
    sxx = sum((x - xm) ** 2 for x in xs)
    sxy = sum((x - xm) * (y - ym) for x, y in zip(xs, ys))
    if sxx == 0:
        return 0.0, ym, 0.0
    slope = sxy / sxx
    intercept = ym - slope * xm
    ss_res = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - ym) ** 2 for y in ys)
    r_squared = 1.0 - (ss_res / ss_tot) if ss_tot else 0.0
    r_squared = max(0.0, min(1.0, r_squared))
    return slope, intercept, r_squared
