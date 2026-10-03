"""Тесты эндпоинтов расписаний."""


def test_schedule_is_created(client, activity_id) -> None:
    response = client.post(
        "/api/schedules",
        json={
            "activity_id": activity_id,
            "weekdays": [1, 3, 5],
            "start_time": "09:00:00",
            "end_time": "18:00:00",
            "step_minutes": 60,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["weekdays"] == [1, 3, 5]
    assert body["activity_id"] == activity_id


def test_schedule_for_unknown_activity_gives_404(client) -> None:
    response = client.post(
        "/api/schedules",
        json={
            "activity_id": 999,
            "weekdays": [1],
            "start_time": "09:00:00",
            "end_time": "18:00:00",
            "step_minutes": 60,
        },
    )

    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "activity_not_found"
    assert body["message"] == "Вид активности не найден"


def test_schedule_with_reversed_window_is_rejected(client, activity_id) -> None:
    response = client.post(
        "/api/schedules",
        json={
            "activity_id": activity_id,
            "weekdays": [1],
            "start_time": "18:00:00",
            "end_time": "09:00:00",
            "step_minutes": 60,
        },
    )

    assert response.status_code == 422


def test_schedule_with_wrong_weekday_number_is_rejected(client, activity_id) -> None:
    response = client.post(
        "/api/schedules",
        json={
            "activity_id": activity_id,
            "weekdays": [0, 8],
            "start_time": "09:00:00",
            "end_time": "18:00:00",
            "step_minutes": 60,
        },
    )

    assert response.status_code == 422


def test_schedules_can_be_filtered_by_activity(client, activity_id, schedule_id) -> None:
    other = client.post(
        "/api/activities",
        json={"name": "Другая", "duration_minutes": 30},
    ).json()
    client.post(
        "/api/schedules",
        json={
            "activity_id": other["id"],
            "weekdays": [6],
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "step_minutes": 30,
        },
    )

    filtered = client.get("/api/schedules", params={"activity_id": activity_id}).json()

    assert len(filtered) == 1
    assert filtered[0]["id"] == schedule_id
