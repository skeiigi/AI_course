"""Эндпоинты для видов активности."""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_session

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("", response_model=list[schemas.Activity], summary="Список всех видов активности")
def list_activities(session: Session = Depends(get_session)) -> list[models.Activity]:
    """Отдаёт все активности по возрастанию идентификатора."""
    rows = session.scalars(select(models.Activity).order_by(models.Activity.id)).all()
    return list(rows)


@router.post(
    "",
    response_model=schemas.Activity,
    status_code=status.HTTP_201_CREATED,
    summary="Создать новый вид активности",
)
def create_activity(
    payload: schemas.ActivityCreate,
    session: Session = Depends(get_session),
) -> models.Activity:
    """Создаёт активность и возвращает её вместе с присвоенным идентификатором."""
    activity = models.Activity(
        name=payload.name,
        duration_minutes=payload.duration_minutes,
        description=payload.description,
        color=payload.color,
    )
    session.add(activity)
    session.commit()
    return activity
