# Лимит токенов на пользователя — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ограничить расход токенов LLM на пользователя в фиксированном окне, показать остаток на фронте и понятно блокировать отправку при исчерпании.

**Architecture:** Журнал `token_usage` (строка на каждый успешный ответ ассистента) + модуль `api/app/limits/` (`window` — чистая математика окна, `counting` — токены из `usage` провайдера или оценка, `service` — статус/проверка/запись). Проверка — до запроса к модели, доменное `TokenLimitExceeded` превращается в `429` обработчиком в `main.py`. Фронт: `GET /api/usage` + `TokenLimitError` в `api.ts`, composable `useTokenUsage`, строка остатка и блок исчерпания в `ChatWindow`.

**Tech Stack:** FastAPI, SQLAlchemy 2, pydantic-settings, openai SDK 3.x, pytest; Vue 3 + TypeScript, Vitest (happy-dom); Playwright со стабом OpenRouter.

**Spec:** `docs/superpowers/specs/2026-09-16-token-limit-design.md`

## Global Constraints

- Env и дефолты: `TOKEN_LIMIT=1000`, `TOKEN_LIMIT_PERIOD_MINUTES=1440`, `TOKEN_ESTIMATE_CHARS_PER_TOKEN=4`.
- Часовые пояса: бэкенд считает время только в UTC (`utcnow()`, aware-даты; окна выровнены по Unix-эпохе в UTC, при 1440 сброс в 00:00 UTC) и не зависит от TZ сервера. `resets_at` в JSON — ISO-строка с `Z` (`2026-09-17T00:00:00Z`). Фронт никогда не показывает UTC: переводит `resets_at` в местное время браузера (`new Date(...)` + `toLocale*('ru-RU')`), «сегодня/другой день» тоже сравнивается по местной дате. Тесты фронта строят даты в местном времени и отдают их через `toISOString()` (с `Z`) — ожидания не зависят от TZ машины.
- Тело 429: `{"detail": "Лимит токенов исчерпан", "code": "token_limit_exceeded", "limit", "used", "remaining", "resets_at"}` + заголовок `Retry-After` (секунды, округление вверх).
- Тексты UI ровно так: `Осталось {remaining} из {limit} токенов · сброс в {label}` и `Лимит токенов исчерпан. Новые сообщения можно отправить после {label}`.
- `remaining = max(limit - used, 0)`; исчерпан ⇔ `used >= limit` (на фронте — `remaining === 0`).
- Новых зависимостей не добавлять (ни `tiktoken`, ни date-библиотек).
- Миграций нет: новая таблица создаётся `Base.metadata.create_all` в `main.py`.
- TDD: тест пишется первым и падает по правильной причине, затем минимальная реализация.
- Комментарии — по правилам проекта: минимум, одна строка; упрощения с потолком помечаются `# lazy: …`.
- Существующие pytest, vitest, `npm run lint`, `npm run build` и e2e остаются зелёными.
- `git commit` выполняет только основная сессия. Субагенты git не вызывают. Ветка — `token-limit`.

## Стенд

Все команды — из `/Users/egor/learn/ai-chat`.

- Бэкенд: `cd api && uv run pytest -q` (in-memory SQLite, TestClient).
- Фронт: `cd front && npx vitest run`, `npm run lint`, `npm run build`.
- e2e: `cd e2e && npx playwright test` — Playwright сам поднимает стаб OpenRouter (8931), бэкенд (8001, отдельная БД `e2e/.tmp/e2e.db`) и vite (5174).

## File Structure

Бэкенд:
- `api/app/config.py` — **изменяется**: три поля лимита.
- `api/.env.example` — **изменяется**: три переменные с комментариями.
- `api/app/limits/__init__.py` — **создаётся**, пустой.
- `api/app/limits/window.py` — **создаётся**: `current_window`.
- `api/app/limits/counting.py` — **создаётся**: `TokenCount`, `count_tokens`.
- `api/app/limits/service.py` — **создаётся**: `UsageStatus`, `TokenLimitExceeded`, `limit_for`, `get_usage`, `ensure_within_limit`, `record_usage`.
- `api/app/models.py` — **изменяется**: модель `TokenUsage`.
- `api/app/schemas.py` — **изменяется**: `UsageOut`.
- `api/app/main.py` — **изменяется**: обработчик `TokenLimitExceeded`, подключение роутера usage.
- `api/app/routers/chat.py` — **изменяется**: проверка лимита, `include_usage`, запись расхода.
- `api/app/routers/usage.py` — **создаётся**: `GET /api/usage`.
- Тесты: `api/tests/test_limits_window.py`, `api/tests/test_limits_counting.py`, `api/tests/test_limits_service.py`, `api/tests/test_token_limit.py` — **создаются**.

Фронт:
- `front/src/api.ts` — **изменяется**: `Usage`, `TokenLimitError`, `getUsage`, общий разбор ошибок.
- `front/src/composables/useTokenUsage.ts` (+ `.test.ts`) — **создаются**.
- `front/src/composables/useConversation.ts` (+ `.test.ts`) — **изменяются**: `refreshUsage`, `setUsage`.
- `front/src/components/ChatWindow.vue` — **изменяется**: строка остатка, блок исчерпания, блокировка ввода.
- `front/src/components/ChatView.vue` — **изменяется**: связывает `useTokenUsage` с остальными.

e2e и документация:
- `e2e/fake_openrouter.py`, `e2e/playwright.config.ts` — **изменяются**; `e2e/tests/limit.spec.ts` — **создаётся**.
- `CONTEXT.md`, `README.md` — **изменяются**; `docs/adr/0005-soft-token-limit-fixed-window.md` — **создаётся**.

## Контекст для исполнителя

