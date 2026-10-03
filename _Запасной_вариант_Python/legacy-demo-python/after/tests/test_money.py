"""Тесты модуля денег.

Здесь проверяется то, ради чего модуль и выделен: округление половины
вверх, строгий разбор чисел и печать с двумя знаками после запятой.
Именно в этих трёх местах legacy-версия вела себя незаметно неверно.
"""

from decimal import Decimal

import pytest

from orders_report import money


# ---------------------------------------------------------------------------
# Округление
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "value,expected",
    [
        ("15.015", "15.02"),
        ("1.665", "1.67"),
        ("0.005", "0.01"),
        ("2.675", "2.68"),
    ],
)
def test_rounds_half_up_not_down(value: str, expected: str) -> None:
    """Половина копейки идёт вверх.

    Встроенный round округляет половину к чётному: round(2.675, 2) даёт 2,67.
    Для денег это неверно.
    """
    assert money.to_money(Decimal(value)) == Decimal(expected)


@pytest.mark.parametrize("value", ["0.00", "12.34", "-3.10", "1000.00"])
def test_keeps_exact_values_unchanged(value: str) -> None:
    assert money.to_money(Decimal(value)) == Decimal(value)


@pytest.mark.parametrize(
    "value,expected",
    [("-15.015", "-15.02"), ("-1.665", "-1.67"), ("-0.005", "-0.01")],
)
def test_rounds_away_from_zero_for_negatives(value: str, expected: str) -> None:
    """Для отрицательных сумм округление идёт от нуля, как и для положительных."""
    assert money.to_money(Decimal(value)) == Decimal(expected)


def test_divide_rounds_half_up() -> None:
    assert money.divide_round_half_up(Decimal("333"), Decimal("2")) == Decimal("166.50")
    assert money.divide_round_half_up(Decimal("1"), Decimal("3")) == Decimal("0.33")


@pytest.mark.parametrize("denominator", ["0", "-1", "-100"])
def test_does_not_divide_by_zero_or_negative(denominator: str) -> None:
    with pytest.raises(ValueError, match="положительным"):
        money.divide_round_half_up(Decimal("100"), Decimal(denominator))


# ---------------------------------------------------------------------------
# Разбор денежных сумм
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text,expected",
    [("12", "12"), ("12.5", "12.5"), ("12.34", "12.34"), ("  12.34  ", "12.34")],
)
def test_reads_normal_prices(text: str, expected: str) -> None:
    assert money.parse_money(text) == Decimal(expected)


@pytest.mark.parametrize("text", ["-3.10", "-0.01", "-1605.98"])
def test_reads_negative_amounts(text: str) -> None:
    assert money.parse_money(text) == Decimal(text)


@pytest.mark.parametrize("text", ["", "   ", "abc", ".", "-", "1.2.3", "1,5", "+5"])
def test_refuses_to_parse_garbage(text: str) -> None:
    assert money.parse_money(text) is None


@pytest.mark.parametrize("text", ["12abc", "12 руб", "3x"])
def test_does_not_swallow_tail_after_number(text: str) -> None:
    """float("12abc") в Python падает, а int(float(...)) в legacy принимал «1.9».

    Здесь проверяется общее правило: хвост после числа делает строку негодной.
    """
    assert money.parse_money(text) is None


@pytest.mark.parametrize("text", ["NaN", "Infinity", "-Infinity", "nan", "inf", "1e3", "1E3"])
def test_refuses_special_decimal_values(text: str) -> None:
    """Голый Decimal создаёт NaN и Infinity без ошибки.

    Одно такое значение, попав в накопитель, превращает в NaN весь отчёт,
    и заметить это по отчёту почти невозможно.
    """
    assert money.parse_money(text) is None


# ---------------------------------------------------------------------------
# Разбор количества
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("text,expected", [("1", 1), ("42", 42), ("-3", -3), ("  7 ", 7)])
def test_reads_integer_quantities(text: str, expected: int) -> None:
    assert money.parse_integer_strict(text) == expected


@pytest.mark.parametrize("text", ["1.9", "0.5", "-2.5"])
def test_does_not_round_fractions_silently(text: str) -> None:
    """Legacy звал int(float("1.9")) и молча получал 1."""
    assert money.parse_integer_strict(text) is None


@pytest.mark.parametrize("text", ["", "две", "3abc", "1e3", " "])
def test_refuses_to_parse_garbage_quantity(text: str) -> None:
    assert money.parse_integer_strict(text) is None


# ---------------------------------------------------------------------------
# Печать
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "value,expected",
    [
        ("0", "0.00"),
        ("0.05", "0.05"),
        ("1605.9", "1605.90"),
        ("-1605.98", "-1605.98"),
        ("342.5", "342.50"),
    ],
)
def test_prints_two_digits_after_the_point(value: str, expected: str) -> None:
    assert money.format_money(Decimal(value)) == expected


# ---------------------------------------------------------------------------
# Режим совместимости
# ---------------------------------------------------------------------------


def test_legacy_discount_truncates_instead_of_rounding() -> None:
    """Режим совместимости обязан повторять ошибку legacy, а не чинить её."""
    gross = Decimal("111.00")
    percent = Decimal("15")
    assert money.legacy_discount(gross, percent) == Decimal("16.65")
    assert money.to_money(gross * percent / Decimal("100")) == Decimal("16.65")

    # Здесь усечение заметно: 15,015 превращается в 15,01 вместо 15,02.
    gross = Decimal("100.10")
    assert money.legacy_discount(gross, percent) == Decimal("15.01")
    assert money.to_money(gross * percent / Decimal("100")) == Decimal("15.02")
