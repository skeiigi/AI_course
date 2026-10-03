"""Подключение к базе данных SQLite.

Здесь всего три вещи: движок, фабрика сессий и базовый класс моделей.
Больше в этом файле ничего нет, чтобы его было легко прочитать целиком.
"""

import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Файл базы данных лежит в корне репозитория.
# Путь можно поменять переменной окружения BOOKING_DB_FILE, так делает docker compose.
BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_FILE = Path(os.getenv("BOOKING_DB_FILE", BASE_DIR / "booking.db"))
DATABASE_URL = f"sqlite:///{DATABASE_FILE}"

# check_same_thread=False нужен потому, что FastAPI обслуживает запросы
# в нескольких потоках, а SQLite по умолчанию это запрещает.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Базовый класс для всех таблиц проекта."""


@event.listens_for(engine, "connect")
def _enable_sqlite_checks(dbapi_connection, connection_record) -> None:
    """Включает проверку внешних ключей.

    SQLite по умолчанию не проверяет внешние ключи. Одна строка настройки
    избавляет нас от битых ссылок между таблицами.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_tables() -> None:
    """Создаёт таблицы, если их ещё нет."""
    Base.metadata.create_all(bind=engine)


def get_session() -> Iterator[Session]:
    """Отдаёт сессию базы данных одному запросу и закрывает её после ответа."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
