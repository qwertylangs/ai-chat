from datetime import datetime

from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


class ChatIn(BaseModel):
    title: str | None = None


class ChatOut(BaseModel):
    id: int
    title: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
    model: str | None = None  # пусто → модель из .env (OPENROUTER_MODEL)


class MessageOut(BaseModel):
    id: int
    chat_id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageOut(BaseModel):
    limit: int
    used: int
    remaining: int
    resets_at: datetime

    model_config = {"from_attributes": True}