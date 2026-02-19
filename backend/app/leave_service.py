from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional
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
    return float((ed2 - s2).days)


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
    accrued = min(ANNUAL_CAP, round(opening_accrued + accrued_since_anchor, 2))

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
    remaining = max(0.0, round(accrued - used, 2))

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
    - We allow booking future leave against future accrual up to the event start date.
      (So as_of = min(today, event_start_date) would be more conservative;
       we use as_of = event_start_date for flexibility.)
    """
    as_of = start_ts.date()
    bal = compute_leave_balance(db, user, as_of=as_of, exclude_event_id=exclude_event_id)

    requested_days = float((end_ts.date() - start_ts.date()).days)
    if requested_days <= 0:
        raise ValueError("Invalid leave duration")

    if requested_days > bal.remaining + 1e-9:
        raise ValueError(
            f"Insufficient leave balance for this period. "
            f"Requested {requested_days} day(s), remaining {bal.remaining}."
        )
