"""Вычисление тайм-слотов из расписаний.

Слоты нигде не хранятся. Каждый раз, когда их просят, мы считаем их заново
из расписаний активности. Почему так, написано в docs/adr/0002.

Все функции этого файла чистые: они принимают данные и возвращают данные,
в базу не ходят. Поэтому их легко проверять тестами.
"""

from collections.abc import Iterator
from datetime import date as date_type
from datetime import time, timedelta

from app import models, schemas

# Ограничение на длину запрашиваемого диапазона дат.
MAX_RANGE_DAYS = 60


def time_to_minutes(value: time) -> int:
    """Переводит время в число минут от полуночи: 09:30 в 570."""
    return value.hour * 60 + value.minute


def minutes_to_time(minutes: int) -> time:
    """Обратный перевод: 570 в 09:30."""
    return time(hour=minutes // 60, minute=minutes % 60)


def each_day(date_from: date_type, date_to: date_type) -> Iterator[date_type]:
    """Перебирает даты от первой до последней включительно."""
    day = date_from
    while day <= date_to:
        yield day
        day += timedelta(days=1)


def times_for_schedule(
    schedule: models.Schedule,
    duration_minutes: int,
) -> list[tuple[time, time]]:
    """Строит сетку начал и концов слотов внутри рабочего окна расписания.

    Шаг сетки берётся из расписания, длина слота из активности.
    Слот попадает в результат только если целиком помещается в рабочее окно.
    """
    window_start = time_to_minutes(schedule.start_time)
    window_end = time_to_minutes(schedule.end_time)

    result: list[tuple[time, time]] = []
    current = window_start
    while current + duration_minutes <= window_end:
        result.append((minutes_to_time(current), minutes_to_time(current + duration_minutes)))
        current += schedule.step_minutes
    return result


def build_slots(
    activity: models.Activity,
    schedules: list[models.Schedule],
    bookings: list[models.Booking],
    date_from: date_type,
    date_to: date_type,
) -> list[schemas.Slot]:
    """Собирает все слоты активности на диапазон дат.

    Слот считается занятым, если на эту дату и это время есть действующая бронь.
    """
    # Множество занятых пар «дата и время начала». Так проверка занятости быстрая.
    busy = {(booking.date, booking.start_time) for booking in bookings}

    # Дни недели разбираются один раз на расписание, а не на каждый день диапазона.
    weekdays_by_schedule = {
        schedule.id: models.weekdays_from_text(schedule.weekdays) for schedule in schedules
    }

    slots: list[schemas.Slot] = []
    for day in each_day(date_from, date_to):
        # isoweekday даёт 1 для понедельника и 7 для воскресенья.
        weekday = day.isoweekday()
        for schedule in schedules:
            if weekday not in weekdays_by_schedule[schedule.id]:
                continue
            for start_time, end_time in times_for_schedule(schedule, activity.duration_minutes):
                slots.append(
                    schemas.Slot(
                        activity_id=activity.id,
                        schedule_id=schedule.id,
                        date=schemas.date_to_text(day),
                        start_time=schemas.time_to_text(start_time),
                        end_time=schemas.time_to_text(end_time),
                        is_free=(day, start_time) not in busy,
                    )
                )

    slots.sort(key=lambda slot: (slot.date, slot.start_time, slot.schedule_id))
    return slots


def find_slot(
    activity: models.Activity,
    schedules: list[models.Schedule],
    day: date_type,
    start_time: time,
) -> schemas.Slot | None:
    """Ищет слот с нужным началом. Возвращает None, если такого слота в сетке нет.

    Это защита от брони на произвольное время: гость не может записаться
    на 09:07, если сетка идёт с шагом 30 минут.
    """
    wanted = schemas.time_to_text(start_time)
    for slot in build_slots(activity, schedules, [], day, day):
        if slot.start_time == wanted:
            return slot
    return None
