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