- `app/models.py` уже содержит `utcnow()` (aware UTC) — используйте его, а не `datetime.utcnow()`.
- В `send_message` (`api/app/routers/chat.py`) сообщение пользователя коммитится до стрима; стрим — генератор `stream_assistant_reply`, который после успешного завершения сохраняет ответ ассистента через **`SessionLocal()`** (не через `get_db`). Поэтому в тестах подменяются и `chat_router.build_openai_client`, и `chat_router.SessionLocal`.
- Тестовая БД (`api/tests/conftest.py`) — in-memory SQLite со `StaticPool`: `sessionmaker(bind=db_session.get_bind())` видит те же данные, что `db_session`.
- Фикстура `auth(username="alice", password="password123")` регистрирует пользователя и возвращает заголовки `Authorization`.
- SQLite хранит `DateTime(timezone=True)` без смещения; сравнение работает, пока все значения в UTC — пишем только через `utcnow()`/aware-даты.
- На фронте `front/src/api.ts` сейчас дублирует разбор не-2xx в `request()` и `sendMessage()`; задача 6 выносит его в одну функцию.
- `useConversation.test.ts` мокает `../api` целиком фабрикой — после задачи 6 фабрика должна сохранить настоящий `TokenLimitError` (через `importOriginal`), иначе `instanceof` сломается.
- Стаб OpenRouter всегда отвечает `Это ответ стаба OpenRouter.`; e2e-хелпер `send` из других спеков ждёт этот текст в **последнем** пузыре ассистента — в одном чате с несколькими ответами он может сработать до нового ответа, поэтому `limit.spec.ts` ждёт ещё и количество пузырей.

---

### Task 1: Конфиг и окно лимита

Закрывает критерий приёмки 1 и математику окна (критерий 3).

**Files:**
- Modify: `api/app/config.py`
- Modify: `api/.env.example`
- Create: `api/app/limits/__init__.py`
- Create: `api/app/limits/window.py`
- Test: `api/tests/test_limits_window.py`

**Interfaces:**
- Produces: `settings.token_limit: int`, `settings.token_limit_period_minutes: int`, `settings.token_estimate_chars_per_token: int`; `current_window(now: datetime, period: timedelta) -> tuple[datetime, datetime]` — `(start, resets_at)`, aware UTC.

- [ ] **Step 1: Написать падающие тесты**

`api/tests/test_limits_window.py`:

```python
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
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cd api && uv run pytest tests/test_limits_window.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.limits'`

- [ ] **Step 3: Реализация**

`api/app/limits/__init__.py` — пустой файл.

`api/app/limits/window.py`:

```python
from datetime import datetime, timedelta, timezone

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def current_window(now: datetime, period: timedelta) -> tuple[datetime, datetime]:
    """Окно, выровненное по Unix-эпохе: (начало, момент сброса)."""
    start = EPOCH + (now - EPOCH) // period * period
    return start, start + period
```

`api/app/config.py` — импорт и поля после `database_url`:

```python
from pydantic import NonNegativeInt, PositiveInt
```

```python
    token_limit: NonNegativeInt = 1000  # на пользователя за окно; маленький, чтобы ловить за 2-3 промпта
    token_limit_period_minutes: PositiveInt = 1440  # 1440 → сброс в 00:00 UTC
    token_estimate_chars_per_token: PositiveInt = 4  # если провайдер не вернул usage
```

`api/.env.example` — дописать в конец (с переводом строки перед блоком):

```
# Лимит токенов на пользователя (промпт всей истории + ответ, по usage OpenRouter)
TOKEN_LIMIT=1000
# Длина окна в минутах; окна выровнены по UTC: 1440 → сброс в 00:00 UTC, 2 → каждые 2 минуты
TOKEN_LIMIT_PERIOD_MINUTES=1440
# Оценка токенов, если провайдер не прислал usage
TOKEN_ESTIMATE_CHARS_PER_TOKEN=4
```

- [ ] **Step 4: Убедиться, что проходят**

Run: `cd api && uv run pytest tests/test_limits_window.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit** (основная сессия)

```bash
git add api/app/config.py api/.env.example api/app/limits/__init__.py api/app/limits/window.py api/tests/test_limits_window.py
git commit -m "Add token limit settings and fixed window math"
```

---

### Task 2: Подсчёт токенов ответа

Закрывает критерий приёмки 2 (часть «что записываем»).

**Files:**
- Create: `api/app/limits/counting.py`
- Test: `api/tests/test_limits_counting.py`

**Interfaces:**
- Consumes: —
- Produces: `TokenCount(prompt: int, completion: int, total: int)` (frozen dataclass); `count_tokens(usage: CompletionUsage | None, history: list[dict], reply: str, chars_per_token: int) -> TokenCount`.

- [ ] **Step 1: Написать падающие тесты**

`api/tests/test_limits_counting.py`:

```python
from openai.types import CompletionUsage

from app.limits.counting import TokenCount, count_tokens


def test_uses_provider_usage_when_present():
    usage = CompletionUsage(prompt_tokens=10, completion_tokens=5, total_tokens=15)

    assert count_tokens(usage, [{"role": "user", "content": "x" * 400}], "y", 4) == TokenCount(10, 5, 15)


def test_estimates_by_chars_without_usage():
    history = [{"role": "user", "content": "a" * 40}, {"role": "assistant", "content": "b" * 20}]

    assert count_tokens(None, history, "c" * 8, 4) == TokenCount(prompt=15, completion=2, total=17)
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cd api && uv run pytest tests/test_limits_counting.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.limits.counting'`

- [ ] **Step 3: Реализация**

`api/app/limits/counting.py`:

```python
from dataclasses import dataclass

from openai.types import CompletionUsage


@dataclass(frozen=True)
class TokenCount:
    prompt: int
    completion: int
    total: int


def count_tokens(
    usage: CompletionUsage | None, history: list[dict], reply: str, chars_per_token: int
) -> TokenCount:
    """Токены из usage провайдера; без него — оценка по числу символов."""
    if usage:
        return TokenCount(usage.prompt_tokens, usage.completion_tokens, usage.total_tokens)
    prompt = sum(len(m["content"]) for m in history) // chars_per_token
    completion = len(reply) // chars_per_token
    return TokenCount(prompt, completion, prompt + completion)
```

- [ ] **Step 4: Убедиться, что проходят**

