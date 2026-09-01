from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import auth, chat

# Простая инициализация схемы (v1 без Alembic).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Chat", version="0.1.0")

app.include_router(auth.router)
app.include_router(chat.router)

# После `npm run build` во front/ — FastAPI отдаёт собранный SPA.
# В dev фронт ходит через Vite-прокси (см. front/vite.config.ts).
front_dist = Path(__file__).resolve().parents[2] / "front" / "dist"
if front_dist.is_dir():
    app.mount("/", StaticFiles(directory=front_dist, html=True), name="front")