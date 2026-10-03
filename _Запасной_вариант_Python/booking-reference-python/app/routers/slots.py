"""Эндпоинт со свободными и занятыми слотами."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import errors, models, schemas, slot_engine
from app.database import get_session

router = APIRouter(prefix="/api/slots", tags=["slots"])


@router.get(
    "",
    response_model=list[schemas.Slot],
    summary="Слоты активности на диапазон дат",
    responses=schemas.ERROR_RESPONSES,
)
def list_slots(
    activity_id: int = Query(description="Активность, слоты которой нужны"),
    date_from: str = Query(
        pattern=schemas.DATE_PATTERN,
        description="Первый день диапазона, формат ГГГГ-ММ-ДД",
    ),
    date_to: str = Query(
        pattern=schemas.DATE_PATTERN,
        description="Последний день диапазона, формат ГГГГ-ММ-ДД",
    ),
    session: Session = Depends(get_session),
) -> list[schemas.Slot]:
    """Считает слоты активности и помечает занятые."""
    first_day = schemas.text_to_date(date_from)
    last_day = schemas.text_to_date(date_to)

    if first_day > last_day:
        raise errors.invalid_date_range("Начало диапазона должно быть не позже его конца")

    days = (last_day - first_day).days + 1
    if days > slot_engine.MAX_RANGE_DAYS:
        raise errors.invalid_date_range(
            f"Диапазон длиннее {slot_engine.MAX_RANGE_DAYS} дней запрашивать нельзя"
        )

    activity = session.get(models.Activity, activity_id)
    if activity is None:
        raise errors.activity_not_found()

    schedules = list(
        session.scalars(
            select(models.Schedule)
            .where(models.Schedule.activity_id == activity_id)
            .order_by(models.Schedule.id)
        ).all()
    )
    bookings = list(
        session.scalars(
            select(models.Booking).where(
                models.Booking.activity_id == activity_id,
                models.Booking.status == models.STATUS_ACTIVE,
                models.Booking.date >= first_day,
                models.Booking.date <= last_day,
            )
        ).all()
    )

    return slot_engine.build_slots(activity, schedules, bookings, first_day, last_day)