Run: `cd api && uv run pytest tests/test_limits_counting.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit** (основная сессия)

```bash
git add api/app/limits/counting.py api/tests/test_limits_counting.py
git commit -m "Count tokens from provider usage with char-based fallback"
```

---

### Task 3: Журнал расходов и сервис лимита

Закрывает критерии приёмки 3, 4 и основу 5.

**Files:**
- Modify: `api/app/models.py` (добавить класс в конец)
- Create: `api/app/limits/service.py`
- Test: `api/tests/test_limits_service.py`

**Interfaces:**
- Consumes: `current_window` (Task 1), `TokenCount` (Task 2), `settings.token_limit`, `settings.token_limit_period_minutes`.
- Produces:
  - модель `TokenUsage(id, user_id, model, prompt_tokens, completion_tokens, total_tokens, created_at)`;
  - `UsageStatus(limit: int, used: int, remaining: int, resets_at: datetime)` (frozen dataclass);
  - `class TokenLimitExceeded(Exception)` с атрибутом `status: UsageStatus`, `str(exc) == "Лимит токенов исчерпан"`;
  - `limit_for(user: User) -> int`;
  - `get_usage(db: Session, user: User) -> UsageStatus`;
  - `ensure_within_limit(db: Session, user: User) -> None` (бросает `TokenLimitExceeded`);
  - `record_usage(db: Session, user_id: int, model: str, count: TokenCount) -> None` (без коммита).

- [ ] **Step 1: Написать падающие тесты**

`api/tests/test_limits_service.py`:

```python
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
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cd api && uv run pytest tests/test_limits_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.limits.service'`

- [ ] **Step 3: Реализация**

`api/app/models.py` — в импорт sqlalchemy добавить `Index`, в конец файла:

```python
class TokenUsage(Base):
    """Токены, потраченные на один ответ ассистента (промпт всей истории + ответ)."""

    __tablename__ = "token_usage"
    __table_args__ = (Index("ix_token_usage_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    model: Mapped[str] = mapped_column(String(128))
    prompt_tokens: Mapped[int]
    completion_tokens: Mapped[int]
    total_tokens: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
```

`api/app/limits/service.py`:

```python
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
```

- [ ] **Step 4: Убедиться, что проходят**

Run: `cd api && uv run pytest tests/test_limits_service.py -v`
Expected: 6 passed

- [ ] **Step 5: Прогнать весь бэкенд**

Run: `cd api && uv run pytest -q`
Expected: все passed

- [ ] **Step 6: Commit** (основная сессия)

```bash
git add api/app/models.py api/app/limits/service.py api/tests/test_limits_service.py
git commit -m "Add token usage ledger and limit service"
```

---

### Task 4: Лимит в отправке сообщения и ответ 429

Закрывает критерии приёмки 2, 5, 6.

**Files:**
- Modify: `api/app/schemas.py` (добавить `UsageOut` в конец)
- Modify: `api/app/main.py`
- Modify: `api/app/routers/chat.py:1-13` (импорты), `:100-146` (`send_message`, `stream_assistant_reply`)
- Test: `api/tests/test_token_limit.py`

**Interfaces:**
- Consumes: `ensure_within_limit`, `record_usage`, `TokenLimitExceeded`, `UsageStatus` (Task 3); `count_tokens` (Task 2); `current_window` (Task 1, только в тесте).
- Produces: `UsageOut(limit: int, used: int, remaining: int, resets_at: datetime)` в `app/schemas.py` (`from_attributes=True`) — используется в Task 5; `429`-контракт из Global Constraints.

- [ ] **Step 1: Написать падающие тесты**

`api/tests/test_token_limit.py`:

```python
"""Лимит токенов на отправке сообщения и GET /api/usage."""

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from openai.types.chat import ChatCompletionChunk
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.limits.window import current_window
from app.models import Message, TokenUsage, User, utcnow
from app.routers import chat as chat_router

LIMIT = 100


def chunk(content: str | None = None, usage: dict | None = None) -> ChatCompletionChunk:
    choices = [] if content is None else [{"index": 0, "delta": {"content": content}}]
    return ChatCompletionChunk.model_validate(
        {"id": "c", "object": "chat.completion.chunk", "created": 0, "model": "m",
         "choices": choices, "usage": usage}
    )


@pytest.fixture
def llm(monkeypatch, db_session):
    """Подменяет OpenRouter: стрим отдаёт llm.chunks, либо бросает llm.error."""
    fake = SimpleNamespace(chunks=[], error=None, calls=[])

    def create(**kwargs):
        fake.calls.append(kwargs)
        if fake.error:
            raise fake.error
        return iter(fake.chunks)

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(chat_router, "build_openai_client", lambda: client)
    monkeypatch.setattr(chat_router, "SessionLocal", sessionmaker(bind=db_session.get_bind()))
    monkeypatch.setattr(settings, "token_limit", LIMIT)
    return fake


@pytest.fixture
def alice(auth, client, db_session):
    headers = auth()
    chat_id = client.post("/api/chats", json={}, headers=headers).json()["id"]
    uid = db_session.query(User).filter(User.username == "alice").one().id
    return SimpleNamespace(headers=headers, id=uid, chat_id=chat_id)


def send(client, who, content="Привет"):
    return client.post(
        f"/api/chats/{who.chat_id}/messages", json={"content": content}, headers=who.headers
    )


def exhaust(db, user_id):
    db.add(TokenUsage(user_id=user_id, model="m", prompt_tokens=LIMIT, completion_tokens=0,
                      total_tokens=LIMIT))
    db.commit()


def spent(db, user_id) -> list[int]:
    return [u.total_tokens for u in db.query(TokenUsage).filter(TokenUsage.user_id == user_id)]


def test_asks_provider_for_usage(client, alice, llm):
    llm.chunks.append(chunk("ok"))

    send(client, alice)

    assert llm.calls[0]["stream_options"] == {"include_usage": True}


def test_records_usage_from_last_chunk(client, alice, llm, db_session):
    usage = {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
    llm.chunks.extend([chunk("Здравствуйте"), chunk(usage=usage)])

    send(client, alice)

    row = db_session.query(TokenUsage).one()
    assert (row.prompt_tokens, row.completion_tokens, row.total_tokens) == (10, 5, 15)
    assert row.model == settings.openrouter_model


def test_estimates_usage_when_provider_omits_it(client, alice, llm, db_session):
    llm.chunks.append(chunk("b" * 40))

    send(client, alice, "a" * 40)

    assert spent(db_session, alice.id) == [20]  # (40 + 40) символов / 4


def test_failed_stream_records_nothing(client, alice, llm, db_session):
    llm.error = RuntimeError("provider down")

    resp = send(client, alice)

    assert "event: error" in resp.text
    assert spent(db_session, alice.id) == []


def test_rejects_with_429_when_limit_exhausted(client, alice, llm, db_session):
    exhaust(db_session, alice.id)

    resp = send(client, alice)

    assert resp.status_code == 429
    body = resp.json()
    assert body["detail"] == "Лимит токенов исчерпан"
    assert body["code"] == "token_limit_exceeded"
    assert (body["limit"], body["used"], body["remaining"]) == (LIMIT, LIMIT, 0)
    period = timedelta(minutes=settings.token_limit_period_minutes)
    assert datetime.fromisoformat(body["resets_at"]) == current_window(utcnow(), period)[1]
    assert 0 < int(resp.headers["Retry-After"]) <= period.total_seconds()


def test_rejected_message_is_not_saved_and_model_not_called(client, alice, llm, db_session):
    exhaust(db_session, alice.id)

    send(client, alice)

    assert db_session.query(Message).count() == 0
    assert llm.calls == []


def test_limit_is_per_user(client, alice, auth, llm, db_session):
    exhaust(db_session, alice.id)
    bob_headers = auth("bob", "password123")
    bob_chat = client.post("/api/chats", json={}, headers=bob_headers).json()["id"]
    llm.chunks.append(chunk("ok"))

    resp = send(client, SimpleNamespace(headers=bob_headers, chat_id=bob_chat))

    assert resp.status_code == 200
```

