# Лимит токенов на пользователя

**Дата**: 2026-09-16
**Статус**: принят

## Контекст

Каждый пользователь может тратить токены LLM без ограничений. Нужен лимит на
пользователя: понятный, настраиваемый через env, с автоматическим сбросом и
понятной ошибкой на фронте. Тестовые значения маленькие — лимит должен ловиться
за 2-3 промпта.

## Решение

Журнал расходов + мягкая проверка до запроса к модели в фиксированном окне
(ADR-0005). Отвергнуты: агрегированный счётчик на окно (теряет детали, upsert
различается в SQLite/Postgres) и жёсткий лимит с резервированием через
`tiktoken` (новая зависимость, неточен для не-OpenAI моделей, на маленьких
лимитах обрывает ответы).

### Конфиг

`api/app/config.py` (`Settings`) и `api/.env.example`:

| Переменная | Дефолт | Смысл |
|---|---|---|
| `TOKEN_LIMIT` | `1000` | токенов на пользователя за окно |
| `TOKEN_LIMIT_PERIOD_MINUTES` | `1440` | длина окна в минутах |
| `TOKEN_ESTIMATE_CHARS_PER_TOKEN` | `4` | оценка, если провайдер не вернул `usage` |

Окна выровнены по Unix-эпохе (UTC): `start = floor(now / period) * period`,
`resets_at = start + period`. При `1440` сброс в 00:00 UTC, при `60` — в начале
каждого часа, при `2` — каждые 2 минуты (удобно для ручной проверки).

### Данные

Модель `TokenUsage` (`api/app/models.py`), таблица `token_usage` — одна строка на
каждый успешно завершённый ответ ассистента:

| Поле | Тип |
|---|---|
| `id` | PK |
| `user_id` | FK `users.id`, `ondelete=CASCADE` |
| `model` | `String(128)` |
| `prompt_tokens`, `completion_tokens`, `total_tokens` | `int` |
| `created_at` | `DateTime(timezone=True)`, `default=utcnow` |

Составной индекс `(user_id, created_at)`. Таблицу создаёт `create_all`, миграций
нет.

### Модуль `api/app/limits/`

- `window.py` — `current_window(now: datetime, period: timedelta) -> tuple[datetime, datetime]`
  (`start`, `resets_at`). Чистая функция: без БД и `settings`.
- `counting.py` — `TokenCount(prompt, completion, total)` и
  `count_tokens(usage, history, reply, chars_per_token) -> TokenCount`. Есть `usage`
  провайдера — берём его цифры; нет — `prompt = символы истории // chars_per_token`,
  `completion = символы ответа // chars_per_token`, `total = prompt + completion`.
- `service.py`:
  - `limit_for(user) -> int` — единственная точка расширения (тарифы, оверрайды);
    сейчас возвращает `settings.token_limit`.
  - `UsageStatus(limit, used, remaining, resets_at)`; `remaining = max(limit - used, 0)`.
  - `get_usage(db, user) -> UsageStatus` — `SUM(total_tokens)` с `start` текущего окна.
  - `ensure_within_limit(db, user)` — `used >= limit` → `TokenLimitExceeded(status)`.
  - `record_usage(db, user_id, model, count)` — добавляет строку, коммит на вызывающем.
- `TokenLimitExceeded` — доменное исключение без зависимости от FastAPI; в
  `main.py` его обработчик отвечает 429 (см. «API»).

### Встраивание в отправку сообщения

`send_message` (`api/app/routers/chat.py`):

1. `get_own_chat` → `ensure_within_limit` → только затем сохранение сообщения
   пользователя. При 429 в истории ничего не появляется.
2. Запрос к модели с `stream_options={"include_usage": True}`; `usage` берётся из
   последнего чанка, где он не `None`.
3. После успешного стрима ассистентское сообщение и `record_usage` сохраняются в
   одной транзакции. Стрим упал (`event: error`) — расход не пишется.

Осознанные упрощения, помечаются в коде `lazy:`-комментарием:

- проверка до запроса, поэтому последний ответ может перебрать лимит;
- гонка: два одновременных запроса могут оба пройти проверку.

Лечится резервированием токенов, если понадобится жёсткая граница.

### API

`GET /api/usage` (`api/app/routers/usage.py`, требует токен) → `200`:

```json
{ "limit": 1000, "used": 612, "remaining": 388, "resets_at": "2026-09-17T00:00:00Z" }
```

`POST /api/chats/{id}/messages` при исчерпании → `429`, заголовок `Retry-After`
(секунды до `resets_at`, округление вверх):

```json
{ "detail": "Лимит токенов исчерпан", "code": "token_limit_exceeded",
  "limit": 1000, "used": 1180, "remaining": 0, "resets_at": "2026-09-17T00:00:00Z" }
```

