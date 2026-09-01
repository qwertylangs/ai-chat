import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.deps import get_current_user, get_own_chat
from app.models import Chat, Message, User
from app.openai_client import build_openai_client
from app.schemas import ChatIn, ChatOut, MessageIn, MessageOut

router = APIRouter(prefix="/api", tags=["chat"])


@router.get("/chats", response_model=list[ChatOut])
def list_chats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(Chat)
        .filter(Chat.user_id == user.id)
        .order_by(Chat.created_at.desc())
        .all()
    )


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
        stream_assistant_reply(history, model, chat.id),
        media_type="text/event-stream",
    )


def stream_assistant_reply(history: list[dict], model: str, chat_id: int):
    """Стримит ответ OpenRouter клиенту «как есть» (SSE) и сохраняет полный ответ в БД."""
    client = build_openai_client()
    accumulated = ""

    try:
        stream = client.chat.completions.create(
            model=model, messages=history, stream=True
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                accumulated += delta
            # Прокидываем чанк наружу в исходном формате OpenAI (решение Q5a).
            yield f"data: {chunk.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as exc:
        # Ошибка (например, невалидный ключ OpenRouter) — отдаём событием SSE.
        yield f'event: error\ndata: {json.dumps({"detail": str(exc)})}\n\n'
        return

    # Ассистентское сообщение сохраняем только после успешного завершения стрима.
    if accumulated:
        with SessionLocal() as db:
            db.add(Message(chat_id=chat_id, role="assistant", content=accumulated))
            db.commit()