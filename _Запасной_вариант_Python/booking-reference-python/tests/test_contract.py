"""Сверка кода с контрактом.

Контракт в contract/openapi.yaml собран компилятором TypeSpec из contract/main.tsp.
FastAPI отдаёт свою схему по адресу /openapi.json.
Эти тесты проверяют, что код не разошёлся с контрактом.
"""

from pathlib import Path

import pytest
import yaml

CONTRACT_PATH = Path(__file__).resolve().parent.parent / "contract" / "openapi.yaml"

# Модели, которые обязаны совпадать в контракте и в коде.
CHECKED_MODELS = [
    "Activity",
    "ActivityCreate",
    "Schedule",
    "ScheduleCreate",
    "Slot",
    "Booking",
    "BookingCreate",
    "ErrorBody",
]


@pytest.fixture(scope="module")
def contract() -> dict:
    """Читает контракт из файла openapi.yaml."""
    return yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def live_schema(client) -> dict:
    """Читает схему, которую отдаёт работающее приложение."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    return response.json()


def test_contract_file_is_present() -> None:
    assert CONTRACT_PATH.exists(), "Контракт openapi.yaml должен лежать в репозитории"


def test_contract_is_openapi_31(contract: dict) -> None:
    assert contract["openapi"].startswith("3.1")


def test_all_contract_paths_are_implemented(contract: dict, live_schema: dict) -> None:
    missing = [path for path in contract["paths"] if path not in live_schema["paths"]]

    assert missing == [], f"В коде нет путей из контракта: {missing}"


def test_all_contract_methods_are_implemented(contract: dict, live_schema: dict) -> None:
    missing: list[str] = []
    for path, operations in contract["paths"].items():
        implemented = live_schema["paths"].get(path, {})
        for method in operations:
            if method not in implemented:
                missing.append(f"{method.upper()} {path}")

    assert missing == [], f"В коде нет операций из контракта: {missing}"


@pytest.mark.parametrize("model_name", CHECKED_MODELS)
def test_model_is_present_in_code(model_name: str, contract: dict, live_schema: dict) -> None:
    assert model_name in contract["components"]["schemas"]
    assert (
        model_name in live_schema["components"]["schemas"]
    ), f"Модель {model_name} описана в контракте, но её нет в коде"


@pytest.mark.parametrize("model_name", CHECKED_MODELS)
def test_model_fields_match_contract(model_name: str, contract: dict, live_schema: dict) -> None:
    expected = set(contract["components"]["schemas"][model_name]["properties"])
    actual = set(live_schema["components"]["schemas"][model_name]["properties"])

    assert expected == actual, (
        f"Поля модели {model_name} разошлись. "
        f"Нет в коде: {sorted(expected - actual)}. Лишние в коде: {sorted(actual - expected)}"
    )


@pytest.mark.parametrize("model_name", CHECKED_MODELS)
def test_required_fields_match_contract(model_name: str, contract: dict, live_schema: dict) -> None:
    expected = set(contract["components"]["schemas"][model_name].get("required", []))
    actual = set(live_schema["components"]["schemas"][model_name].get("required", []))

    assert expected == actual, f"Обязательные поля модели {model_name} разошлись"


def test_query_parameters_match_contract(contract: dict, live_schema: dict) -> None:
    """Имена query-параметров тоже часть контракта."""
    for path, operations in contract["paths"].items():
        for method, operation in operations.items():
            expected = _query_names(operation)
            actual = _query_names(live_schema["paths"][path][method])
            assert (
                expected <= actual
            ), f"У {method.upper()} {path} не хватает параметров: {sorted(expected - actual)}"


def _query_names(operation: dict) -> set[str]:
    """Собирает имена query-параметров одной операции."""
    return {
        parameter["name"]
        for parameter in operation.get("parameters", [])
        if parameter.get("in") == "query"
    }
