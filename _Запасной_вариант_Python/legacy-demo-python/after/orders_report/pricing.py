"""Доменная логика: расчёт сумм по одной строке заказа.

Модуль ничего не знает ни о файлах, ни о формате отчёта. Округление
и разбор чисел живут в ``money``, здесь только правила предметной области:
кому положена скидка, какой процент и что делать с возвратом.
"""

from __future__ import annotations

from decimal import Decimal

from . import config
from .models import LineAmounts, Order
from .money import legacy_discount, to_money


def discount_percent(gross: Decimal, discount_code: str, status: str) -> Decimal:
    """Возвращает итоговый процент скидки для строки заказа.

    Возврату скидка не полагается. Крупный заказ получает надбавку,
    общий процент ограничен сверху.
    """
    if status == config.STATUS_REFUND:
        return Decimal("0")

    percent = config.DISCOUNT_PERCENT_BY_CODE.get(discount_code, Decimal("0"))
    if gross > config.LARGE_ORDER_THRESHOLD:
        percent += config.LARGE_ORDER_BONUS_PERCENT
    if percent > config.MAX_DISCOUNT_PERCENT:
        percent = config.MAX_DISCOUNT_PERCENT
    return percent


def gross_amount(order: Order) -> Decimal:
    """Сумма строки до скидок и налога. У возврата она отрицательная."""
    amount = to_money(Decimal(order.quantity) * order.unit_price)
    if order.is_refund:
        return -amount
    return amount


def calculate(
    order: Order,
    *,
    apply_discount: bool = True,
    apply_tax: bool = True,
    legacy_rounding: bool = False,
) -> LineAmounts:
    """Считает суммы по одной строке заказа.

    :param apply_discount: учитывать скидку. Раздел «Топ товаров» исторически
        считается без скидок, поэтому флаг нужен.
    :param apply_tax: добавлять налог.
    :param legacy_rounding: считать скидку так же, как legacy-версия.
        Нужен только для проверки эквивалентности.
    """
    gross = gross_amount(order)

    discount = Decimal("0.00")
    if apply_discount:
        percent = discount_percent(gross, order.discount_code, order.status)
        if legacy_rounding:
            discount = legacy_discount(gross, percent)
        else:
            discount = to_money(gross * percent / Decimal("100"))

    net = to_money(gross - discount)
    tax = to_money(net * config.TAX_RATE) if apply_tax else Decimal("0.00")
    total = to_money(net + tax)

    return LineAmounts(gross=gross, discount=discount, net=net, tax=tax, total=total)
