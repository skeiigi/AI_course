"""Таблицы базы данных.

Три таблицы: активности, расписания и брони.
Слоты не хранятся, они вычисляются на лету, смотри docs/adr/0002.
"""

from datetime import UTC, datetime, time
from datetime import date as date_type

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Статусы брони. Держим их строками, чтобы значение было видно прямо в базе.
STATUS_ACTIVE = "active"
STATUS_CANCELLED = "cancelled"


def now_utc() -> datetime:
    """Текущее время в UTC.

    SQLite не умеет хранить часовой пояс, поэтому сдвиг убираем сразу.
    Так время, записанное в базу, и время, прочитанное из неё, выглядят одинаково.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def weekdays_to_text(weekdays: list[int]) -> str:
    """Превращает список дней недели в строку для хранения: [1, 3, 5] в "1,3,5"."""
    return ",".join(str(day) for day in sorted(set(weekdays)))


def weekdays_from_text(value: str) -> list[int]:
    """Обратное превращение: "1,3,5" в [1, 3, 5]."""
    if not value:
        return []
    return [int(part) for part in value.split(",")]


class Activity(Base):
    """Вид активности: то, на что записывается гость."""

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    # Цвет карточки в интерфейсе, шестнадцатеричный код вида #3b5bdb.
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#3b5bdb")

    schedules: Mapped[list["Schedule"]] = relationship(
        back_populates="activity",
        cascade="all, delete-orphan",
    )


class Schedule(Base):
    """Расписание: в какие дни недели и часы доступна активность."""

    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Дни недели храним строкой вида "1,2,3,4,5". 1 это понедельник, 7 это воскресенье.
    weekdays: Mapped[str] = mapped_column(String(20), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    step_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    activity: Mapped["Activity"] = relationship(back_populates="schedules")


class Booking(Base):
    """Бронь гостя на конкретный слот."""

    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    guest_name: Mapped[str] = mapped_column(String(100), nullable=False)
    guest_email: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=STATUS_ACTIVE)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=now_utc)

    # Второй рубеж защиты от двойного бронирования.
    # Уникальный индекс не даёт создать две действующие брони на один и тот же слот.
    # Отменённые брони под условие не попадают, поэтому слот можно забронировать заново.
    activity: Mapped["Activity"] = relationship()

    __table_args__ = (
        Index(
            "uq_active_booking",
            "activity_id",
            "date",
            "start_time",
            unique=True,
            sqlite_where=text("status = 'active'"),
        ),
    )
