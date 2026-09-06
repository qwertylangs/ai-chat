"""Тесты ручки GET /api/chats/search — поиск по названию и содержимому чата."""

from datetime import datetime, timedelta, timezone
from itertools import count

from app.models import Chat, Message

_clock = count()


def make_chat(db, user_id: int, title: str, *messages: str) -> Chat:
    # Явный, монотонно растущий created_at — иначе несколько utcnow() в одном тесте
    # совпадают вплоть до микросекунд и порядок выдачи становится неопределённым.
    created = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=next(_clock))
    chat = Chat(title=title, user_id=user_id, created_at=created)
    db.add(chat)
    db.flush()
    for i, content in enumerate(messages):
        role = "user" if i % 2 == 0 else "assistant"
        db.add(Message(chat_id=chat.id, role=role, content=content))
    db.commit()
    return chat


def user_id(db, username: str) -> int:
    from app.models import User

    return db.query(User).filter(User.username == username).one().id


def search(client, headers, q: str):
    return client.get("/api/chats/search", params={"q": q}, headers=headers)


def titles(resp) -> list[str]:
    return [c["title"] for c in resp.json()]


def test_finds_chat_by_title_word(client, auth, db_session):
    headers = auth()
    uid = user_id(db_session, "alice")
    make_chat(db_session, uid, "Планы на отпуск", "куда поедем летом")
    make_chat(db_session, uid, "Рабочие задачи", "надо закрыть спринт")

    resp = search(client, headers, "отпуск")

    assert resp.status_code == 200
    assert titles(resp) == ["Планы на отпуск"]


def test_finds_chat_by_message_content_not_in_title(client, auth, db_session):
    headers = auth()
    uid = user_id(db_session, "alice")
    make_chat(db_session, uid, "Разное", "напомни рецепт борща")
    make_chat(db_session, uid, "Ещё разное", "как дела")

    resp = search(client, headers, "борща")

    assert titles(resp) == ["Разное"]


def test_all_words_must_match_across_title_and_messages(client, auth, db_session):
    headers = auth()
    uid = user_id(db_session, "alice")
    # оба слова есть, но в разных сообщениях и в названии
    make_chat(
        db_session, uid, "Питон", "расскажи про декораторы", "и про генераторы тоже"
    )
    # есть только одно слово из двух
    make_chat(db_session, uid, "Питон", "расскажи про классы")

    both = search(client, headers, "декораторы генераторы")
    assert len(both.json()) == 1

    partial = search(client, headers, "декораторы классы")
    assert partial.json() == []

    # одно слово из названия, другое — из сообщения того же чата
    title_and_message = search(client, headers, "питон генераторы")
    assert titles(title_and_message) == ["Питон"]


def test_yo_and_ye_are_interchangeable_both_directions(client, auth, db_session):
    headers = auth()
    uid = user_id(db_session, "alice")
    make_chat(db_session, uid, "Про ёжиков", "ёжик в тумане")
    make_chat(db_session, uid, "Лес", "видел ежевику на поляне")

    # запрос через "е" находит контент с "ё"
    assert titles(search(client, headers, "ежик")) == ["Про ёжиков"]
    # запрос через "ё" находит контент с "ё"
    assert titles(search(client, headers, "ёжик")) == ["Про ёжиков"]
    # "ежевику" не должно совпасть с запросом "ёжик"
    assert "Лес" not in titles(search(client, headers, "ёжик"))


def test_search_is_case_insensitive(client, auth, db_session):
    headers = auth()
    uid = user_id(db_session, "alice")
    make_chat(db_session, uid, "Django ORM", "queryset и prefetch_related")

    assert titles(search(client, headers, "django")) == ["Django ORM"]
    assert titles(search(client, headers, "PREFETCH_RELATED")) == ["Django ORM"]


def test_does_not_leak_other_users_chats(client, auth, db_session):
    alice = auth("alice", "password123")
    auth("bob", "password123")
    bob_uid = user_id(db_session, "bob")
    make_chat(db_session, bob_uid, "Секреты Боба", "пароль от вайфая 12345")

    resp = search(client, alice, "пароль")

    assert resp.json() == []


def test_blank_query_is_rejected(client, auth):
    headers = auth()

    assert search(client, headers, "").status_code == 422
    assert search(client, headers, "   ").status_code == 422


def test_no_matches_returns_empty_list(client, auth, db_session):
    headers = auth()
    uid = user_id(db_session, "alice")
    make_chat(db_session, uid, "Погода", "завтра дождь")

    resp = search(client, headers, "снегопад")

    assert resp.status_code == 200
    assert resp.json() == []


def test_results_are_newest_first(client, auth, db_session):
    headers = auth()
    uid = user_id(db_session, "alice")
    make_chat(db_session, uid, "Первый", "общее слово якорь")
    make_chat(db_session, uid, "Второй", "общее слово якорь")
    make_chat(db_session, uid, "Третий", "общее слово якорь")

    assert titles(search(client, headers, "якорь")) == ["Третий", "Второй", "Первый"]


def test_requires_authentication(client):
    assert client.get("/api/chats/search", params={"q": "что"}).status_code == 401
