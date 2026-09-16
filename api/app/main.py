import math
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.limits.service import TokenLimitExceeded
from app.models import utcnow
from app.routers import auth, chat, usage
from app.schemas import UsageOut

# Простая инициализация схемы (v1 без Alembic).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Chat", version="0.1.0")


@app.exception_handler(TokenLimitExceeded)
def token_limit_exceeded(_request: Request, exc: TokenLimitExceeded) -> JSONResponse:
    retry_after = math.ceil((exc.status.resets_at - utcnow()).total_seconds())
    return JSONResponse(
        status_code=429,
        content={
            "detail": str(exc),
            "code": "token_limit_exceeded",
            **UsageOut.model_validate(exc.status).model_dump(mode="json"),
        },
        headers={"Retry-After": str(max(retry_after, 0))},
    )


app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(usage.router)

# После `npm run build` во front/ — FastAPI отдаёт собранный SPA.
# В dev фронт ходит через Vite-прокси (см. front/vite.config.ts).
front_dist = Path(__file__).resolve().parents[2] / "front" / "dist"
if front_dist.is_dir():
    app.mount("/", StaticFiles(directory=front_dist, html=True), name="front")