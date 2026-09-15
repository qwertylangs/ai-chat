from datetime import timedelta

import pytest

from app.config import settings
from app.limits.counting import TokenCount
from app.limits.service import (
    TokenLimitExceeded,
    ensure_within_limit,
    get_usage,
    record_usage,
)
from app.limits.window import current_window
from app.models import TokenUsage, User, utcnow

LIMIT = 100


@pytest.fixture(autouse=True)
def small_limit(monkeypatch):
    monkeypatch.setattr(settings, "token_limit", LIMIT)


@pytest.fixture
def make_user(db_session):
    def make(username: str = "alice") -> User:
        user = User(username=username, hashed_password="x")
        db_session.add(user)
        db_session.commit()
        return user

    return make


def spend(db, user, tokens, at=None):
    db.add(TokenUsage(user_id=user.id, model="m", prompt_tokens=tokens, completion_tokens=0,
                      total_tokens=tokens, created_at=at or utcnow()))
    db.commit()


def window_start():
    return current_window(utcnow(), timedelta(minutes=settings.token_limit_period_minutes))[0]


def test_record_usage_adds_to_current_window(db_session, make_user):
    alice = make_user()

    record_usage(db_session, alice.id, "m", TokenCount(10, 5, 15))
    db_session.commit()

    assert get_usage(db_session, alice).used == 15


def test_counts_only_current_window(db_session, make_user):
    alice = make_user()
    spend(db_session, alice, 500, at=window_start() - timedelta(seconds=1))
    spend(db_session, alice, 30)

    status = get_usage(db_session, alice)

    assert (status.limit, status.used, status.remaining) == (LIMIT, 30, 70)
    assert status.resets_at == window_start() + timedelta(minutes=settings.token_limit_period_minutes)


def test_usage_is_per_user(db_session, make_user):
    alice, bob = make_user("alice"), make_user("bob")
    spend(db_session, alice, LIMIT)

    assert get_usage(db_session, bob).used == 0


def test_remaining_never_negative(db_session, make_user):
    alice = make_user()
    spend(db_session, alice, LIMIT + 50)

    assert get_usage(db_session, alice).remaining == 0


def test_ensure_raises_when_limit_reached(db_session, make_user):
    alice = make_user()
    spend(db_session, alice, LIMIT)

    with pytest.raises(TokenLimitExceeded) as exc:
        ensure_within_limit(db_session, alice)

    assert exc.value.status.used == LIMIT


def test_ensure_passes_below_limit(db_session, make_user):
    alice = make_user()
    spend(db_session, alice, LIMIT - 1)

    ensure_within_limit(db_session, alice)
