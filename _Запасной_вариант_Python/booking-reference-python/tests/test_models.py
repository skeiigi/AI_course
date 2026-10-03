"""Тесты моделей и вспомогательных функций работы с базой."""

from datetime import time

from app import models


def test_weekdays_to_text_sorts_and_removes_duplicates() -> None:
    assert models.weekdays_to_text([3, 1, 3, 5]) == "1,3,5"


def test_weekdays_from_text_returns_numbers() -> None:
    assert models.weekdays_from_text("1,3,5") == [1, 3, 5]


def test_weekdays_from_empty_text_returns_empty_list() -> None:
    assert models.weekdays_from_text("") == []


def test_activity_is_saved_and_read_back(db_session) -> None:
    activity = models.Activity(name="Собеседование", duration_minutes=45, description="")
    db_session.add(activity)
    db_session.commit()

    saved = db_session.get(models.Activity, activity.id)
    assert saved is not None
    assert saved.name == "Собеседование"
    assert saved.duration_minutes == 45


def test_schedule_keeps_link_to_activity(db_session) -> None:
    activity = models.Activity(name="Консультация", duration_minutes=30, description="")
    db_session.add(activity)
    db_session.commit()

    schedule = models.Schedule(
        activity_id=activity.id,
        weekdays="1,2",
        start_time=time(10, 0),
        end_time=time(12, 0),
        step_minutes=30,
    )
    db_session.add(schedule)
    db_session.commit()

    assert schedule.activity.name == "Консультация"
