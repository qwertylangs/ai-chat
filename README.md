# AI Chat

Простой AI-чат: **FastAPI** (Python) + **Vue 3 + TypeScript** (Vite),
провайдер — **OpenRouter** через `openai` SDK, стриминг по SSE, хранение — SQLite
через SQLAlchemy (с расчётом на Postgres).

## Структура

```
ai-chat/
├── api/                        # бэкенд (uv / venv)
│   ├── pyproject.toml          # зависимости: fastapi, sqlalchemy, openai, pyjwt, pwdlib[argon2]
│   ├── .env / .env.example     # OPENROUTER_API_KEY, JWT_SECRET, DATABASE_URL
│   └── app/
│       ├── main.py             # FastAPI + раздача собранного front/dist
│       ├── config.py           # настройки из .env / переменных окружения
│       ├── database.py         # SQLAlchemy engine/session (SQLite, Postgres — сменой DATABASE_URL)
│       ├── models.py           # User, Chat, Message
│       ├── schemas.py          # Pydantic-схемы запросов/ответов
│       ├── security.py         # Argon2, JWT
│       ├── deps.py             # get_current_user, get_own_chat
│       ├── openai_client.py    # клиент OpenRouter
│       └── routers/
│           ├── auth.py         # /auth/register, /auth/login
│           └── chat.py         # /api/chats..., /api/chats/{id}/messages (SSE)
├── front/                      # фронтенд (npm)
│   ├── vite.config.ts          # proxy /api и /auth → localhost:8000
│   └── src/
│       ├── api.ts              # fetch-обёртка + парсер SSE
│       ├── App.vue             # переключение вход/чат
│       └── components/         # AuthView.vue, ChatView.vue
├── e2e/                        # Playwright: стаб OpenRouter + happy-path сценарий
├── CONTEXT.md                  # глоссарий предметной области
├── docs/adr/                   # зафиксированные решения
└── docs/superpowers/           # спеки и планы реализации фич
```

## Запуск

**Бэкенд** (порт 8000):

```bash
cd api
cp .env.example .env   # подставьте свой OPENROUTER_API_KEY
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Swagger API: http://localhost:8000/docs

**Фронтенд** (порт 5173, dev):

```bash
cd front
npm install
npm run dev
```

Откройте http://localhost:5173. В dev запросы идут на бэкенд через Vite-прокси,
CORS не нужен.

**«Prod»-режим**: `npm run build` во `front/` → бэкенд сам отдаёт `front/dist/`
(см. `app/main.py`).

## API

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/auth/register` | создать пользователя (username, password) |
| POST | `/auth/login` | получить `access_token` |
| GET | `/api/chats` | список чатов (свежие сверху) |
| POST | `/api/chats` | создать чат (title необязателен) |
| GET | `/api/chats/{id}/messages` | история сообщений чата |
| POST | `/api/chats/{id}/messages` | отправить сообщение; ответ — SSE-стрим |

Все `/api/*` требуют заголовок `Authorization: Bearer <access_token>`.
Ответ ассистента стримится «как есть» в формате чанков OpenAI (см. ADR-0001) и
сохраняется в БД целиком после завершения стрима.

## Зафиксированные решения

| Решение | Где |
|---|---|
| OpenRouter через `openai` SDK, не LangChain | `docs/adr/0001-*` |
| SQLite сейчас, Postgres — сменой `DATABASE_URL` | `docs/adr/0002-*` |
| JWT без refresh, пароли — Argon2 | `docs/adr/0003-*` |
| Кэша нет: ответы LLM кэшировать нельзя; Redis при необходимости добавится рядом с SQLAlchemy | — |
| Мок-ключ в `.env`: с ним OpenRouter отвечает 401, ошибка доходит до фронта как `event: error` | — |
| E2E идут через локальный стаб OpenRouter, а не мок в браузере | `docs/adr/0004-*` |

## E2E-тесты

```bash
cd e2e
npm install
npx playwright install chromium   # один раз
npm test
```

Playwright сам поднимает три процесса: стаб OpenRouter (8931), бэкенд на 8001 с
отдельной БД `e2e/.tmp/e2e.db` и vite dev на 5174 — dev-окружение на 8000/5173
трогать не нужно. Почему стаб, а не мок в браузере — `docs/adr/0004-*`.
