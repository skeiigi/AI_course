"""Деньги: разбор, округление, форматирование.

Внутри отчёта деньги живут только в ``Decimal`` с двумя знаками после
запятой. Тип ``float`` не появляется нигде: он накапливает ошибку,
и на деньгах это недопустимо.

Модуль ни от чего не зависит, кроме ``config``. Его функции чистые,
поэтому их легко проверять тестами.
"""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal

from . import config

# Строка вида 12, 12.5, 12.34 или -3.10. Ничего другого.
DECIMAL_PATTERN = re.compile(r"^-?\d+(?:\.\d+)?$")

# Целое число, возможно со знаком.
INTEGER_PATTERN = re.compile(r"^-?\d+$")


def to_money(value: Decimal) -> Decimal:
    """Округляет сумму до копеек по правилу «половина вверх».

    Именно так округляют деньги: 15,015 рубля становятся 15,02, а не 15,01.
    Встроенный ``round`` округляет половину к чётному и для денег не годится.

    >>> to_money(Decimal("15.015"))
    Decimal('15.02')
    """
    return value.quantize(config.CENT, rounding=ROUND_HALF_UP)


def divide_round_half_up(numerator: Decimal, denominator: Decimal) -> Decimal:
    """Делит и округляет по тому же правилу «половина вверх».

    :raises ValueError: если делитель не положительный.
    """
    if denominator <= 0:
        raise ValueError("Делитель должен быть положительным")
    return to_money(numerator / denominator)


def parse_money(text: str) -> Decimal | None:
    """Разбирает денежную сумму из файла.

    Возвращает ``None``, если это не десятичная дробь. Legacy-версия звала
    ``float``, а он молча принимает ``12abc`` и возвращает 12. Голый
    ``Decimal`` не лучше: он создаёт ``NaN`` и ``Infinity`` без ошибки,
    а одно такое значение, попав в накопитель, превращает в ``NaN``
    весь отчёт.
    """
    trimmed = text.strip()
    if not DECIMAL_PATTERN.match(trimmed):
        return None
    return Decimal(trimmed)


def parse_integer_strict(text: str) -> int | None:
    """Разбирает целое количество.

    Возвращает ``None``, если это не целое число. Legacy-версия звала
    ``int(float(...))``, а такой разбор молча принимает ``1.9``
    и возвращает 1.
    """
    trimmed = text.strip()
    if not INTEGER_PATTERN.match(trimmed):
        return None
    return int(trimmed)


def format_money(value: Decimal) -> str:
    """Сумму в строку вида ``-1605.98``. Два знака после запятой всегда."""
    return f"{to_money(value):.2f}"


def legacy_discount(gross: Decimal, percent: Decimal) -> Decimal:
    """Воспроизводит расчёт скидки из legacy-версии.

    Legacy считал скидку в плавающей точке и отбрасывал лишние разряды
    вместо округления. Функция нужна только для проверки эквивалентности
    рефакторинга и в обычном режиме не вызывается.
    """
    truncated = int(float(gross) * int(percent)) / 100.0
    return Decimal(str(truncated)).quantize(config.CENT)