- [ ] **Step 2: Убедиться, что падают по правильной причине**

Run: `cd api && uv run pytest tests/test_token_limit.py -v`
Expected: FAIL — `KeyError: 'stream_options'`, пустой журнал в тестах записи, `200 != 429` в тестах исчерпания. `test_limit_is_per_user` может пройти уже сейчас — это нормально, он страхует от регресса.

- [ ] **Step 3: Схема ответа**

`api/app/schemas.py` — в конец:

```python
class UsageOut(BaseModel):
    limit: int
    used: int
    remaining: int
    resets_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Обработчик 429**

`api/app/main.py` — итоговые импорты и обработчик сразу после `app = FastAPI(...)`:

```python
import math
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.limits.service import TokenLimitExceeded
from app.models import utcnow
from app.routers import auth, chat
from app.schemas import UsageOut
```

```python
@app.exception_handler(TokenLimitExceeded)
def token_limit_exceeded(_request: Request, exc: TokenLimitExceeded) -> JSONResponse:
    retry_after = math.ceil((exc.status.resets_at - utcnow()).total_seconds())
    return JSONResponse(
        status_code=429,
        content={
            "detail": str(exc),
            "code": "token_limit_exceeded",
            **UsageOut.model_validate(exc.status).model_dump(mode="json"),
        },
        headers={"Retry-After": str(max(retry_after, 0))},
    )
```

- [ ] **Step 5: Встроить лимит в отправку**

`api/app/routers/chat.py` — импорты:

```python
from app.limits.counting import count_tokens
from app.limits.service import ensure_within_limit, record_usage
```

В `send_message` сразу после `chat = get_own_chat(chat_id, user, db)`:

```python
    ensure_within_limit(db, user)  # до сохранения: отклонённое сообщение не попадает в историю
```

Возврат стрима:

```python
    return StreamingResponse(
        stream_assistant_reply(history, model, chat.id, user.id),
        media_type="text/event-stream",
    )
