import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth(client):
    """Регистрирует пользователя и возвращает функцию-фабрику заголовков для него."""

    def make(username: str = "alice", password: str = "password123") -> dict[str, str]:
        client.post("/auth/register", json={"username": username, "password": password})
        token = client.post(
            "/auth/login", json={"username": username, "password": password}
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return make
