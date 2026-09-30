from datetime import datetime, timedelta, timezone

from app.limits.window import current_window

UTC = timezone.utc


def test_daily_window_starts_at_utc_midnight():
    start, resets_at = current_window(datetime(2026, 9, 16, 10, 37, tzinfo=UTC), timedelta(days=1))

    assert start == datetime(2026, 9, 16, tzinfo=UTC)
    assert resets_at == datetime(2026, 9, 17, tzinfo=UTC)


def test_hourly_window_aligns_to_hour():
    start, resets_at = current_window(datetime(2026, 9, 16, 10, 37, tzinfo=UTC), timedelta(minutes=60))

    assert (start, resets_at) == (
        datetime(2026, 9, 16, 10, tzinfo=UTC),
        datetime(2026, 9, 16, 11, tzinfo=UTC),
    )


def test_moment_on_boundary_opens_new_window():
    start, _ = current_window(datetime(2026, 9, 16, 11, tzinfo=UTC), timedelta(minutes=60))

    assert start == datetime(2026, 9, 16, 11, tzinfo=UTC)
