"""Наполняет базу демонстрационными данными.

Запуск из корня проекта:
    python seed.py

Скрипт добавляет три активности и расписания к ним, чтобы интерфейс
не был пустым при первом запуске. Если активности уже есть, скрипт ничего не делает.
"""

from datetime import time

from sqlalchemy import select

from app import models
from app.database import SessionLocal, create_tables

# Дни недели: 1 это понедельник, 7 это воскресенье.
BUDNI = [1, 2, 3, 4, 5]
VTORNIK_I_CHETVERG = [2, 4]
PONEDELNIK_SREDA_PYATNITSA = [1, 3, 5]
SUBBOTA = [6]

DEMO_DATA = [
    {
        "name": "Консультация по проекту",
        "duration_minutes": 30,
        "description": "Короткий разбор задачи и ответы на вопросы.",
        "color": "#3b5bdb",
        "weekdays": BUDNI,
        "start_time": time(10, 0),
        "end_time": time(13, 0),
        "step_minutes": 30,
    },
    {
        "name": "Код-ревью",
        "duration_minutes": 45,
        "description": "Совместный разбор кода: читаем, обсуждаем, правим.",
        "color": "#0f766e",
        "weekdays": VTORNIK_I_CHETVERG,
        "start_time": time(14, 0),
        "end_time": time(18, 0),
        "step_minutes": 60,
    },
    {
        "name": "Пробное собеседование",
        "duration_minutes": 60,
        "description": "Разбор резюме и вопросы, которые задают на реальном найме.",
        "color": "#9333ea",
        "weekdays": PONEDELNIK_SREDA_PYATNITSA,
        "start_time": time(18, 0),
        "end_time": time(21, 0),
        "step_minutes": 60,
    },
    {
        "name": "Защита итогового проекта",
        "duration_minutes": 60,
        "description": "Показ работающего сервиса и ответы на вопросы комиссии.",
        "color": "#b45309",
        "weekdays": SUBBOTA,
        "start_time": time(11, 0),
        "end_time": time(16, 0),
        "step_minutes": 60,
    },
]


def seed() -> None:
    """Создаёт таблицы и добавляет демонстрационные данные."""
    create_tables()
    session = SessionLocal()
    try:
        if session.scalar(select(models.Activity)) is not None:
            print("В базе уже есть активности, ничего не добавляю.")
            return

        for item in DEMO_DATA:
            activity = models.Activity(
                name=item["name"],
                duration_minutes=item["duration_minutes"],
                description=item["description"],
                color=item["color"],
            )
            session.add(activity)
            session.flush()  # нужен, чтобы у активности появился идентификатор

            schedule = models.Schedule(
                activity_id=activity.id,
                weekdays=models.weekdays_to_text(item["weekdays"]),
                start_time=item["start_time"],
                end_time=item["end_time"],
                step_minutes=item["step_minutes"],
            )
            session.add(schedule)
            print(f"Добавлена активность: {activity.name}")

        session.commit()
        print("Готово. Запустите сервер: uvicorn app.main:app --reload")
    finally:
        session.close()


if __name__ == "__main__":
    seed()
