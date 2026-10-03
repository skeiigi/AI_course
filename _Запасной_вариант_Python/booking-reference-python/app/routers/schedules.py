"""Эндпоинты для расписаний."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import errors, models, schemas
from app.database import get_session

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.get("", response_model=list[schemas.Schedule], summary="Список расписаний")
def list_schedules(
    activity_id: int | None = Query(default=None, description="Показать только эту активность"),
    session: Session = Depends(get_session),
) -> list[schemas.Schedule]:
    """Отдаёт расписания. Если передан activity_id, отдаёт только его расписания."""
    query = select(models.Schedule).order_by(models.Schedule.id)
    if activity_id is not None:
        query = query.where(models.Schedule.activity_id == activity_id)
    return [schemas.Schedule.from_row(row) for row in session.scalars(query).all()]


@router.post(
    "",
    response_model=schemas.Schedule,
    status_code=status.HTTP_201_CREATED,
    summary="Создать расписание для активности",
    responses=schemas.ERROR_RESPONSES,
)
def create_schedule(
    payload: schemas.ScheduleCreate,
    session: Session = Depends(get_session),
) -> schemas.Schedule:
    """Создаёт расписание. Проверяет, что активность существует и окно задано верно."""
    activity = session.get(models.Activity, payload.activity_id)
    if activity is None:
        raise errors.activity_not_found()

    if payload.start_time >= payload.end_time:
        raise errors.invalid_time_window()

    schedule = models.Schedule(
        activity_id=payload.activity_id,
        weekdays=models.weekdays_to_text(payload.weekdays),
        start_time=schemas.text_to_time(payload.start_time),
        end_time=schemas.text_to_time(payload.end_time),
        step_minutes=payload.step_minutes,
    )
    session.add(schedule)
    session.commit()
    return schemas.Schedule.from_row(schedule)