```

`stream_assistant_reply` целиком:

```python
def stream_assistant_reply(history: list[dict], model: str, chat_id: int, user_id: int):
    """Стримит ответ OpenRouter клиенту «как есть» (SSE), сохраняет ответ и расход токенов."""
    client = build_openai_client()
    accumulated = ""
    usage = None

    try:
        stream = client.chat.completions.create(
            model=model,
            messages=history,
            stream=True,
            stream_options={"include_usage": True},  # usage придёт последним чанком
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                accumulated += delta
            usage = chunk.usage or usage
            # Прокидываем чанк наружу в исходном формате OpenAI (решение Q5a).
            yield f"data: {chunk.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as exc:
        # Ошибка (например, невалидный ключ OpenRouter) — отдаём событием SSE.
        yield f'event: error\ndata: {json.dumps({"detail": str(exc)})}\n\n'
        return

    # Ответ и расход сохраняем только после успешного стрима, одной транзакцией.
    count = count_tokens(usage, history, accumulated, settings.token_estimate_chars_per_token)
    with SessionLocal() as db:
        if accumulated:
            db.add(Message(chat_id=chat_id, role="assistant", content=accumulated))
        record_usage(db, user_id, model, count)
        db.commit()
```

- [ ] **Step 6: Убедиться, что проходят**

Run: `cd api && uv run pytest tests/test_token_limit.py -v`
Expected: 7 passed

- [ ] **Step 7: Прогнать весь бэкенд**

Run: `cd api && uv run pytest -q`
Expected: все passed

- [ ] **Step 8: Commit** (основная сессия)

```bash
git add api/app/schemas.py api/app/main.py api/app/routers/chat.py api/tests/test_token_limit.py
git commit -m "Enforce token limit on sending messages with a 429 response"
```

---

### Task 5: `GET /api/usage`

Закрывает критерий приёмки 7.

**Files:**
- Create: `api/app/routers/usage.py`
- Modify: `api/app/main.py` (импорт и `include_router`)
- Test: `api/tests/test_token_limit.py` (дописать в конец)

**Interfaces:**
- Consumes: `get_usage` (Task 3), `UsageOut` (Task 4), `get_current_user`, `get_db`.
- Produces: `GET /api/usage` → `200 UsageOut`; без токена `401`.

- [ ] **Step 1: Написать падающие тесты** — дописать в `api/tests/test_token_limit.py`:

```python
def test_usage_endpoint_returns_current_status(client, alice, llm, db_session):
    db_session.add(TokenUsage(user_id=alice.id, model="m", prompt_tokens=30, completion_tokens=0,
                              total_tokens=30))
    db_session.commit()

    body = client.get("/api/usage", headers=alice.headers).json()

    assert (body["limit"], body["used"], body["remaining"]) == (LIMIT, 30, 70)
    assert body["resets_at"].endswith("Z")


def test_usage_endpoint_requires_token(client):
    assert client.get("/api/usage").status_code == 401
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cd api && uv run pytest tests/test_token_limit.py -k usage_endpoint -v`
Expected: FAIL — `404` вместо `200` / `401` (маршрута нет; без токена сейчас отвечает статика или 404).

- [ ] **Step 3: Реализация**

`api/app/routers/usage.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.limits.service import get_usage
from app.models import User
from app.schemas import UsageOut

router = APIRouter(prefix="/api", tags=["usage"])


@router.get("/usage", response_model=UsageOut)
def read_usage(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_usage(db, user)
```

`api/app/main.py`: `from app.routers import auth, chat, usage` и после `app.include_router(chat.router)`:

```python
app.include_router(usage.router)
```

- [ ] **Step 4: Убедиться, что проходят**

Run: `cd api && uv run pytest -q`
Expected: все passed

- [ ] **Step 5: Commit** (основная сессия)

```bash
git add api/app/routers/usage.py api/app/main.py api/tests/test_token_limit.py
git commit -m "Add GET /api/usage with the current token limit status"
```

---

### Task 6: Фронт — `Usage`, `getUsage`, `TokenLimitError`

Закрывает фронтовую часть контракта 429 (критерий 9 — источник данных).

**Files:**
- Modify: `front/src/api.ts`
- Test: `front/src/api.test.ts`

**Interfaces:**
- Consumes: `GET /api/usage`, контракт 429.
- Produces:
  - `export interface Usage { limit: number; used: number; remaining: number; resets_at: string }`;
  - `export class TokenLimitError extends Error { readonly usage: Usage }`, `message === 'Лимит токенов исчерпан'`;
  - `api.getUsage(): Promise<Usage>`;
  - `api.sendMessage` на `429` с `code === 'token_limit_exceeded'` бросает `TokenLimitError`.

- [ ] **Step 1: Написать падающие тесты**

`front/src/api.test.ts` — импорт заменить на:

```ts
import { api, getToken, setToken, TokenLimitError } from './api'
```

В `describe('request', …)` добавить:

```ts
  it('getUsage читает статус лимита', async () => {
    const usage = { limit: 1000, used: 300, remaining: 700, resets_at: '2026-09-17T00:00:00Z' }
    fetchMock.mockResolvedValue(jsonResponse(usage))

    await expect(api.getUsage()).resolves.toEqual(usage)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/usage')
  })
```

В `describe('sendMessage (SSE)', …)` добавить:

```ts
  it('на 429 с token_limit_exceeded бросает TokenLimitError с остатком', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: () =>
        Promise.resolve({
          detail: 'Лимит токенов исчерпан',
          code: 'token_limit_exceeded',
          limit: 1000,
          used: 1200,
          remaining: 0,
          resets_at: '2026-09-17T00:00:00Z',
        }),
    } as unknown as Response)

    const err = await api.sendMessage(1, 'hi', () => {}).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(TokenLimitError)
    expect((err as TokenLimitError).usage).toEqual({
      limit: 1000,
      used: 1200,
      remaining: 0,
      resets_at: '2026-09-17T00:00:00Z',
    })
  })

  it('429 без кода лимита — обычный Error с detail', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: () => Promise.resolve({ detail: 'Слишком часто' }),
    } as unknown as Response)

    const err = await api.sendMessage(1, 'hi', () => {}).catch((e: unknown) => e)

    expect(err).not.toBeInstanceOf(TokenLimitError)
    expect((err as Error).message).toBe('Слишком часто')
  })
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cd front && npx vitest run src/api.test.ts`
Expected: FAIL — `TokenLimitError` не экспортируется / `api.getUsage is not a function`

- [ ] **Step 3: Реализация** в `front/src/api.ts`

После `interface Message`:

```ts
export interface Usage {
  limit: number
  used: number
  remaining: number
  resets_at: string
}

export class TokenLimitError extends Error {
  readonly usage: Usage

  constructor(usage: Usage) {
    super('Лимит токенов исчерпан')
    this.name = 'TokenLimitError'
    this.usage = usage
  }
}
```

Перед `request()`:

```ts
async function responseError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({ detail: res.statusText }))
  if (res.status === 429 && body.code === 'token_limit_exceeded') {
    const { limit, used, remaining, resets_at } = body
    return new TokenLimitError({ limit, used, remaining, resets_at })
  }
  return new Error(body.detail ?? 'Request failed')
}
```

В `request()` и в `sendMessage()` заменить оба блока

```ts
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Request failed')
  }
```

на

```ts
  if (!res.ok) throw await responseError(res)
```

(в `sendMessage` — с отступом внутри метода). В объект `api` после `listMessages`:

```ts
  getUsage() {
    return request<Usage>('/api/usage')
  },
```

- [ ] **Step 4: Убедиться, что проходят**

Run: `cd front && npx vitest run src/api.test.ts`
Expected: все passed (включая старые про `Error` с `detail`/`statusText`)

- [ ] **Step 5: Commit** (основная сессия)

```bash
git add front/src/api.ts front/src/api.test.ts
git commit -m "Add usage API and TokenLimitError to the frontend client"
```

---

### Task 7: Composable `useTokenUsage`

Закрывает критерии 8 (данные для строки) и 9 (авто-разблокировка).

**Files:**
- Create: `front/src/composables/useTokenUsage.ts`
- Test: `front/src/composables/useTokenUsage.test.ts`

**Interfaces:**
- Consumes: `api.getUsage`, `Usage` (Task 6).
- Produces: `useTokenUsage(): { usage: Ref<Usage | null>; exhausted: ComputedRef<boolean>; resetsAtLabel: ComputedRef<string>; refresh: () => Promise<void>; setUsage: (u: Usage) => void }`.

- [ ] **Step 1: Написать падающие тесты**

`front/src/composables/useTokenUsage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { api, type Usage } from '../api'
import { useTokenUsage } from './useTokenUsage'

vi.mock('../api', () => ({ api: { getUsage: vi.fn() } }))
const getUsage = vi.mocked(api.getUsage)

// Локальное время: ожидания не зависят от часового пояса машины.
const NOW = new Date(2026, 8, 16, 12, 0)
const usage = (over: Partial<Usage> = {}): Usage => ({
  limit: 1000,
  used: 300,
  remaining: 700,
  resets_at: new Date(2026, 8, 16, 15, 0).toISOString(),
  ...over,
})

