from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.limits.service import get_usage
from app.models import User
from app.schemas import UsageOut

router = APIRouter(prefix="/api", tags=["usage"])


@router.get("/usage", response_model=UsageOut)
def read_usage(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_usage(db, user)
