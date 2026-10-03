"""Схемы Pydantic: то, что сервис принимает и отдаёт по HTTP.

Каждая схема повторяет модель из contract/main.tsp.
Если меняете контракт, поменяйте и схему, иначе тест test_contract.py упадёт.

Ограничения и тексты сообщений совпадают со схемами Zod эталонного проекта
на TypeScript (server/src/schemas.ts). Дата и время принимаются строками
строгого формата, а не объектами datetime: иначе Pydantic принял бы «10:30»,
«10:30:00+03:00» и «10:30:00.5», которых контракт не допускает.
"""

from datetime import date as date_type
from datetime import datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer

from app import models
from app.errors import ErrorCode

# «ГГГГ-ММ-ДД», например 2026-10-05.
DATE_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$"

# «ЧЧ:ММ:СС», например 10:30:00. Такой формат даёт plainTime в контракте.
TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$"

# Шестнадцатеричный цвет вида #3b5bdb.
COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"

DateString = Annotated[str, Field(pattern=DATE_PATTERN)]
TimeString = Annotated[str, Field(pattern=TIME_PATTERN)]

# День недели: 1 это понедельник, 7 это воскресенье.
Weekday = Annotated[int, Field(ge=1, le=7)]


def date_to_text(value: date_type) -> str:
    """Дата из базы в строку контракта."""
    return value.isoformat()


def time_to_text(value: time) -> str:
    """Время из базы в строку «ЧЧ:ММ:СС»."""
    return value.strftime("%H:%M:%S")


def text_to_date(value: str) -> date_type:
    """Строка контракта в дату для базы и расчётов."""
    return date_type.fromisoformat(value)


def text_to_time(value: str) -> time:
    """Строка «ЧЧ:ММ:СС» во время для базы и расчётов."""
    return time.fromisoformat(value)


class ErrorBody(BaseModel):
    """Тело ответа при ошибке. Совпадает с моделью ErrorBody из контракта."""

    code: ErrorCode
    message: str


# Описание ответов с ошибкой. Подставляется в роуты, чтобы ErrorBody
# попал в документацию и совпал с контрактом.
ERROR_RESPONSES = {
    404: {"model": ErrorBody, "description": "Объект не найден"},
    409: {"model": ErrorBody, "description": "Слот занят или бронь уже отменена"},
    422: {"model": ErrorBody, "description": "Данные не прошли проверку"},
}


class ActivityCreate(BaseModel):
    """Данные для создания активности."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(ge=5, le=480, strict=True)
    description: str = Field(default="", max_length=500)
    color: str = Field(default="#3b5bdb", pattern=COLOR_PATTERN)


class Activity(BaseModel):
    """Вид активности: то, на что записывается гость."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(ge=5, le=480)
    description: str = Field(max_length=500)
    color: str = Field(pattern=COLOR_PATTERN)


class ScheduleCreate(BaseModel):
    """Данные для создания расписания."""

    activity_id: int = Field(strict=True)
    weekdays: list[Weekday] = Field(min_length=1, max_length=7)
    start_time: TimeString
    end_time: TimeString
    step_minutes: int = Field(ge=5, le=480, strict=True)


class Schedule(BaseModel):
    """Расписание: в какие дни и часы доступна активность."""

    id: int
    activity_id: int
    weekdays: list[Weekday] = Field(min_length=1, max_length=7)
    start_time: TimeString
    end_time: TimeString
    step_minutes: int

    @classmethod
    def from_row(cls, row: models.Schedule) -> "Schedule":
        """Собирает схему из строки таблицы.

        В базе дни недели лежат строкой "1,2,3", а наружу отдаются списком [1, 2, 3].
        """
        return cls(
            id=row.id,
            activity_id=row.activity_id,
            weekdays=models.weekdays_from_text(row.weekdays),
            start_time=time_to_text(row.start_time),
            end_time=time_to_text(row.end_time),
            step_minutes=row.step_minutes,
        )


class Slot(BaseModel):
    """Тайм-слот. В базе не хранится, вычисляется из расписания на дату."""

    activity_id: int
    schedule_id: int
    date: DateString
    start_time: TimeString
    end_time: TimeString
    is_free: bool


class BookingCreate(BaseModel):
    """Данные для создания брони."""

    model_config = ConfigDict(str_strip_whitespace=True)

    activity_id: int = Field(strict=True)
    date: DateString
    start_time: TimeString
    guest_name: str = Field(min_length=1, max_length=100)
    guest_email: EmailStr


class Booking(BaseModel):
    """Бронь гостя на конкретный слот."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    activity_id: int
    activity_name: str
    date: DateString
    start_time: TimeString
    end_time: TimeString
    guest_name: str = Field(min_length=1, max_length=100)
    guest_email: EmailStr
    status: Literal["active", "cancelled"]
    created_at: datetime

    @field_serializer("created_at")
    def serialize_created_at(self, value: datetime) -> str:
        """Момент создания в UTC, формат ISO с буквой Z, как в эталоне."""
        return value.isoformat(timespec="milliseconds") + "Z"

    @classmethod
    def from_row(cls, row: models.Booking, activity_name: str) -> "Booking":
        """Собирает схему из строки таблицы и названия активности."""
        return cls(
            id=row.id,
            activity_id=row.activity_id,
            activity_name=activity_name,
            date=date_to_text(row.date),
            start_time=time_to_text(row.start_time),
            end_time=time_to_text(row.end_time),
            guest_name=row.guest_name,
            guest_email=row.guest_email,
            status=row.status,
            created_at=row.created_at,
        )
