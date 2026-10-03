"""Тесты агрегации: суммы по группам, топ товаров, строки выгрузки.

Формат отчёта здесь не проверяется: за него отвечает ``test_reporting``.
"""

from decimal import Decimal
from pathlib import Path

from orders_report import aggregate, config
from orders_report.models import LoadResult, Order


def settings(tmp_path: Path, legacy: bool = False) -> config.Settings:
    """Настройки для теста."""
    return config.Settings(
        orders_path=Path("orders.csv"),
        output_dir=tmp_path / "out",
        legacy_discount_rounding=legacy,
    )


def order(**overrides) -> Order:
    """Заказ со значениями по умолчанию."""
    values = dict(
        order_id="ORD-1",
        month="2025-01",
        customer="CUST-1",
        category="books",
        item="Book",
        quantity=1,
        unit_price=Decimal("100.00"),
        discount_code="NONE",
        status=config.STATUS_PAID,
    )
    values.update(overrides)
    return Order(**values)


# ---------------------------------------------------------------------------
# Суммы по группам
# ---------------------------------------------------------------------------


def test_counts_by_category_month_and_discount_code(tmp_path):
    loaded = LoadResult(
        orders=[
            order(),
            order(order_id="ORD-2", category="sports", month="2025-02", discount_code="SALE5"),
        ],
        total_rows=2,
    )
    summary = aggregate.build_summary(loaded, settings(tmp_path))

    assert set(summary.categories) == {"books", "sports"}
    assert set(summary.months) == {"2025-01", "2025-02"}
    assert set(summary.discount_codes) == {"NONE", "SALE5"}
    assert summary.categories["books"].orders == 1


def test_cancelled_orders_are_counted_separately(tmp_path):
    """Отменённый заказ не попадает ни в одну сумму."""
    loaded = LoadResult(
        orders=[order(), order(order_id="ORD-2", status=config.STATUS_CANCELLED)],
        total_rows=2,
    )
    summary = aggregate.build_summary(loaded, settings(tmp_path))

    assert summary.cancelled_orders == 1
    assert summary.counted_orders == 1
    assert summary.categories["books"].orders == 1
    assert len(summary.categories) == 1


def test_counted_orders_is_rows_minus_skipped_minus_cancelled(tmp_path):
    loaded = LoadResult(
        orders=[order(), order(order_id="ORD-2", status=config.STATUS_CANCELLED)],
        total_rows=10,
        skipped=["a", "b", "c"],
        warnings=["a", "b", "c"],
    )
    summary = aggregate.build_summary(loaded, settings(tmp_path))

    assert summary.total_rows == 10
    assert summary.skipped_rows == 3
    assert summary.cancelled_orders == 1
    assert summary.counted_orders == 6


def test_refunds_are_summed_separately(tmp_path):
    """Возвраты попадают в отдельный счётчик и уменьшают выручку."""
    loaded = LoadResult(orders=[order(status=config.STATUS_REFUND)], total_rows=1)
    summary = aggregate.build_summary(loaded, settings(tmp_path))

    assert summary.refund_count == 1
    assert summary.refund_total == Decimal("-120.00")
    assert summary.categories["books"].total == Decimal("-120.00")


# ---------------------------------------------------------------------------
# Топ товаров
# ---------------------------------------------------------------------------


def test_top_items_use_gross_amount(tmp_path):
    """Топ считается по валовой сумме, без скидок и налога."""
    loaded = LoadResult(
        orders=[order(unit_price=Decimal("100.10"), discount_code="SALE15")],
        total_rows=1,
    )
    summary = aggregate.build_summary(loaded, settings(tmp_path))

    assert summary.top_items == [("Book", Decimal("100.10"))]
    assert summary.categories["books"].total == Decimal("102.10")


def test_top_items_sum_same_item_and_drop_cancelled(tmp_path):
    loaded = LoadResult(
        orders=[
            order(),
            order(order_id="ORD-2"),
            order(order_id="ORD-3", status=config.STATUS_CANCELLED),
        ],
        total_rows=3,
    )
    items = aggregate.build_top_items(loaded.orders, settings(tmp_path))

    assert items == [("Book", Decimal("200.00"))]


def test_top_items_break_ties_by_item_name(tmp_path):
    """При равных суммах порядок задаётся названием товара."""
    loaded = LoadResult(
        orders=[
            order(order_id="ORD-1", item="Ручка"),
            order(order_id="ORD-2", item="Альбом"),
            order(order_id="ORD-3", item="Кисть"),
        ],
        total_rows=3,
    )
    items = aggregate.build_top_items(loaded.orders, settings(tmp_path))

    assert [name for name, _ in items] == ["Альбом", "Кисть", "Ручка"]


def test_top_items_keep_no_more_than_five_rows(tmp_path):
    orders = [
        order(order_id="ORD-%d" % number, item="Товар-%d" % number,
              unit_price=Decimal("%d.00" % (100 - number)))
        for number in range(1, 9)
    ]
    items = aggregate.build_top_items(orders, settings(tmp_path))

    assert len(items) == config.TOP_ITEMS_COUNT == 5
    assert items[0][0] == "Товар-1"


# ---------------------------------------------------------------------------
# Строки выгрузки
# ---------------------------------------------------------------------------


def test_export_rows_group_by_category_and_month(tmp_path):
    loaded = LoadResult(
        orders=[
            order(),
            order(order_id="ORD-2"),
            order(order_id="ORD-3", month="2025-02"),
        ],
        total_rows=3,
    )
    rows = aggregate.build_export_rows(loaded.orders, settings(tmp_path))

    assert len(rows) == 2
    assert rows[0][:3] == ["books", "2025-01", "2"]
    assert rows[1][:3] == ["books", "2025-02", "1"]


def test_export_rows_put_empty_category_first(tmp_path):
    loaded = LoadResult(
        orders=[order(category="books"), order(order_id="ORD-2", category="")],
        total_rows=2,
    )
    rows = aggregate.build_export_rows(loaded.orders, settings(tmp_path))

    assert rows[0][0] == ""


def test_sorting_compares_by_character_codes_not_by_language_rules(tmp_path):
    """SALE10 идёт раньше SALE5: сравниваются коды символов, а не числа.

    Это классическая ловушка: человеку кажется, что 5 меньше 10.
    """
    loaded = LoadResult(
        orders=[
            order(order_id="ORD-1", discount_code="SALE5"),
            order(order_id="ORD-2", discount_code="SALE10"),
        ],
        total_rows=2,
    )
    summary = aggregate.build_summary(loaded, settings(tmp_path))

    assert sorted(summary.discount_codes) == ["SALE10", "SALE5"]


def test_categories_are_sorted_by_total_descending(tmp_path):
    loaded = LoadResult(
        orders=[
            order(category="books", unit_price=Decimal("10.00")),
            order(order_id="ORD-2", category="sports", unit_price=Decimal("500.00")),
        ],
        total_rows=2,
    )
    summary = aggregate.build_summary(loaded, settings(tmp_path))

    assert aggregate.sorted_category_keys(summary) == ["sports", "books"]
