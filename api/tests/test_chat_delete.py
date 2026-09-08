"""Тесты ручки DELETE /api/chats/{chat_id}."""

from app.models import Chat, Message


def user_id(db, username: str) -> int:
    from app.models import User

    return db.query(User).filter(User.username == username).one().id


def make_chat(db, uid: int, title: str, *messages: str) -> Chat:
    chat = Chat(title=title, user_id=uid)
    db.add(chat)
    db.flush()
    for i, content in enumerate(messages):
        db.add(Message(chat_id=chat.id, role="user" if i % 2 == 0 else "assistant", content=content))
    db.commit()
    return chat


def test_deletes_own_chat_with_its_messages(client, auth, db_session):
    headers = auth()
    uid = user_id(db_session, "alice")
    chat = make_chat(db_session, uid, "На удаление", "привет", "и тебе привет")
    chat_id = chat.id
    survivor = make_chat(db_session, uid, "Остаётся", "меня не трогай")

    resp = client.delete(f"/api/chats/{chat_id}", headers=headers)

    assert resp.status_code == 204
    assert resp.content == b""
    assert [c["id"] for c in client.get("/api/chats", headers=headers).json()] == [survivor.id]
    assert db_session.query(Message).filter(Message.chat_id == chat_id).count() == 0
    # каскад не задел сообщения соседнего чата
    assert db_session.query(Message).filter(Message.chat_id == survivor.id).count() == 1


def test_cannot_delete_another_users_chat(client, auth, db_session):
    alice = auth("alice", "password123")
    auth("bob", "password123")
    bob_chat = make_chat(db_session, user_id(db_session, "bob"), "Чат Боба")

    resp = client.delete(f"/api/chats/{bob_chat.id}", headers=alice)

    assert resp.status_code == 404
    assert db_session.get(Chat, bob_chat.id) is not None


def test_deleting_missing_chat_returns_404(client, auth):
    headers = auth()

    assert client.delete("/api/chats/9999", headers=headers).status_code == 404


def test_delete_requires_authentication(client, auth, db_session):
    auth()
    chat = make_chat(db_session, user_id(db_session, "alice"), "Чат")

    assert client.delete(f"/api/chats/{chat.id}").status_code == 401
