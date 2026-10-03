"""Тесты вычисления слотов. Базы данных здесь нет, только чистые функции."""

from datetime import time

from app import models, slot_engine
from tests.conftest import MONDAY, SATURDAY, TUESDAY


def make_activity(duration_minutes: int = 30) -> models.Activity:
    activity = models.Activity(name="Консультация", duration_minutes=duration_minutes)
    activity.id = 1
    return activity


def make_schedule(
    weekdays: str = "1,2,3,4,5",
    start: str = "10:00",
    end: str = "12:00",
    step: int = 30,
) -> models.Schedule:
    schedule = models.Schedule(
        activity_id=1,
        weekdays=weekdays,
        start_time=time.fromisoformat(start),
        end_time=time.fromisoformat(end),
        step_minutes=step,
    )
    schedule.id = 10
    return schedule


def test_time_converts_to_minutes_and_back() -> None:
    assert slot_engine.time_to_minutes(time(9, 30)) == 570
    assert slot_engine.minutes_to_time(570) == time(9, 30)


def test_times_for_schedule_builds_expected_grid() -> None:
    times = slot_engine.times_for_schedule(make_schedule(), duration_minutes=30)

    assert [start.isoformat() for start, _ in times] == [
        "10:00:00",
        "10:30:00",
        "11:00:00",
        "11:30:00",
    ]


def test_slot_that_does_not_fit_window_is_dropped() -> None:
    # Окно 10:00 до 12:00, длительность 45 минут, шаг 30 минут.
    # Слот в 11:30 закончился бы в 12:15, поэтому его быть не должно.
    times = slot_engine.times_for_schedule(make_schedule(), duration_minutes=45)

    assert [start.isoformat() for start, _ in times] == ["10:00:00", "10:30:00", "11:00:00"]
    assert times[-1][1] == time(11, 45)


def test_step_smaller_than_duration_gives_overlapping_grid() -> None:
    times = slot_engine.times_for_schedule(make_schedule(step=15), duration_minutes=30)

    assert len(times) == 7
    assert times[0] == (time(10, 0), time(10, 30))
    assert times[1] == (time(10, 15), time(10, 45))


def test_slots_are_built_only_for_listed_weekdays() -> None:
    slots = slot_engine.build_slots(
        make_activity(),
        [make_schedule(weekdays="1")],
        [],
        MONDAY,
        TUESDAY,
    )

    assert {slot.date for slot in slots} == {MONDAY.isoformat()}


def test_no_slots_when_weekday_is_not_in_schedule() -> None:
    slots = slot_engine.build_slots(
        make_activity(),
        [make_schedule(weekdays="1,2,3,4,5")],
        [],
        SATURDAY,
        SATURDAY,
    )

    assert slots == []


def test_booked_slot_is_marked_busy() -> None:
    booking = models.Booking(
        activity_id=1,
        date=MONDAY,
        start_time=time(10, 30),
        end_time=time(11, 0),
        guest_name="Иван",
        guest_email="ivan@example.com",
        status=models.STATUS_ACTIVE,
    )

    slots = slot_engine.build_slots(make_activity(), [make_schedule()], [booking], MONDAY, MONDAY)

    busy = [slot for slot in slots if not slot.is_free]
    assert len(busy) == 1
    assert busy[0].start_time == "10:30:00"


def test_slots_are_sorted_by_date_and_time() -> None:
    slots = slot_engine.build_slots(make_activity(), [make_schedule()], [], MONDAY, TUESDAY)

    keys = [(slot.date, slot.start_time) for slot in slots]
    assert keys == sorted(keys)


def test_slots_of_same_time_are_sorted_by_schedule() -> None:
    """Два расписания дают слот на одно время: порядок задаётся идентификатором."""
    first = make_schedule()
    first.id = 20
    second = make_schedule()
    second.id = 10

    slots = slot_engine.build_slots(make_activity(), [first, second], [], MONDAY, MONDAY)

    keys = [(slot.date, slot.start_time, slot.schedule_id) for slot in slots]
    assert keys == sorted(keys)


def test_slot_fields_are_strings_of_contract_format() -> None:
    """Контракт требует «ГГГГ-ММ-ДД» и «ЧЧ:ММ:СС», а не объекты даты и времени."""
    slot = slot_engine.build_slots(make_activity(), [make_schedule()], [], MONDAY, MONDAY)[0]

    assert slot.date == MONDAY.isoformat()
    assert slot.start_time == "10:00:00"
    assert slot.end_time == "10:30:00"


def test_find_slot_returns_none_for_time_outside_grid() -> None:
    schedules = [make_schedule()]

    assert slot_engine.find_slot(make_activity(), schedules, MONDAY, time(10, 0)) is not None
    assert slot_engine.find_slot(make_activity(), schedules, MONDAY, time(10, 7)) is None
