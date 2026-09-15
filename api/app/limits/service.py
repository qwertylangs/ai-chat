from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.limits.counting import TokenCount
from app.limits.window import current_window
from app.models import TokenUsage, User, utcnow


@dataclass(frozen=True)
class UsageStatus:
    limit: int
    used: int
    remaining: int
    resets_at: datetime


class TokenLimitExceeded(Exception):
    def __init__(self, status: UsageStatus):
        super().__init__("Лимит токенов исчерпан")
        self.status = status


def limit_for(user: User) -> int:
    """Точка расширения: тарифы и индивидуальные лимиты подключаются здесь."""
    return settings.token_limit


def get_usage(db: Session, user: User) -> UsageStatus:
    start, resets_at = current_window(
        utcnow(), timedelta(minutes=settings.token_limit_period_minutes)
    )
    used = (
        db.query(func.coalesce(func.sum(TokenUsage.total_tokens), 0))
        .filter(TokenUsage.user_id == user.id, TokenUsage.created_at >= start)
        .scalar()
    )
    limit = limit_for(user)
    return UsageStatus(limit, used, max(limit - used, 0), resets_at)


def ensure_within_limit(db: Session, user: User) -> None:
    # lazy: проверка до запроса — последний ответ может перебрать лимит, параллельные запросы
    # могут оба пройти; нужна жёсткая граница — резервировать токены до запроса
    status = get_usage(db, user)
    if status.used >= status.limit:
        raise TokenLimitExceeded(status)


def record_usage(db: Session, user_id: int, model: str, count: TokenCount) -> None:
    db.add(
        TokenUsage(
            user_id=user_id,
            model=model,
            prompt_tokens=count.prompt,
            completion_tokens=count.completion,
            total_tokens=count.total,
        )
    )