const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useTokenUsage())!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useTokenUsage', () => {
  it('refresh загружает статус с сервера', async () => {
    getUsage.mockResolvedValue(usage())
    const { usage: state, refresh } = setup()

    await refresh()

    expect(state.value).toEqual(usage())
  })

  it('exhausted — когда остаток ноль', () => {
    const { exhausted, setUsage } = setup()

    setUsage(usage({ used: 1200, remaining: 0 }))

    expect(exhausted.value).toBe(true)
  })

  it('время сброса сегодня — только часы и минуты', () => {
    const { resetsAtLabel, setUsage } = setup()

    setUsage(usage())

    expect(resetsAtLabel.value).toBe('15:00')
  })

  it('время сброса в другой день — с датой', () => {
    const { resetsAtLabel, setUsage } = setup()

    setUsage(usage({ resets_at: new Date(2026, 8, 17, 3, 0).toISOString() }))

    expect(resetsAtLabel.value).toBe('17 сент., 03:00')
  })

  it('после момента сброса сам перезапрашивает статус', async () => {
    const { setUsage } = setup()
    getUsage.mockResolvedValue(usage({ used: 0, remaining: 1000 }))

    setUsage(usage({ resets_at: new Date(NOW.getTime() + 60_000).toISOString() }))
    await vi.advanceTimersByTimeAsync(59_000)
    expect(getUsage).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(getUsage).toHaveBeenCalledOnce()
  })

  it('ошибку загрузки глотает — счётчик вторичен', async () => {
    getUsage.mockRejectedValue(new Error('down'))
    const { usage: state, refresh } = setup()

    await expect(refresh()).resolves.toBeUndefined()
    expect(state.value).toBeNull()
  })
})
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cd front && npx vitest run src/composables/useTokenUsage.test.ts`
Expected: FAIL — `Failed to resolve import "./useTokenUsage"`

- [ ] **Step 3: Реализация**

`front/src/composables/useTokenUsage.ts`:

```ts
import { computed, onScopeDispose, ref } from 'vue'
import { api, type Usage } from '../api'

const MAX_TIMEOUT_MS = 2 ** 31 - 1 // больше — setTimeout срабатывает сразу
const RESET_GRACE_MS = 1000 // запас на расхождение часов клиента и сервера

function formatResetsAt(resetsAt: Date, now: Date): string {
  const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  return resetsAt.toDateString() === now.toDateString()
    ? resetsAt.toLocaleTimeString('ru-RU', time)
    : resetsAt.toLocaleString('ru-RU', { day: 'numeric', month: 'short', ...time })
}

/** Остаток лимита токенов; сам обновляется, когда окно лимита сбрасывается. */
export function useTokenUsage() {
  const usage = ref<Usage | null>(null)
  const exhausted = computed(() => usage.value?.remaining === 0)
  const resetsAtLabel = computed(() =>
    usage.value ? formatResetsAt(new Date(usage.value.resets_at), new Date()) : '',
  )

  let timer: ReturnType<typeof setTimeout> | undefined

  function setUsage(next: Usage) {
    usage.value = next
    clearTimeout(timer)
    const delay = new Date(next.resets_at).getTime() - Date.now() + RESET_GRACE_MS
    timer = setTimeout(refresh, Math.min(Math.max(delay, 0), MAX_TIMEOUT_MS))
  }

  async function refresh() {
    try {
      setUsage(await api.getUsage())
    } catch {
      // Счётчик вторичен: при сбое оставляем прежнее значение, отправку не ломаем.
    }
  }

  onScopeDispose(() => clearTimeout(timer))

  return { usage, exhausted, resetsAtLabel, refresh, setUsage }
}
```

- [ ] **Step 4: Убедиться, что проходят**

Run: `cd front && npx vitest run src/composables/useTokenUsage.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit** (основная сессия)

```bash
git add front/src/composables/useTokenUsage.ts front/src/composables/useTokenUsage.test.ts
git commit -m "Add useTokenUsage composable with auto refresh on reset"
```

---

### Task 8: `useConversation` обновляет счётчик и обрабатывает исчерпание

Закрывает критерий 8 (обновление после ответа) и часть 9 (исчерпание без красного баннера).

**Files:**
- Modify: `front/src/composables/useConversation.ts`
- Test: `front/src/composables/useConversation.test.ts`

**Interfaces:**
- Consumes: `TokenLimitError`, `Usage` (Task 6); `refresh`/`setUsage` из `useTokenUsage` (Task 7) — передаются как зависимости.
- Produces: `Deps` расширен полями `refreshUsage: () => Promise<void>` и `setUsage: (usage: Usage) => void`.

- [ ] **Step 1: Написать падающие тесты**

`front/src/composables/useConversation.test.ts`:

Импорт и мок заменить на:

```ts
import { api, TokenLimitError, type Chat, type Message } from '../api'
import { useConversation } from './useConversation'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  api: { listMessages: vi.fn(), sendMessage: vi.fn() },
}))
```

В `setup()` в объект `deps` добавить (перед `...overrides`):

```ts
    refreshUsage: vi.fn(async () => {}),
    setUsage: vi.fn(),
```

В конец `describe` добавить:

```ts
  it('после ответа обновляет счётчик токенов', async () => {
    const refreshUsage = vi.fn(async () => {})
    const { send } = setup({ activeChatId: ref<number | null>(1), refreshUsage })
    sendMessage.mockResolvedValue(undefined)
    listMessages.mockResolvedValue([])

    await send('Вопрос')

    expect(refreshUsage).toHaveBeenCalled()
  })

  it('исчерпанный лимит кладёт остаток в счётчик и не показывает ошибку', async () => {
    const setUsage = vi.fn()
    const { error, send } = setup({ activeChatId: ref<number | null>(1), setUsage })
    const usage = { limit: 1000, used: 1200, remaining: 0, resets_at: '2026-09-17T00:00:00Z' }
    sendMessage.mockRejectedValue(new TokenLimitError(usage))
    listMessages.mockResolvedValue([])

    await send('Вопрос')

    expect(setUsage).toHaveBeenCalledWith(usage)
    expect(error.value).toBe('')
  })
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cd front && npx vitest run src/composables/useConversation.test.ts`
Expected: FAIL — `refreshUsage` не вызван; `error.value` равен `'Лимит токенов исчерпан'`

