import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.database import SessionLocal, get_db
from app.deps import get_current_user, get_own_chat
from app.limits.counting import count_tokens
from app.limits.service import ensure_within_limit, record_usage
from app.models import Chat, Message, User
from app.openai_client import build_openai_client
from app.schemas import ChatIn, ChatOut, MessageIn, MessageOut

router = APIRouter(prefix="/api", tags=["chat"])


@router.get("/chats", response_model=list[ChatOut])
def list_chats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(Chat)
        .filter(Chat.user_id == user.id)
        .order_by(Chat.created_at.desc(), Chat.id.desc())
        .all()
    )


def _fold(text: str) -> str:
    """Приводит к нижнему регистру и делает «ё» и «е» взаимозаменяемыми."""
    return text.lower().replace("ё", "е")


@router.get("/chats/search", response_model=list[ChatOut])
def search_chats(
    q: str = Query(min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Чаты пользователя, у которых каждое слово запроса встречается в названии
    или в тексте любого сообщения. Порядок — как в list_chats (свежие сверху)."""
    words = _fold(q).split()
    if not words:
        raise HTTPException(422, "Empty search query")

    chats = (
        db.query(Chat)
        .filter(Chat.user_id == user.id)
        .options(selectinload(Chat.messages))
        .order_by(Chat.created_at.desc(), Chat.id.desc())
        .all()
    )

    def matches(chat: Chat) -> bool:
        haystack = _fold("\n".join([chat.title, *(m.content for m in chat.messages)]))
        return all(word in haystack for word in words)

    # lazy: фильтр в Python — при тысячах чатов на пользователя перейти на SQL LIKE / FTS5
    return [chat for chat in chats if matches(chat)]


@router.post("/chats", response_model=ChatOut, status_code=status.HTTP_201_CREATED)
def create_chat(
    payload: ChatIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chat = Chat(title=(payload.title or "Новый чат").strip(), user_id=user.id)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.delete("/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chat = get_own_chat(chat_id, user, db)
    db.delete(chat)  # сообщения удаляются каскадом (см. Chat.messages)
    db.commit()


@router.get("/chats/{chat_id}/messages", response_model=list[MessageOut])
def list_messages(
    chat_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chat = get_own_chat(chat_id, user, db)
    return (
        db.query(Message)
        .filter(Message.chat_id == chat.id)
        .order_by(Message.created_at.asc())
        .all()
    )


@router.post("/chats/{chat_id}/messages")
def send_message(
    chat_id: int,
    payload: MessageIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chat = get_own_chat(chat_id, user, db)
    ensure_within_limit(db, user)  # до сохранения: отклонённое сообщение не попадает в историю

    # Сообщение пользователя сохраняем сразу (до начала стрима).
    db.add(Message(chat_id=chat.id, role="user", content=payload.content))
    # Название по умолчанию — отрывок первого сообщения.
    if chat.title == "Новый чат":
        chat.title = payload.content[:50]
    db.commit()

    # Контекст = вся история чата вместе с только что добавленным сообщением.
    history = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message)
        .filter(Message.chat_id == chat.id)
        .order_by(Message.created_at.asc())
        .all()
    ]
    model = payload.model or settings.openrouter_model

    return StreamingResponse(
        stream_assistant_reply(history, model, chat.id, user.id),
        media_type="text/event-stream",
    )


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