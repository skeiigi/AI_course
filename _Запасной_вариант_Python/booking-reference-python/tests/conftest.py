"""Общие настройки тестов.

На каждый тест создаётся своя пустая база в временной папке.
Настоящая база booking.db во время тестов не трогается.
"""

from collections.abc import Iterator
from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, get_session
from app.main import app

# Понедельник. Все тесты считают слоты от этой даты, чтобы результат не зависел от «сегодня».
MONDAY = date(2026, 10, 5)
TUESDAY = date(2026, 10, 6)
SATURDAY = date(2026, 10, 10)


@pytest.fixture()
def db_session(tmp_path) -> Iterator[Session]:
    """Пустая база данных на один тест."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Iterator[TestClient]:
    """Тестовый клиент HTTP, который ходит в базу из фикстуры db_session."""

    def override_get_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def activity_id(client: TestClient) -> int:
    """Готовая активность: консультация на 30 минут."""
    response = client.post(
        "/api/activities",
        json={
            "name": "Консультация",
            "duration_minutes": 30,
            "description": "Разбор задачи со студентом",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture()
def schedule_id(client: TestClient, activity_id: int) -> int:
    """Расписание для активности: будни с 10:00 до 12:00, шаг 30 минут."""
    response = client.post(
        "/api/schedules",
        json={
            "activity_id": activity_id,
            "weekdays": [1, 2, 3, 4, 5],
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "step_minutes": 30,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def make_booking(client: TestClient, activity_id: int, start: str = "10:00:00") -> object:
    """Короткая обёртка: создаёт бронь на понедельник."""
    return client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": start,
            "guest_name": "Иван Петров",
            "guest_email": "ivan@example.com",
        },
    )


def as_time(text: str) -> time:
    """Превращает строку "10:30" во время."""
    return time.fromisoformat(text)
