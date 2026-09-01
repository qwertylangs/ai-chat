# SQLite сейчас, Postgres позже

v1 хранит данные в SQLite через SQLAlchemy 2.0 ORM; переход на Postgres — это
смена `DATABASE_URL` (например `postgresql+psycopg://user:pass@localhost/ai_chat`)
и добавление миграций (Alembic). Провайдер-специфичного кода в модели данных нет.

**Considered Options**:
- **Сразу Postgres (docker)** — отклонён: для учебной v1 это лишний рантайм;
  объём данных и конкурентность не требуют полноценной СУБД.
- **Провайдер-специфичный доступ** (голые sqlite-драйверы) — отклонён: залочил бы
  хранилище и сделал бы переход на Postgres переписыванием.

**Consequences**:
- Фронт и рутеры работают только через ORM; JSON-поля и провайдер-специфичный SQL
  не используем.
- SQLite-специфика ограничена `connect_args={"check_same_thread": False}` в
  `app/database.py` — единственное место, которое поменяется при переезде.
- Понадобится ввести Alembic, когда появится Postgres (сейчас схема создаётся
  `Base.metadata.create_all` при старте).