- [ ] **Step 3: Реализация** в `front/src/composables/useConversation.ts`

Импорт:

```ts
import { api, TokenLimitError, type Chat, type Message, type Usage } from '../api'
```

`Deps` и сигнатура:

```ts
interface Deps {
  activeChatId: Ref<number | null>
  error: Ref<string>
  consumeFresh: (id: number | null) => boolean
  createChat: () => Promise<Chat>
  refreshChats: () => Promise<void>
  refreshUsage: () => Promise<void>
  setUsage: (usage: Usage) => void
}

/** Лента активного чата: загрузка истории и отправка сообщения со стримом ответа. */
export function useConversation({
  activeChatId,
  error,
  consumeFresh,
  createChat,
  refreshChats,
  refreshUsage,
  setUsage,
}: Deps) {
```

`catch` и `finally` в `send`:

```ts
    } catch (err) {
      // Исчерпание показывает отдельный блок в окне чата, а не баннер ошибки.
      if (err instanceof TokenLimitError) setUsage(err.usage)
      else error.value = errorMessage(err)
    } finally {
      streaming.value = false
      // Синхронизируемся с БД: ответ ассистента сохранён сервером, чат мог получить название.
      if (activeChatId.value !== null) {
        messages.value = await api
          .listMessages(activeChatId.value)
          .catch(() => messages.value)
        await refreshChats()
      }
      await refreshUsage()
    }
```

- [ ] **Step 4: Убедиться, что проходят**

Run: `cd front && npx vitest run src/composables/useConversation.test.ts`
Expected: все passed

- [ ] **Step 5: Типы** — `ChatView.vue` ещё не передаёт новые зависимости, поэтому `npm run build` до Task 9 упадёт на `vue-tsc`. Это ожидаемо; не чинить здесь.

- [ ] **Step 6: Commit** (основная сессия; pre-commit хук гоняет только lint + vitest)

```bash
git add front/src/composables/useConversation.ts front/src/composables/useConversation.test.ts
git commit -m "Refresh token usage after replies and handle exhausted limit"
```

---

### Task 9: UI лимита и e2e

Закрывает критерии 8, 9 и проверяет всю связку.

**Files:**
- Modify: `e2e/fake_openrouter.py`
- Modify: `e2e/playwright.config.ts`
- Create: `e2e/tests/limit.spec.ts`
- Modify: `front/src/components/ChatWindow.vue`
- Modify: `front/src/components/ChatView.vue`

**Interfaces:**
- Consumes: `useTokenUsage` (Task 7), новые зависимости `useConversation` (Task 8), `Usage` (Task 6).
- Produces: пропсы `ChatWindow`: `usage: Usage | null`, `exhausted: boolean`, `resetsAtLabel: string`.

- [ ] **Step 1: Стаб отдаёт usage**

`e2e/fake_openrouter.py` — константа после `REPLY`:

```python
TOTAL_TOKENS = 300  # e2e: TOKEN_LIMIT=1000 → лимит кончается после 4-го ответа
```

В `do_POST` перед `self.wfile.write(b"data: [DONE]\n\n")`:

```python
        usage = {**chunk(""), "choices": [],
                 "usage": {"prompt_tokens": 200, "completion_tokens": 100, "total_tokens": TOTAL_TOKENS}}
        self.wfile.write(f"data: {json.dumps(usage)}\n\n".encode())
```

`e2e/playwright.config.ts` — в `env` бэкенда добавить:

```ts
        TOKEN_LIMIT: '1000',
```

- [ ] **Step 2: Написать падающий e2e**

`e2e/tests/limit.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

const STUB_REPLY = 'Это ответ стаба OpenRouter.' // держать в согласии с fake_openrouter.py

async function register(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByPlaceholder('Имя пользователя').fill(`user_${Date.now()}`)
  await page.getByPlaceholder('Пароль').fill('password123')
  await page.getByRole('button', { name: 'Создать аккаунт и войти' }).click()
}

/** Отправляет сообщение и ждёт, пока в ленте станет `replies` завершённых ответов. */
async function send(page: Page, text: string, replies: number) {
  const composer = page.getByPlaceholder('Сообщение')
  await composer.fill(text)
  await composer.press('Enter')
  await expect(page.locator('.message.assistant')).toHaveCount(replies)
  await expect(page.locator('.message.assistant .bubble').last()).toHaveText(STUB_REPLY)
}

test('после ответа показывает остаток токенов', async ({ page }) => {
  await register(page)

  await send(page, 'Первый', 1)

  await expect(page.getByText('Осталось 700 из 1000 токенов')).toBeVisible()
})

test('исчерпанный лимит блокирует ввод и называет время сброса', async ({ page }) => {
  await register(page)

  for (let i = 1; i <= 4; i++) await send(page, `Вопрос ${i}`, i)

  await expect(page.getByText('Лимит токенов исчерпан. Новые сообщения можно отправить после')).toBeVisible()
  await expect(page.getByPlaceholder('Сообщение')).toBeDisabled()
  await expect(page.locator('.composer button')).toBeDisabled()
})
```

- [ ] **Step 3: Убедиться, что падает**

Run: `cd e2e && npx playwright test tests/limit.spec.ts`
Expected: FAIL — `getByText('Осталось 700 из 1000 токенов')` не найден (UI ещё нет).

- [ ] **Step 4: `ChatWindow.vue`**

`<script setup>`:

```ts
import type { Message, Usage } from '../api'
```

```ts
const props = defineProps<{
  activeChatId: number | null
  chatTitle: string
  messages: Message[]
  streaming: boolean
  error: string
  usage: Usage | null
  exhausted: boolean
  resetsAtLabel: string
}>()
```

```ts
const canSend = computed(() => !!input.value.trim() && !props.streaming && !props.exhausted)
```

В шаблоне у `<input>` в `.composer`: `:disabled="streaming || exhausted"`. Сразу после `</form>`:

```html
    <p v-if="exhausted" class="limit-banner" role="status">
      Лимит токенов исчерпан. Новые сообщения можно отправить после {{ resetsAtLabel }}
    </p>
    <p v-else-if="usage" class="usage-line">
      Осталось {{ usage.remaining }} из {{ usage.limit }} токенов · сброс в {{ resetsAtLabel }}
    </p>
```

В `<style scoped>` в конец:

