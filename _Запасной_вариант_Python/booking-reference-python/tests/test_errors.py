"""Тесты формы ответа при ошибке.

Сервис всегда отвечает одним и тем же телом: {"code": ..., "message": ...}.
Клиент опирается на code, человек читает message. Набор кодов описан
в contract/main.tsp, союз ErrorCode.

Эти тесты сторожат договор с эталонным проектом на TypeScript: там ответы
ровно такие же, и раздатки курса ссылаются именно на коды.
"""

from fastapi.testclient import TestClient

from tests.conftest import MONDAY


def test_unknown_route_gives_route_not_found(client: TestClient) -> None:
    response = client.get("/api/takogo-puti-net")

    assert response.status_code == 404
    assert response.json() == {"code": "route_not_found", "message": "Такого эндпоинта нет"}


def test_validation_error_has_code_and_russian_message(client: TestClient) -> None:
    response = client.post("/api/activities", json={"name": "", "duration_minutes": 3})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_failed"
    # Сообщение собирается в одну строку, поле за полем, как в эталоне.
    assert "name: Название активности не может быть пустым" in body["message"]
    assert "duration_minutes: Длительность меньше 5 минут" in body["message"]


def test_validation_message_is_in_russian(client: TestClient) -> None:
    """Английские тексты Pydantic наружу не выходят."""
    response = client.post("/api/activities", json={"name": "Тест", "duration_minutes": 1000})

    assert response.json()["message"] == "duration_minutes: Длительность больше 480 минут"


def test_activity_not_found_code(client: TestClient) -> None:
    response = client.post(
        "/api/schedules",
        json={
            "activity_id": 999,
            "weekdays": [1],
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "step_minutes": 30,
        },
    )

    assert response.status_code == 404
    assert response.json() == {
        "code": "activity_not_found",
        "message": "Вид активности не найден",
    }


def test_invalid_time_window_code(client: TestClient, activity_id: int) -> None:
    response = client.post(
        "/api/schedules",
        json={
            "activity_id": activity_id,
            "weekdays": [1],
            "start_time": "12:00:00",
            "end_time": "10:00:00",
            "step_minutes": 30,
        },
    )

    assert response.status_code == 422
    assert response.json() == {
        "code": "invalid_time_window",
        "message": "Начало рабочего окна должно быть раньше его конца",
    }


def test_invalid_date_range_code(client: TestClient, activity_id: int, schedule_id: int) -> None:
    response = client.get(
        "/api/slots",
        params={"activity_id": activity_id, "date_from": "2026-10-06", "date_to": "2026-10-05"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "code": "invalid_date_range",
        "message": "Начало диапазона должно быть не позже его конца",
    }


def test_too_long_date_range_code(client: TestClient, activity_id: int, schedule_id: int) -> None:
    response = client.get(
        "/api/slots",
        params={"activity_id": activity_id, "date_from": "2026-10-05", "date_to": "2026-12-31"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_date_range"
    assert body["message"] == "Диапазон длиннее 60 дней запрашивать нельзя"


def test_booking_not_found_code(client: TestClient) -> None:
    response = client.post("/api/bookings/999/cancel")

    assert response.status_code == 404
    assert response.json() == {"code": "booking_not_found", "message": "Бронь не найдена"}


def test_booking_already_cancelled_code(
    client: TestClient, activity_id: int, schedule_id: int
) -> None:
    created = client.post(
        "/api/bookings",
        json={
            "activity_id": activity_id,
            "date": MONDAY.isoformat(),
            "start_time": "10:00:00",
            "guest_name": "Иван",
            "guest_email": "ivan@example.com",
        },
    )
    booking_id = created.json()["id"]
    assert client.post(f"/api/bookings/{booking_id}/cancel").status_code == 200

    repeated = client.post(f"/api/bookings/{booking_id}/cancel")

    assert repeated.status_code == 409
    assert repeated.json() == {
        "code": "booking_already_cancelled",
        "message": "Эта бронь уже отменена",
    }


def test_broken_json_gives_validation_failed(client: TestClient) -> None:
    response = client.post(
        "/api/activities",
        content="{не json",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_failed"
