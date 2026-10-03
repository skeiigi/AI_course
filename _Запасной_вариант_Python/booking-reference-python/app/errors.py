"""
Ошибки API: код для программы, сообщение для человека.

Клиент опирается на поле code, а поле message показывает пользователю.
Набор кодов описан в контракте contract/main.tsp, союз ErrorCode.

Это зеркало server/src/errors.ts из эталонного проекта на TypeScript:
коды, статусы и тексты обязаны совпадать слово в слово.
"""

from typing import Literal

ErrorCode = Literal[
    "validation_failed",
    "activity_not_found",
    "booking_not_found",
    "slot_not_found",
    "slot_taken",
    "booking_already_cancelled",
    "invalid_time_window",
    "invalid_date_range",
    "route_not_found",
    "internal_error",
]


class ApiError(Exception):
    """
    Ошибка, которую сервис возвращает клиенту осознанно.
    Всё остальное, что вылетело из обработчика, считается сбоем и даёт код 500.
    """

    def __init__(self, status_code: int, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code: ErrorCode = code
        self.message = message

    @property
    def body(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


def not_found(code: ErrorCode, message: str) -> ApiError:
    return ApiError(404, code, message)


def conflict(code: ErrorCode, message: str) -> ApiError:
    return ApiError(409, code, message)


def unprocessable(code: ErrorCode, message: str) -> ApiError:
    return ApiError(422, code, message)


# Готовые ошибки предметной области. Тексты собраны здесь, а не разбросаны
# по обработчикам, чтобы одна и та же ситуация всегда описывалась одинаково.


def activity_not_found() -> ApiError:
    return not_found("activity_not_found", "Вид активности не найден")


def booking_not_found() -> ApiError:
    return not_found("booking_not_found", "Бронь не найдена")


def slot_not_found() -> ApiError:
    return unprocessable(
        "slot_not_found", "В расписании нет слота, который начинается в это время"
    )


def slot_taken() -> ApiError:
    return conflict("slot_taken", "Этот слот уже забронирован")


def booking_already_cancelled() -> ApiError:
    return conflict("booking_already_cancelled", "Эта бронь уже отменена")


def invalid_time_window() -> ApiError:
    return unprocessable(
        "invalid_time_window", "Начало рабочего окна должно быть раньше его конца"
    )


def invalid_date_range(message: str) -> ApiError:
    return unprocessable("invalid_date_range", message)


# ---------------------------------------------------------------------------
# Перевод разбора Pydantic в одно понятное сообщение
#
# Зеркало функции describeZodError из server/src/errors.ts. Pydantic пишет
# по-английски, поэтому тексты заданы здесь: они обязаны совпадать со схемами
# Zod эталона слово в слово, иначе раздатка и ответ сервиса разойдутся.
# ---------------------------------------------------------------------------

# Ключ это пара «имя поля, тип ошибки Pydantic».
_FIELD_MESSAGES: dict[tuple[str, str], str] = {
    ("name", "string_too_short"): "Название активности не может быть пустым",
    ("name", "string_too_long"): "Название активности длиннее 100 символов",
    ("description", "string_too_long"): "Описание длиннее 500 символов",
    ("color", "string_pattern_mismatch"): "Цвет задаётся кодом вида #3b5bdb",
    ("duration_minutes", "greater_than_equal"): "Длительность меньше 5 минут",
    ("duration_minutes", "less_than_equal"): "Длительность больше 480 минут",
    ("step_minutes", "greater_than_equal"): "Шаг сетки меньше 5 минут",
    ("step_minutes", "less_than_equal"): "Шаг сетки больше 480 минут",
    ("weekdays", "too_short"): "Нужен хотя бы один день недели",
    ("weekdays", "too_long"): "Дней недели не может быть больше семи",
    ("guest_name", "string_too_short"): "Имя гостя не может быть пустым",
    ("guest_name", "string_too_long"): "Имя гостя длиннее 100 символов",
}

# Сообщения про целые числа: у каждого поля свой текст, как в схемах Zod.
_INTEGER_MESSAGES: dict[str, str] = {
    "duration_minutes": "Длительность указывается целым числом минут",
    "step_minutes": "Шаг сетки указывается целым числом минут",
    "activity_id": "Идентификатор активности должен быть целым числом",
    "booking_id": "Ожидается целое число",
}

_DATE_FIELDS = frozenset({"date", "date_from", "date_to"})
_TIME_FIELDS = frozenset({"start_time", "end_time"})

_INTEGER_ERROR_TYPES = frozenset({"int_type", "int_parsing", "int_from_float"})


def _describe_issue(field: str, error_type: str) -> str:
    """Текст одной претензии к данным."""
    exact = _FIELD_MESSAGES.get((field, error_type))
    if exact is not None:
        return exact

    if error_type in _INTEGER_ERROR_TYPES:
        return _INTEGER_MESSAGES.get(field, "Ожидается целое число")

    if error_type == "string_pattern_mismatch":
        if field in _DATE_FIELDS:
            return "Дата указывается в формате ГГГГ-ММ-ДД"
        if field in _TIME_FIELDS:
            return "Время указывается в формате ЧЧ:ММ:СС"

    if field == "guest_email":
        return "Почта указана неверно"

    if error_type == "missing":
        return "Поле обязательно"

    if error_type in {"greater_than_equal", "greater_than"}:
        return "Значение меньше допустимого"
    if error_type in {"less_than_equal", "less_than"}:
        return "Значение больше допустимого"
    if error_type == "json_invalid":
        return "Тело запроса не является корректным JSON"

    return "Значение не прошло проверку"


def describe_validation_error(error) -> str:
    """Собирает разбор Pydantic в одну строку.

    Пример: «guest_email: Почта указана неверно; duration_minutes: Длительность
    меньше 5 минут».
    """
    parts: list[str] = []
    for issue in error.errors():
        # Первый элемент это источник: body, query или path. Он в сообщение не идёт.
        location = [str(item) for item in issue["loc"][1:]]
        field = location[0] if location else ""
        text = _describe_issue(field, issue["type"])
        path = ".".join(location)
        parts.append(f"{path}: {text}" if path else text)
    return "; ".join(parts)