```css
.usage-line {
  margin: 0;
  padding: 0 16px 10px;
  font-size: 12px;
  color: var(--muted);
}

.limit-banner {
  margin: 0 16px 12px;
  padding: 10px 12px;
  background: #3a2f1f;
  border: 1px solid #6b5a2d;
  color: #ffd9a0;
  border-radius: 8px;
  font-size: 13px;
}
```

- [ ] **Step 5: `ChatView.vue`**

Импорт:

```ts
import { useTokenUsage } from '../composables/useTokenUsage'
```

Перед `useConversation`:

```ts
const { usage, exhausted, resetsAtLabel, refresh: refreshUsage, setUsage } = useTokenUsage()
```

В объект зависимостей `useConversation` добавить `refreshUsage, setUsage`. Заменить `onMounted(loadChats)` на:

```ts
onMounted(() => {
  loadChats()
  refreshUsage()
})
```

В `<ChatWindow …>` добавить:

```html
      :usage="usage"
      :exhausted="exhausted"
      :resets-at-label="resetsAtLabel"
```

- [ ] **Step 6: Убедиться, что e2e проходит**

Run: `cd e2e && npx playwright test tests/limit.spec.ts`
Expected: 2 passed

- [ ] **Step 7: Полная проверка**

Run: `cd front && npm run lint && npx vitest run && npm run build`
Expected: без ошибок

Run: `cd e2e && npx playwright test`
Expected: все passed (старые спеки шлют ≤ 3 сообщений на пользователя = 900 токенов)

Run: `cd api && uv run pytest -q`
Expected: все passed

- [ ] **Step 8: Commit** (основная сессия)

```bash
git add e2e/fake_openrouter.py e2e/playwright.config.ts e2e/tests/limit.spec.ts front/src/components/ChatWindow.vue front/src/components/ChatView.vue
git commit -m "Show token usage and block input when the limit is exhausted"
```

---

### Task 10: Документация

**Files:**
- Modify: `CONTEXT.md`
- Modify: `README.md`
- Create: `docs/adr/0005-soft-token-limit-fixed-window.md`

- [ ] **Step 1: `CONTEXT.md`** — после блока «Стрим ответа», перед «Модель»:

```markdown
**Лимит токенов (Token limit)**:
Сколько токенов LLM пользователь может потратить за окно лимита — фиксированный
период (по умолчанию сутки UTC), по окончании которого расход обнуляется. Каждый
ответ ассистента расходует токены всей истории чата плюс самого ответа; при
исчерпании новые сообщения отклоняются до начала следующего окна.
_Avoid_: квота, баланс
```

- [ ] **Step 2: `README.md`**

В дереве `api/app/` после `openai_client.py`:

```
│       ├── limits/             # лимит токенов: окно, подсчёт, сервис (см. ADR-0005)
```

и в `routers/` после `chat.py`:

```
│           └── usage.py        # /api/usage — остаток лимита токенов
```

(у `chat.py` заменить `└──` на `├──`). В строке про `.env / .env.example` дописать `, TOKEN_LIMIT*`.

В таблицу API после `POST /api/chats/{id}/messages` — заменить её описание и добавить строку:

```markdown
| POST | `/api/chats/{id}/messages` | отправить сообщение; ответ — SSE-стрим; `429`, если исчерпан лимит токенов |
| GET | `/api/usage` | остаток лимита токенов: `limit`, `used`, `remaining`, `resets_at` |
```

После абзаца про формат чанков (ADR-0001):

```markdown
**Лимит токенов**: у каждого пользователя `TOKEN_LIMIT` токенов (по умолчанию 1000) за
окно `TOKEN_LIMIT_PERIOD_MINUTES` (по умолчанию 1440 — сброс в 00:00 UTC). Считается
`usage` OpenRouter (вся история чата + ответ), без него — оценка
`символы / TOKEN_ESTIMATE_CHARS_PER_TOKEN`. Проверка до запроса к модели, поэтому
последний ответ может немного превысить лимит. При исчерпании — `429` с
`code: "token_limit_exceeded"`, `resets_at` и `Retry-After`.
```

- [ ] **Step 3: ADR** — `docs/adr/0005-soft-token-limit-fixed-window.md`:

```markdown
# Мягкий лимит токенов в фиксированном окне

Расход токенов пишется в журнал `token_usage` — строка на каждый успешный ответ
ассистента, цифры из `usage` OpenRouter (без него — оценка по символам). Лимит
проверяется до запроса к модели суммой журнала с начала текущего окна; окна
фиксированные и выровнены по Unix-эпохе в UTC.

**Considered Options**:
- **Скользящее окно** — отклонено: «когда освободятся токены» плавает, пользователю
  это сложно объяснить.
- **Агрегированный счётчик на окно** — отклонён: теряет детализацию (модель, промпт
  против ответа), upsert различается в SQLite и Postgres.
- **Жёсткий лимит с резервированием** (`tiktoken` + `max_tokens = остаток`) —
  отклонён: новая зависимость, неточен для не-OpenAI моделей, на маленьких лимитах
  обрывает ответы на полуслове.

**Consequences**:
- Последний ответ может перебрать лимит; параллельные запросы одного пользователя
  могут оба пройти проверку.
- Журнал бесплатно даёт аналитику по моделям и смену окна без миграций.
- Индивидуальные лимиты и тарифы подключаются в одном месте — `limit_for(user)`.
```

- [ ] **Step 4: Commit** (основная сессия)

```bash
git add CONTEXT.md README.md docs/adr/0005-soft-token-limit-fixed-window.md
git commit -m "Document token limit in glossary, README and ADR-0005"
```

---

## Покрытие спека

| Критерий | Задачи |
|---|---|
| 1. env и дефолты | 1 |
| 2. запись usage / оценки | 2, 4 |
| 3. только текущее окно, сброс | 1, 3 |
| 4. лимит на пользователя | 3, 4 |
| 5. 429 + code + resets_at + Retry-After, сообщение не сохранено | 3, 4 |
| 6. упавший стрим не списывает | 4 |
| 7. `GET /api/usage`, 401 | 5 |
| 8. остаток и время сброса, обновление после ответа | 7, 8, 9 |
| 9. блок исчерпания, блокировка, авто-разблокировка | 6, 7, 8, 9 |
| Документация | 10 |