`detail` остаётся строкой — существующий разбор ошибок на фронте не ломается.
`resets_at` в UTC; локальное время форматирует фронт.

### Фронтенд

- `front/src/api.ts`: тип `Usage`, `api.getUsage()`, класс
  `TokenLimitError extends Error` с полем `usage: Usage`. `sendMessage` бросает его
  на `429` с `code === 'token_limit_exceeded'`; остальные не-2xx — как раньше
  (`Error(detail)`).
- `front/src/composables/useTokenUsage.ts`: `usage`, `refresh()`, `exhausted`
  (computed, `remaining === 0`), `resetsAtLabel` («03:00», если сброс сегодня по
  локальному времени, иначе «17 сент., 03:00»). Таймер до `resets_at` делает
  `refresh()`, чтобы ввод разблокировался без перезагрузки; таймер сбрасывается при
  каждом новом `usage` и на unmount.
- `useConversation`: в `finally` рядом с `refreshChats()` — `refreshUsage()`. На
  `TokenLimitError` — `setUsage(err.usage)`, `error` не заполняется: исчерпание
  показывает отдельный блок, а не красный баннер.
- `ChatWindow.vue`: новый проп `usage`. Под полем ввода — «Осталось 388 из 1000
  токенов · сброс в 03:00». При `exhausted` вместо неё блок «Лимит токенов исчерпан.
  Новые сообщения можно отправить после 03:00», поле ввода и кнопка отправки
  заблокированы.
- `useTokenUsage` создаётся в `ChatView.vue` и передаётся в `useConversation` и
  `ChatWindow`, как остальные зависимости.

## Критерии приёмки

1. Лимит, длина окна и коэффициент оценки задаются через env; дефолты — `1000`,
   `1440`, `4`.
2. Каждый успешный ответ ассистента пишет в журнал `usage` провайдера, а без него —
   оценку.
3. В текущем окне считаются только расходы с его начала; после `resets_at` лимит
   снова полный.
4. Лимит у каждого пользователя свой.
5. При `used >= limit` отправка отвечает `429` с `code`, `resets_at` и
   `Retry-After`; сообщение пользователя не сохраняется, запрос к модели не идёт.
6. Упавший стрим не списывает токены.
7. `GET /api/usage` возвращает статус текущего пользователя; без токена — `401`.
8. Фронт показывает остаток и время сброса, обновляет их после каждого ответа.
9. При исчерпании фронт показывает понятный блок с временем сброса и блокирует
   ввод; после `resets_at` ввод разблокируется сам.

## Тестирование

TDD, одно поведение на цикл.

- pytest `api/tests/test_limits_window.py`: окно 1440 → начало в полночь UTC,
  `resets_at` — следующая полночь; окно 60 → граница часа; момент ровно на
  границе открывает новое окно.
- pytest `api/tests/test_limits_counting.py`: цифры из `usage`; оценка без `usage`.
- pytest `api/tests/test_token_limit.py`: сумма только текущего окна; лимит на
  пользователя; `remaining` не ниже 0; запись расхода из `usage` последнего чанка
  (провайдер подменяется через `monkeypatch`); `429` + `code` + `resets_at` +
  `Retry-After`, сообщение не сохранено; упавший стрим не пишет расход;
  `GET /api/usage` — статус и `401`.
- vitest `api.test.ts`: `429` с `code` → `TokenLimitError` с `usage`; прочие не-2xx →
  `Error`; `getUsage`.
- vitest `useTokenUsage.test.ts`: `exhausted`; `resetsAtLabel` сегодня / другой
  день; авто-`refresh` по таймеру на фейковых часах.
- vitest `useConversation.test.ts`: `refreshUsage` после ответа; `TokenLimitError` →
  `usage` обновлён, `error` пуст.
- e2e: стаб (`e2e/fake_openrouter.py`) последним чанком отдаёт `usage` с
  `total_tokens: 300`; `playwright.config.ts` явно задаёт `TOKEN_LIMIT=1000`.
  Существующие спеки шлют ≤ 3 сообщений на пользователя (900) и лимит не ловят.
  Новый `e2e/tests/limit.spec.ts`: после первого ответа «Осталось 700 из 1000»;
  после четвёртого (1200) — блок «Лимит токенов исчерпан…», ввод заблокирован.

## Документация

- `CONTEXT.md`: термин «Лимит токенов» — фиксированное окно, токены всей истории
  чата плюс ответа.
- `README.md`: `GET /api/usage`, `429` на отправке, переменные env.
- `docs/adr/0005-soft-token-limit-fixed-window.md`: журнал, проверка до запроса,
  риск перебора и гонки.

## Вне scope

Индивидуальные лимиты и тарифы (есть точка расширения `limit_for`), жёсткий лимит
с резервированием, лимиты по моделям, админка/ручной сброс, миграции схемы,
счётчик токенов по мере стрима на фронте.
