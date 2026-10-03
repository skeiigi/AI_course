"""Тесты эндпоинта слотов."""

from tests.conftest import MONDAY


def test_slots_are_returned_for_date_range(client, activity_id, schedule_id) -> None:
    response = client.get(
        "/api/slots",
        params={
            "activity_id": activity_id,
            "date_from": MONDAY.isoformat(),
            "date_to": MONDAY.isoformat(),
        },
    )

    assert response.status_code == 200
    slots = response.json()
    assert len(slots) == 4
    assert slots[0]["start_time"] == "10:00:00"
    assert slots[0]["is_free"] is True
    assert slots[0]["schedule_id"] == schedule_id


def test_slots_reject_reversed_range(client, activity_id, schedule_id) -> None:
    response = client.get(
        "/api/slots",
        params={
            "activity_id": activity_id,
            "date_from": "2026-10-10",
            "date_to": "2026-10-05",
        },
    )

    assert response.status_code == 422


def test_slots_reject_too_long_range(client, activity_id, schedule_id) -> None:
    response = client.get(
        "/api/slots",
        params={
            "activity_id": activity_id,
            "date_from": "2026-10-05",
            "date_to": "2027-10-05",
        },
    )

    assert response.status_code == 422


def test_slots_for_unknown_activity_give_404(client) -> None:
    response = client.get(
        "/api/slots",
        params={"activity_id": 999, "date_from": "2026-10-05", "date_to": "2026-10-05"},
    )

    assert response.status_code == 404
