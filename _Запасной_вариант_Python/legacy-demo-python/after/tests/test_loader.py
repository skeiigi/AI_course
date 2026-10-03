"""Тесты чтения файла заказов."""

from decimal import Decimal

import pytest

from orders_report import config, loader

GOOD_ROW = [
    "ORD-1", "2025-03-11", "CUST-1", " books ", "Book",
    "2", "59.90", "SALE10", "P", "msk",
]


def test_parse_row_returns_typed_order():
    """Строка превращается в объект с нужными типами."""
    order = loader.parse_row(list(GOOD_ROW), 1)
    assert order.quantity == 2
    assert order.unit_price == Decimal("59.90")
    assert order.category == "books", "лишние пробелы убираются"
    assert order.month == "2025-03"


@pytest.mark.parametrize(
    "date_text, expected",
    [
        ("2025-03-11", "2025-03"),
        ("2025-13-40", config.UNKNOWN_MONTH),
        ("2025.03.11", config.UNKNOWN_MONTH),
        ("", config.UNKNOWN_MONTH),
    ],
)
def test_parse_month(date_text, expected):
    """Непонятная дата даёт особую метку месяца, а не ошибку."""
    assert loader.parse_month(date_text) == expected


@pytest.mark.parametrize(
    "field_index, bad_value",
    [(5, "two"), (6, ""), (6, "abc")],
)
def test_non_numeric_row_is_rejected(field_index, bad_value):
    """Нечисловые количество или цена приводят к понятной ошибке."""
    row = list(GOOD_ROW)
    row[field_index] = bad_value
    with pytest.raises(ValueError, match="не число"):
        loader.parse_row(row, 1)


def test_negative_quantity_is_rejected():
    """Отрицательное количество не принимается."""
    row = list(GOOD_ROW)
    row[5] = "-1"
    with pytest.raises(ValueError, match="отрицательное количество"):
        loader.parse_row(row, 1)


def test_short_row_is_rejected():
    """Строка с недостающими колонками не принимается."""
    with pytest.raises(ValueError, match="короткая строка"):
        loader.parse_row(GOOD_ROW[:4], 7)


def test_load_orders_collects_warnings(tmp_path):
    """Ошибочные строки не роняют чтение, но попадают в предупреждения."""
    path = tmp_path / "orders.csv"
    path.write_text(
        "order_id,date,customer,category,item,qty,price,discount_code,status,region\n"
        "ORD-1,2025-03-11,CUST-1,books,Book,1,59.90,NONE,P,msk\n"
        "ORD-2,2025-03-11,CUST-2,books,Book,two,59.90,NONE,P,msk\n",
        encoding="utf-8",
    )
    result = loader.load_orders(path)

    assert result.total_rows == 2
    assert len(result.orders) == 1
    assert result.skipped_rows == 1
    assert "ORD-2" in result.skipped[0]
    assert "ORD-2" in result.warnings[0]


HEADER_9 = "order_id,date,customer,category,item,qty,price,discount_code,status\n"
HEADER_10 = "order_id,date,customer,category,item,qty,price,discount_code,status,region\n"
ONE_GOOD_ROW = "ORD-1,2025-03-11,CUST-1,books,Book,1,59.90,NONE,P,msk\n"


def test_strange_header_is_a_warning_but_not_a_skipped_row(tmp_path):
    """Кривой заголовок это предупреждение, а не пропущенная строка.

    Legacy-версия считает эти величины по отдельности: BAD считает строки,
    WARNINGS включает и замечание к заголовку. Переписанная версия обязана
    вести себя так же, иначе отчёты разойдутся.
    """
    path = tmp_path / "orders.csv"
    path.write_text(HEADER_9 + ONE_GOOD_ROW, encoding="utf-8")

    result = loader.load_orders(path)

    assert result.skipped_rows == 0
    assert len(result.warnings) == 1
    assert "заголовок" in result.warnings[0]


def test_good_header_gives_no_warnings(tmp_path):
    path = tmp_path / "orders.csv"
    path.write_text(HEADER_10 + ONE_GOOD_ROW, encoding="utf-8")

    result = loader.load_orders(path)

    assert result.warnings == []
    assert result.skipped_rows == 0


@pytest.mark.parametrize("price", ["NaN", "Infinity", "1e3", "12abc", ""])
def test_price_of_wrong_format_is_rejected(tmp_path, price):
    """Голый Decimal принял бы NaN и заразил бы им весь отчёт."""
    path = tmp_path / "orders.csv"
    path.write_text(
        HEADER_10 + f"ORD-1,2025-03-11,CUST-1,books,Book,1,{price},NONE,P,msk\n",
        encoding="utf-8",
    )

    result = loader.load_orders(path)

    assert result.orders == []
    assert result.skipped_rows == 1


@pytest.mark.parametrize("quantity", ["1.9", "3abc", "две", ""])
def test_quantity_of_wrong_format_is_rejected(tmp_path, quantity):
    """Дробное количество молча усекать нельзя: строка отбраковывается."""
    path = tmp_path / "orders.csv"
    path.write_text(
        HEADER_10 + f"ORD-1,2025-03-11,CUST-1,books,Book,{quantity},59.90,NONE,P,msk\n",
        encoding="utf-8",
    )

    result = loader.load_orders(path)

    assert result.orders == []
    assert result.skipped_rows == 1


@pytest.mark.parametrize("price", ["12", "12.5", "12.34", "-3.10"])
def test_correct_price_is_accepted(tmp_path, price):
    path = tmp_path / "orders.csv"
    path.write_text(
        HEADER_10 + f"ORD-1,2025-03-11,CUST-1,books,Book,1,{price},NONE,P,msk\n",
        encoding="utf-8",
    )

    result = loader.load_orders(path)

    assert len(result.orders) == 1
    assert str(result.orders[0].unit_price) == price
