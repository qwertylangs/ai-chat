from datetime import datetime, timedelta, timezone

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def current_window(now: datetime, period: timedelta) -> tuple[datetime, datetime]:
    """Окно, выровненное по Unix-эпохе: (начало, момент сброса)."""
    start = EPOCH + (now - EPOCH) // period * period
    return start, start + period
