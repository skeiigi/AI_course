"""Тесты броней. Главное здесь: слот нельзя забронировать дважды."""

from datetime import time

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from tests.conftest import MONDAY, make_booking


def test_booking_is_created(client, activity_id, schedule_id) -> None:
    response = make_booking(client, activity_id)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "active"
    assert body["start_time"] == "10:00:00"
    assert body["end_time"] == "10:30:00"
    assert body["guest_email"] == "ivan@example.com"


def test_booked_slot_becomes_busy(client, activity_id, schedule_id) -> None:
    make_booking(client, activity_id)

    slots = client.get(
        "/api/slots",
        params={
            "activity_id": activity_id,
            "date_from": MONDAY.isoformat(),
            "date_to": MONDAY.isoformat(),
        },
    ).json()

    first = slots[0]
    assert first["start_time"] == "10:00:00"
    assert first["is_free"] is False
    assert slots[1]["is_free"] is True


def test_second_booking_of_same_slot_is_rejected(client, activity_id, schedule_id) -> None:
    first = make_booking(client, activity_id)
    assert first.status_code == 201

    second = client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": "10:00:00",
            "guest_name": "Мария Сидорова",
            "guest_email": "maria@example.com",
        },
    )

    assert second.status_code == 409
    body = second.json()
    assert body["code"] == "slot_taken"
    assert body["message"] == "Этот слот уже забронирован"


def test_neighbour_slot_stays_free(client, activity_id, schedule_id) -> None:
    make_booking(client, activity_id, start="10:00:00")

    response = make_booking(client, activity_id, start="10:30:00")

    assert response.status_code == 201


def test_booking_on_time_outside_grid_is_rejected(client, activity_id, schedule_id) -> None:
    response = make_booking(client, activity_id, start="10:07:00")

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "slot_not_found"
    assert body["message"] == "В расписании нет слота, который начинается в это время"


def test_booking_for_unknown_activity_gives_404(client) -> None:
    response = make_booking(client, activity_id=999)

    assert response.status_code == 404


def test_booking_with_broken_email_is_rejected(client, activity_id, schedule_id) -> None:
    response = client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": "10:00:00",
            "guest_name": "Иван",
            "guest_email": "не-почта",
        },
    )

    assert response.status_code == 422


def test_cancelled_booking_frees_the_slot(client, activity_id, schedule_id) -> None:
    booking_id = make_booking(client, activity_id).json()["id"]

    cancelled = client.post(f"/api/bookings/{booking_id}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    again = make_booking(client, activity_id)
    assert again.status_code == 201


def test_cancelling_twice_is_rejected(client, activity_id, schedule_id) -> None:
    booking_id = make_booking(client, activity_id).json()["id"]
    client.post(f"/api/bookings/{booking_id}/cancel")

    response = client.post(f"/api/bookings/{booking_id}/cancel")

    assert response.status_code == 409


def test_cancelling_unknown_booking_gives_404(client) -> None:
    response = client.post("/api/bookings/999/cancel")

    assert response.status_code == 404


def test_bookings_can_be_filtered_by_email(client, activity_id, schedule_id) -> None:
    make_booking(client, activity_id, start="10:00:00")
    client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": "10:30:00",
            "guest_name": "Мария Сидорова",
            "guest_email": "maria@example.com",
        },
    )

    mine = client.get("/api/bookings", params={"guest_email": "maria@example.com"}).json()

    assert len(mine) == 1
    assert mine[0]["guest_name"] == "Мария Сидорова"
    assert len(client.get("/api/bookings").json()) == 2


def test_database_index_blocks_duplicate_active_booking(
    db_session, client, activity_id, schedule_id
) -> None:
    """Проверяем второй рубеж защиты: уникальный индекс в базе."""
    make_booking(client, activity_id)

    duplicate = models.Booking(
        activity_id=activity_id,
        date=MONDAY,
        start_time=time(10, 0),
        end_time=time(10, 30),
        guest_name="Дубль",
        guest_email="dubl@example.com",
        status=models.STATUS_ACTIVE,
    )
    db_session.add(duplicate)

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_cancelled_booking_does_not_block_the_index(
    db_session, client, activity_id, schedule_id
) -> None:
    """Отменённая бронь под условие индекса не попадает, поэтому дублей не создаёт."""
    booking_id = make_booking(client, activity_id).json()["id"]
    client.post(f"/api/bookings/{booking_id}/cancel")

    second = make_booking(client, activity_id)
    assert second.status_code == 201

    all_bookings = client.get("/api/bookings").json()
    assert len(all_bookings) == 2
    assert {row["status"] for row in all_bookings} == {"active", "cancelled"}


def test_booking_carries_activity_name(client, activity_id: int, schedule_id: int) -> None:
    """Бронь отдаёт название активности, чтобы интерфейсу хватило одного запроса."""
    created = client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": "10:00:00",
            "guest_name": "Иван",
            "guest_email": "ivan@example.com",
        },
    ).json()

    assert created["activity_name"] == "Консультация"
    assert client.get("/api/bookings").json()[0]["activity_name"] == "Консультация"


def test_created_at_is_utc_with_z(client, activity_id: int, schedule_id: int) -> None:
    """Момент создания отдаётся в UTC с буквой Z, как в эталоне на TypeScript."""
    created = client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": "10:00:00",
            "guest_name": "Иван",
            "guest_email": "ivan@example.com",
        },
    ).json()

    assert created["created_at"].endswith("Z")


def test_time_without_seconds_is_rejected(client, activity_id: int, schedule_id: int) -> None:
    """Контракт требует «ЧЧ:ММ:СС». Запись «10:00» не принимается."""
    response = client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": "10:00",
            "guest_name": "Иван",
            "guest_email": "ivan@example.com",
        },
    )

    assert response.status_code == 422
    assert response.json()["message"] == "start_time: Время указывается в формате ЧЧ:ММ:СС"


def test_date_with_time_part_is_rejected(client, activity_id: int, schedule_id: int) -> None:
    """Контракт требует «ГГГГ-ММ-ДД» без времени."""
    response = client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": "2026-10-05T00:00:00",
            "start_time": "10:00:00",
            "guest_name": "Иван",
            "guest_email": "ivan@example.com",
        },
    )

    assert response.status_code == 422
    assert response.json()["message"] == "date: Дата указывается в формате ГГГГ-ММ-ДД"


def test_guest_name_of_spaces_is_rejected(client, activity_id: int, schedule_id: int) -> None:
    response = client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": "10:00:00",
            "guest_name": "   ",
            "guest_email": "ivan@example.com",
        },
    )

    assert response.status_code == 422
    assert response.json()["message"] == "guest_name: Имя гостя не может быть пустым"
