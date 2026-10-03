"""Агрегация: суммы по группам.

Слой собирает заказы в накопители по категориям, месяцам и кодам скидок,
считает топ товаров и строки для выгрузки. О формате отчёта он ничего
не знает: ширины колонок и шаблоны строк живут в ``reporting``.

Граница проверяется просто: в этом файле нет ни одной строки с процентом
форматирования и ни одного обращения к файловой системе.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Sequence, Tuple

from . import config, pricing
from .models import Bucket, LoadResult, Order


@dataclass
class Summary:
    """Готовые агрегаты, из которых печатается отчёт."""

    total_rows: int = 0
    skipped_rows: int = 0
    cancelled_orders: int = 0
    categories: Dict[str, Bucket] = field(default_factory=dict)
    months: Dict[str, Bucket] = field(default_factory=dict)
    discount_codes: Dict[str, Bucket] = field(default_factory=dict)
    top_items: List[Tuple[str, Decimal]] = field(default_factory=list)
    refund_count: int = 0
    refund_total: Decimal = Decimal("0.00")
    warnings_count: int = 0

    @property
    def counted_orders(self) -> int:
        """Сколько строк дошло до расчёта выручки."""
        return self.total_rows - self.skipped_rows - self.cancelled_orders

    @property
    def grand_total(self) -> Decimal:
        """Итог по всем категориям."""
        return sum((bucket.total for bucket in self.categories.values()), Decimal("0.00"))


def _bucket(store: Dict[str, Bucket], key: str) -> Bucket:
    """Возвращает накопитель по ключу, создавая его при первом обращении."""
    if key not in store:
        store[key] = Bucket()
    return store[key]


def build_top_items(
    orders: Sequence[Order],
    settings: config.Settings | None = None,
) -> List[Tuple[str, Decimal]]:
    """Топ товаров по обороту без скидок и без налога.

    Раздел исторически считается по валовой сумме. Скидки в нём не
    учитываются, поэтому суммы не совпадают с таблицей по категориям.
    Настройки принимаются для единообразия с остальными сборщиками:
    на результат они здесь не влияют, потому что скидка не применяется.
    """
    totals: Dict[str, Decimal] = {}
    for order in orders:
        if order.is_cancelled:
            continue
        amounts = pricing.calculate(order, apply_discount=False, apply_tax=False)
        totals[order.item] = totals.get(order.item, Decimal("0.00")) + amounts.gross

    # Сортировка по убыванию суммы, при равенстве по названию товара.
    ranked = sorted(totals.items(), key=lambda pair: (-pair[1], pair[0]))
    return ranked[: config.TOP_ITEMS_COUNT]


def build_summary(loaded: LoadResult, settings: config.Settings) -> Summary:
    """Считает все агрегаты отчёта за один проход по заказам."""
    summary = Summary(
        total_rows=loaded.total_rows,
        skipped_rows=loaded.skipped_rows,
        warnings_count=len(loaded.warnings),
    )

    for order in loaded.orders:
        if order.is_cancelled:
            summary.cancelled_orders += 1
            continue

        amounts = pricing.calculate(order, legacy_rounding=settings.legacy_discount_rounding)

        _bucket(summary.categories, order.category).add(amounts)
        _bucket(summary.months, order.month).add(amounts)
        _bucket(summary.discount_codes, order.discount_code).add(amounts)

        if order.is_refund:
            summary.refund_count += 1
            summary.refund_total += amounts.total

    summary.top_items = build_top_items(loaded.orders, settings)
    return summary


def sorted_category_keys(summary: Summary) -> List[str]:
    """Категории по убыванию итога, при равенстве по ключу."""
    return sorted(summary.categories, key=lambda key: (-summary.categories[key].total, key))


def build_export_rows(
    orders: Sequence[Order], settings: config.Settings
) -> List[List[str]]:
    """Строки CSV-выгрузки: категория и месяц в разрезе сумм."""
    accumulated: Dict[Tuple[str, str], Bucket] = {}

    for order in orders:
        if order.is_cancelled:
            continue
        amounts = pricing.calculate(order, legacy_rounding=settings.legacy_discount_rounding)
        key = (order.category, order.month)
        if key not in accumulated:
            accumulated[key] = Bucket()
        accumulated[key].add(amounts)

    rows: List[List[str]] = []
    for category, month in sorted(accumulated):
        bucket = accumulated[(category, month)]
        rows.append(
            [
                category,
                month,
                str(bucket.orders),
                "%.2f" % bucket.gross,
                "%.2f" % bucket.discount,
                "%.2f" % bucket.tax,
                "%.2f" % bucket.total,
            ]
        )
    return rows
