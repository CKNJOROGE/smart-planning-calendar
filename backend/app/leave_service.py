from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional, Set
from sqlalchemy.orm import Session
from .models import Event, User

ACCRUAL_RATE_PER_MONTH = 1.75
ANNUAL_CAP = 21.0


@dataclass
class LeaveBalance:
    user_id: int
    as_of: date
    period_start: date
    period_end: date
    months_accrued: int
    accrued: float
    used: float
    remaining: float


def _make_date(y: int, m: int, d: int) -> date:
    return date(y, m, d)


def _add_days(d: date, days: int) -> date:
    return d + timedelta(days=days)


def _easter_sunday(year: int) -> date:
    # Gregorian Easter (Meeus/Jones/Butcher)
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return _make_date(year, month, day)


def _kenya_islamic_holidays(year: int) -> Set[date]:
    # Operational lookup used by this app. Official gazetted observance can shift by moon sighting.
    known = {
        2025: ("2025-03-31", "2025-06-06"),
        2026: ("2026-03-20", "2026-05-27"),
        2027: ("2027-03-10", "2027-05-17"),
        2028: ("2028-02-28", "2028-05-05"),
        2029: ("2029-02-16", "2029-04-24"),
        2030: ("2030-02-06", "2030-04-13"),
    }
    vals = known.get(year)
    if not vals:
        return set()
    return {date.fromisoformat(vals[0]), date.fromisoformat(vals[1])}


def _kenya_public_holidays(year: int) -> Set[date]:
    easter = _easter_sunday(year)
    fixed = {
        _make_date(year, 1, 1),   # New Year's Day
        _make_date(year, 5, 1),   # Labour Day
        _make_date(year, 6, 1),   # Madaraka Day
        _make_date(year, 10, 10), # Mazingira/Huduma Day
        _make_date(year, 10, 20), # Mashujaa Day
        _make_date(year, 12, 12), # Jamhuri Day
        _make_date(year, 12, 25), # Christmas Day
        _make_date(year, 12, 26), # Boxing Day
    }
    movable = {
        _add_days(easter, -2),  # Good Friday
        _add_days(easter, 1),   # Easter Monday
    }
    holidays = set(fixed | movable | _kenya_islamic_holidays(year))

    # If a holiday falls on Sunday, observe on Monday.
    observed = set()
    for h in holidays:
        if h.weekday() == 6:
            observed.add(_add_days(h, 1))
    holidays |= observed
    return holidays


def _is_chargeable_leave_day(day_value: date) -> bool:
    # Company policy here: Sunday is non-working; Saturday is a working day.
    if day_value.weekday() == 6:
        return False
    if day_value in _kenya_public_holidays(day_value.year):
        return False
    return True


def _anniversary_on_or_before(hire_date: date, d: date) -> date:
    """
    Returns the hire-date anniversary (month/day) in the year of d,
    but if that anniversary is after d, returns the previous year's anniversary.
    """
    # handle Feb 29 hire_date safely: clamp to Feb 28 on non-leap years
    def safe_date(y: int, m: int, day: int) -> date:
        try:
            return date(y, m, day)
        except ValueError:
            # only realistic case here is Feb 29 -> Feb 28
            return date(y, m, 28)

    ann = safe_date(d.year, hire_date.month, hire_date.day)
    if ann > d:
        ann = safe_date(d.year - 1, hire_date.month, hire_date.day)
    return ann


def _add_year(d: date) -> date:
    try:
        return date(d.year + 1, d.month, d.day)
    except ValueError:
        # Feb 29 -> Feb 28
        return date(d.year + 1, d.month, 28)


def _full_months_between(period_start: date, as_of: date) -> int:
    """
    Full months accrued from period_start up to as_of.
    Accrues monthly on the day-of-month matching period_start.day.
    """
    if as_of < period_start:
        return 0

    months = (as_of.year - period_start.year) * 12 + (as_of.month - period_start.month)
    # If we haven't reached the accrual "day" this month, subtract 1
    if as_of.day < period_start.day:
        months -= 1
    return max(0, months)


def _event_leave_days_within_window(e_start: datetime, e_end: datetime, w_start: date, w_end: date) -> float:
    """
    Your app stores all-day events with exclusive end date (next day 00:00).
    Leave days = number of dates in [start_date, end_date).
    Clamp to [w_start, w_end).
    """
    s = e_start.date()
    ed = e_end.date()

    # clamp
    s2 = max(s, w_start)
    ed2 = min(ed, w_end)
    if ed2 <= s2:
        return 0.0
    total = 0
    d = s2
    while d < ed2:
        if _is_chargeable_leave_day(d):
            total += 1
        d += timedelta(days=1)
    return float(total)


def compute_leave_balance(
    db: Session,
    user: User,
    as_of: date,
    exclude_event_id: Optional[int] = None,
) -> LeaveBalance:
    hire = user.hire_date or (user.created_at.date() if user.created_at else as_of)
    opening_as_of = getattr(user, "leave_opening_as_of", None)
    opening_accrued = float(getattr(user, "leave_opening_accrued", 0) or 0)
    opening_used = float(getattr(user, "leave_opening_used", 0) or 0)

    period_start = _anniversary_on_or_before(hire, as_of)
    period_end = _add_year(period_start)

    accrual_anchor = period_start
    if opening_as_of and period_start <= opening_as_of <= as_of:
        accrual_anchor = opening_as_of

    months_accrued = _full_months_between(accrual_anchor, as_of)
    accrued_since_anchor = round(months_accrued * ACCRUAL_RATE_PER_MONTH, 2)
    # Preserve historical opening balance and cap only accrual earned in this cycle.
    accrued_since_anchor_capped = min(ANNUAL_CAP, accrued_since_anchor)
    accrued = round(opening_accrued + accrued_since_anchor_capped, 2)

    usage_window_start = period_start
    if opening_as_of and period_start <= opening_as_of < period_end:
        usage_window_start = opening_as_of

    # Sum leave used within this entitlement window (or opening baseline date)
    q = (
        db.query(Event)
        .filter(
            Event.user_id == user.id,
            Event.type == "Leave",
            Event.status == "approved",
            Event.start_ts < datetime.combine(period_end, datetime.min.time()),
            Event.end_ts > datetime.combine(usage_window_start, datetime.min.time()),
        )
    )
    if exclude_event_id is not None:
        q = q.filter(Event.id != exclude_event_id)

    used = 0.0
    for e in q.all():
        used += _event_leave_days_within_window(e.start_ts, e.end_ts, usage_window_start, period_end)

    used = round(opening_used + used, 2)
    remaining = round(accrued - used, 2)

    return LeaveBalance(
        user_id=user.id,
        as_of=as_of,
        period_start=period_start,
        period_end=period_end,
        months_accrued=months_accrued,
        accrued=accrued,
        used=used,
        remaining=remaining,
    )


def validate_leave_request(
    db: Session,
    user: User,
    start_ts: datetime,
    end_ts: datetime,
    exclude_event_id: Optional[int] = None,
) -> None:
    """
    Policy choice:
    - Leave requests are allowed even if balance is zero/negative.
    - Balance is reflected after approval via compute_leave_balance.
    - This validator only enforces valid duration.
    """
    requested_days = float((end_ts.date() - start_ts.date()).days)
    if requested_days <= 0:
        raise ValueError("Invalid leave duration")
