"""Эндпоинты для броней.

Самое важное здесь: защита от двойного бронирования одного слота.
Она сделана в два рубежа, подробности в docs/adr/0003.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import errors, models, schemas, slot_engine
from app.database import get_session

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


@router.get(
    "",
    response_model=list[schemas.Booking],
    summary="Список броней",
    responses=schemas.ERROR_RESPONSES,
)
def list_bookings(
    guest_email: str | None = Query(default=None, description="Показать брони только этого гостя"),
    session: Session = Depends(get_session),
) -> list[schemas.Booking]:
    """Отдаёт брони, новые сверху. Если передана почта, отдаёт только брони этого гостя."""
    query = select(models.Booking).order_by(models.Booking.id.desc())
    if guest_email is not None:
        query = query.where(models.Booking.guest_email == guest_email)
    rows = session.scalars(query).all()
    return [schemas.Booking.from_row(row, row.activity.name) for row in rows]


@router.post(
    "",
    response_model=schemas.Booking,
    status_code=status.HTTP_201_CREATED,
    summary="Создать бронь на свободный слот",
    responses=schemas.ERROR_RESPONSES,
)
def create_booking(
    payload: schemas.BookingCreate,
    session: Session = Depends(get_session),
) -> schemas.Booking:
    """Создаёт бронь, если такой слот есть в расписании и он свободен."""
    activity = session.get(models.Activity, payload.activity_id)
    if activity is None:
        raise errors.activity_not_found()

    day = schemas.text_to_date(payload.date)
    wanted_start = schemas.text_to_time(payload.start_time)

    schedules = list(
        session.scalars(
            select(models.Schedule)
            .where(models.Schedule.activity_id == activity.id)
            .order_by(models.Schedule.id)
        ).all()
    )
    slot = slot_engine.find_slot(activity, schedules, day, wanted_start)
    if slot is None:
        raise errors.slot_not_found()

    # Первый рубеж защиты: смотрим, нет ли уже действующей брони на этот слот.
    if _find_active_booking(session, activity.id, day, wanted_start) is not None:
        raise errors.slot_taken()

    booking = models.Booking(
        activity_id=activity.id,
        date=day,
        start_time=schemas.text_to_time(slot.start_time),
        end_time=schemas.text_to_time(slot.end_time),
        guest_name=payload.guest_name,
        guest_email=str(payload.guest_email),
        status=models.STATUS_ACTIVE,
    )
    session.add(booking)

    # Второй рубеж защиты: уникальный индекс в базе.
    # Он спасает, если два запроса пришли одновременно и оба прошли первую проверку.
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise errors.slot_taken() from None

    return schemas.Booking.from_row(booking, activity.name)


@router.post(
    "/{booking_id}/cancel",
    response_model=schemas.Booking,
    summary="Отменить бронь",
    responses=schemas.ERROR_RESPONSES,
)
def cancel_booking(
    booking_id: int,
    session: Session = Depends(get_session),
) -> schemas.Booking:
    """Переводит бронь в статус «отменена». Слот после этого снова свободен."""
    booking = session.get(models.Booking, booking_id)
    if booking is None:
        raise errors.booking_not_found()

    if booking.status == models.STATUS_CANCELLED:
        raise errors.booking_already_cancelled()

    booking.status = models.STATUS_CANCELLED
    session.commit()
    return schemas.Booking.from_row(booking, booking.activity.name)


def _find_active_booking(
    session: Session,
    activity_id: int,
    day,
    start_time,
) -> models.Booking | None:
    """Ищет действующую бронь на тот же слот. Отменённые брони не мешают."""
    return session.scalar(
        select(models.Booking).where(
            models.Booking.activity_id == activity_id,
            models.Booking.date == day,
            models.Booking.start_time == start_time,
            models.Booking.status == models.STATUS_ACTIVE,
        )
    )
