"""Тесты эндпоинтов видов активности."""


def test_activity_list_is_empty_at_start(client) -> None:
    response = client.get("/api/activities")

    assert response.status_code == 200
    assert response.json() == []


def test_activity_is_created_and_appears_in_list(client) -> None:
    created = client.post(
        "/api/activities",
        json={"name": "Демонстрация", "duration_minutes": 60, "description": "Показ проекта"},
    )

    assert created.status_code == 201
    body = created.json()
    assert body["id"] > 0
    assert body["name"] == "Демонстрация"
    assert body["duration_minutes"] == 60

    listed = client.get("/api/activities").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


def test_activity_with_too_short_duration_is_rejected(client) -> None:
    response = client.post(
        "/api/activities",
        json={"name": "Слишком короткая", "duration_minutes": 1},
    )

    assert response.status_code == 422


def test_activity_without_name_is_rejected(client) -> None:
    response = client.post("/api/activities", json={"duration_minutes": 30})

    assert response.status_code == 422


def test_activity_has_default_color(client) -> None:
    """Цвет необязателен при создании и получает значение по умолчанию."""
    body = client.post(
        "/api/activities",
        json={"name": "Без цвета", "duration_minutes": 30},
    ).json()

    assert body["color"] == "#3b5bdb"


def test_activity_color_is_kept(client) -> None:
    body = client.post(
        "/api/activities",
        json={"name": "С цветом", "duration_minutes": 30, "color": "#ff8800"},
    ).json()

    assert body["color"] == "#ff8800"
    assert client.get("/api/activities").json()[0]["color"] == "#ff8800"


def test_activity_with_broken_color_is_rejected(client) -> None:
    response = client.post(
        "/api/activities",
        json={"name": "Кривой цвет", "duration_minutes": 30, "color": "красный"},
    )

    assert response.status_code == 422
    assert response.json()["message"] == "color: Цвет задаётся кодом вида #3b5bdb"


def test_activity_name_is_trimmed(client) -> None:
    """Пробелы по краям обрезаются, строка из одних пробелов не проходит."""
    body = client.post(
        "/api/activities",
        json={"name": "  Консультация  ", "duration_minutes": 30},
    ).json()
    assert body["name"] == "Консультация"

    response = client.post("/api/activities", json={"name": "   ", "duration_minutes": 30})
    assert response.status_code == 422


def test_duration_as_string_is_rejected(client) -> None:
    """Длительность это число, а не строка: строгая проверка, как в эталоне."""
    response = client.post(
        "/api/activities",
        json={"name": "Строкой", "duration_minutes": "30"},
    )

    assert response.status_code == 422
    expected = "duration_minutes: Длительность указывается целым числом минут"
    assert response.json()["message"] == expected
