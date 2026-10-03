"""Чтение файла заказов.

Единственный слой, который знает про CSV. Наверх отдаёт список объектов
``Order`` и список предупреждений. Ошибочные строки не роняют разбор,
но и не теряются молча: каждая попадает в предупреждения.
"""

from __future__ import annotations

import csv
import logging
from pathlib import Path

from . import config
from .models import LoadResult, Order
from .money import parse_integer_strict, parse_money

logger = logging.getLogger(__name__)



def parse_month(date_text: str) -> str:
    """Возвращает метку месяца вида ``2025-03``.

    Если дата записана не в формате ``ГГГГ-ММ-ДД``, возвращается
    ``config.UNKNOWN_MONTH``. Такие заказы видны в отчёте отдельной строкой.
    """
    parts = date_text.strip().split("-")
    if len(parts) != 3:
        return config.UNKNOWN_MONTH
    year, month, day = parts
    try:
        month_number = int(month)
        day_number = int(day)
    except ValueError:
        return config.UNKNOWN_MONTH
    if not 1 <= month_number <= 12 or day_number > 31:
        return config.UNKNOWN_MONTH
    return year + "-" + month


def parse_row(row: list, row_number: int) -> Order:
    """Превращает строку CSV в объект ``Order``.

    :raises ValueError: если строку разобрать нельзя. Текст исключения
        попадает в предупреждения отчёта.
    """
    if len(row) < config.EXPECTED_COLUMNS:
        raise ValueError("короткая строка номер %d" % row_number)

    order_id = row[0].strip()

    quantity = parse_integer_strict(row[5])
    unit_price = parse_money(row[6])
    if quantity is None or unit_price is None:
        raise ValueError("не число в заказе %s" % order_id)

    if quantity < 0:
        raise ValueError("отрицательное количество в заказе %s" % order_id)

    return Order(
        order_id=order_id,
        month=parse_month(row[1]),
        customer=row[2].strip(),
        category=row[3].strip(),
        item=row[4].strip(),
        quantity=quantity,
        unit_price=unit_price,
        discount_code=row[7].strip(),
        status=row[8].strip(),
    )


def load_orders(path: Path) -> LoadResult:
    """Читает файл заказов целиком и возвращает разобранные строки."""
    result = LoadResult()

    with open(path, encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if header is not None and len(header) != config.EXPECTED_COLUMNS:
            message = "неожиданный заголовок: %d колонок" % len(header)
            result.warnings.append(message)
            logger.warning(message)

        for row in reader:
            result.total_rows += 1
            try:
                result.orders.append(parse_row(row, result.total_rows))
            except ValueError as error:
                result.skipped.append(str(error))
                result.warnings.append(str(error))
                logger.warning("строка пропущена: %s", error)

    return result
