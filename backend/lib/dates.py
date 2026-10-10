"""Server-side date helpers. The pod clock is UTC — anchor "today" here, never in the browser.

All analysis windows are anchored to WITA (Asia/Makassar, UTC+8):
- Daily snapshot window:  06:00 WITA day D  ->  05:59 WITA day D+1 (generated at 06:00 WITA)
- Weekly snapshot window: Monday 06:00 WITA ->  next Monday 05:59 WITA (generated Monday 06:00 WITA)
"""

import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

WITA = ZoneInfo("Asia/Makassar")  # UTC+8, no DST


def today_iso(tz: str | None = None) -> str:
    """Today's date as YYYY-MM-DD in `tz` (default: APP_TZ env, else UTC)."""
    zone = tz or os.environ.get("APP_TZ", "UTC")
    return datetime.now(ZoneInfo(zone)).strftime("%Y-%m-%d")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_wita() -> datetime:
    return datetime.now(WITA)


def _as_wita(dt: datetime | None = None) -> datetime:
    if dt is None:
        return datetime.now(WITA)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(WITA)


def daily_period(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The current daily analysis window, as aware UTC datetimes (start inclusive, end exclusive)."""
    local = _as_wita(now)
    start = local.replace(hour=6, minute=0, second=0, microsecond=0)
    if local.hour < 6:  # before 06:00 WITA we are still inside yesterday's window
        start = start - timedelta(days=1)
    end = start + timedelta(days=1)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def weekly_period(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The current weekly analysis window (Monday 06:00 WITA -> next Monday 06:00 WITA), aware UTC."""
    local = _as_wita(now)
    monday = local.date() - timedelta(days=local.weekday())
    start = datetime(monday.year, monday.month, monday.day, 6, 0, 0, tzinfo=WITA)
    if local < start:  # Monday before 06:00 WITA belongs to last week's window
        start = start - timedelta(days=7)
    end = start + timedelta(days=7)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def next_weekly_run(now: datetime | None = None) -> datetime:
    """The moment the next weekly snapshot is generated: next Monday 06:00 WITA."""
    _, end = weekly_period(now)
    return end
