"""Тесты доменной логики расчёта.

Здесь живёт тот самый тест, который в legacy-версии фиксировал ошибку.
Сравните его с ``tests/test_characterization.py::test_discount_rounding_is_truncated``:
ожидание изменено осознанно, вместе с исправлением расчёта.
"""

from decimal import Decimal

import pytest

from orders_report import config, pricing
from orders_report.models import Order


def make_order(**overrides) -> Order:
    """Заказ со значениями по умолчанию, поля переопределяются по имени."""
    values = dict(
        order_id="ORD-1",
        month="2025-01",
        customer="CUST-1",
        category="books",
        item="Book",
        quantity=1,
        unit_price=Decimal("100.10"),
        discount_code="SALE15",
        status=config.STATUS_PAID,
    )
    values.update(overrides)
    return Order(**values)


# --------------------------------------------------------------------------
# Исправленная ошибка округления
# --------------------------------------------------------------------------


def test_discount_is_rounded_half_up():
    """Скидка 15 процентов от 100,10 равна 15,02, а не 15,01.

    В legacy-версии здесь было 15,01: третий знак отбрасывался.
    Характеризующий тест фиксировал прежнее значение, теперь оно изменено
    вместе с исправлением.
    """
    amounts = pricing.calculate(make_order())
    assert amounts.discount == Decimal("15.02")
    assert amounts.net == Decimal("85.08")
    assert amounts.tax == Decimal("17.02")
    assert amounts.total == Decimal("102.10")


def test_legacy_rounding_mode_reproduces_old_answer():
    """Режим совместимости даёт прежний, неверный результат."""
    amounts = pricing.calculate(make_order(), legacy_rounding=True)
    assert amounts.discount == Decimal("15.01")



# --------------------------------------------------------------------------
# Правила скидок
# --------------------------------------------------------------------------


def test_unknown_code_gives_no_discount():
    """Незнакомый код скидки не даёт."""
    percent = pricing.discount_percent(
        Decimal("100.00"), "PROMO99", config.STATUS_PAID
    )
    assert percent == Decimal("0")


def test_large_order_gets_bonus_percent():
    """Заказ дороже порога получает надбавку к проценту."""
    percent = pricing.discount_percent(
        Decimal("1512.00"), "SALE15", config.STATUS_PAID
    )
    assert percent == Decimal("20")


def test_discount_percent_is_capped():
    """Итоговый процент ограничен сверху."""
    percent = pricing.discount_percent(
        Decimal("1512.00"), "VIP20", config.STATUS_PAID
    )
    assert percent == config.MAX_DISCOUNT_PERCENT


def test_refund_gets_no_discount_and_negative_amounts():
    """Возврат считается со знаком минус и без скидки."""
    order = make_order(status=config.STATUS_REFUND, unit_price=Decimal("100.00"))
    amounts = pricing.calculate(order)
    assert amounts.gross == Decimal("-100.00")
    assert amounts.discount == Decimal("0.00")
    assert amounts.total == Decimal("-120.00")


def test_tax_is_taken_from_net_amount():
    """Налог считается от суммы после скидки."""
    order = make_order(unit_price=Decimal("100.00"), discount_code="SALE10")
    amounts = pricing.calculate(order)
    assert amounts.discount == Decimal("10.00")
    assert amounts.tax == Decimal("18.00")
    assert amounts.total == Decimal("108.00")


def test_top_items_mode_skips_discount_and_tax():
    """Для раздела «Топ товаров» считается только валовая сумма."""
    amounts = pricing.calculate(make_order(), apply_discount=False, apply_tax=False)
    assert amounts.gross == Decimal("100.10")
    assert amounts.total == Decimal("100.10")


def test_zero_price_is_valid():
    """Нулевая цена не ошибка, а нулевая выручка."""
    amounts = pricing.calculate(make_order(unit_price=Decimal("0.00")))
    assert amounts.total == Decimal("0.00")
