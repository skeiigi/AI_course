"""Тесты форматирования отчёта.

README обещает, что формат отчёта после рефакторинга остался прежним.
Здесь это и проверяется: ширина рамки, раскладка колонок, обрезка длинных
названий, расчёт доли и порядок разделов.

Суммы по группам проверяются в ``test_aggregate``.
"""

from decimal import Decimal
from pathlib import Path

import pytest

from orders_report import aggregate, config, reporting
from orders_report.models import LoadResult, Order


def settings(tmp_path: Path, legacy: bool = False) -> config.Settings:
    return config.Settings(
        orders_path=Path("orders.csv"),
        output_dir=tmp_path / "out",
        legacy_discount_rounding=legacy,
    )


def order(**overrides) -> Order:
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


def report_of(tmp_path: Path, orders: list, total_rows: int | None = None) -> str:
    """Собирает текст отчёта по списку заказов."""
    loaded = LoadResult(orders=orders, total_rows=total_rows or len(orders))
    summary = aggregate.build_summary(loaded, settings(tmp_path))
    return reporting.render_report(summary, settings(tmp_path))


def line_starting(report: str, prefix: str) -> str:
    for line in report.split("\n"):
        if line.startswith(prefix):
            return line
    raise AssertionError("нет строки, начинающейся с «%s»" % prefix)


# ---------------------------------------------------------------------------
# Названия категорий
# ---------------------------------------------------------------------------


def test_translates_known_categories():
    assert reporting.category_title("books") == "Книги"
    assert reporting.category_title("electronics") == "Электроника"


def test_prints_unknown_category_as_is():
    """Категория без перевода печатается как есть. Так в отчёт и попадает toys."""
    assert reporting.category_title("toys") == "toys"


def test_names_empty_category():
    assert reporting.category_title("") == config.NO_CATEGORY_TITLE


# ---------------------------------------------------------------------------
# Доля в процентах
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "value,whole,expected",
    [("25", "100", "25.0"), ("1", "3", "33.3"), ("2", "3", "66.7"), ("0", "100", "0.0")],
)
def test_share_has_one_digit_after_the_point(value, whole, expected):
    assert str(reporting.share(Decimal(value), Decimal(whole))) == expected


def test_share_does_not_divide_by_zero():
    """На нулевом итоге отчёт обязан печататься, а не падать."""
    assert reporting.share(Decimal("0"), Decimal("0")) == Decimal("0.0")


# ---------------------------------------------------------------------------
# Раскладка отчёта
# ---------------------------------------------------------------------------


def test_frame_width_is_sixty_characters(tmp_path):
    lines = report_of(tmp_path, [order()]).split("\n")

    assert lines[0] == "=" * 60
    assert config.REPORT_WIDTH == 60
    for line in lines:
        if set(line) in ({"="}, {"-"}):
            assert len(line) == 60


def test_header_has_file_name_and_counters(tmp_path):
    report = report_of(tmp_path, [order()], total_rows=5)

    assert line_starting(report, "Файл: ") == "Файл: orders.csv"
    assert line_starting(report, "Строк в файле:") == "Строк в файле: 5"
    assert line_starting(report, "Учтено заказов:") == "Учтено заказов: 5"
    assert line_starting(report, "Отменённых:") == "Отменённых: 0"


def test_category_columns_stay_in_place(tmp_path):
    """Точная строка таблицы: 100 рублей без скидки дают 20 налога и 120 итога."""
    report = report_of(tmp_path, [order()])
    line = line_starting(report, "Книги")

    assert line == "Книги                1     100.00     0.00     20.00     120.00 100.0%"


def test_total_row_is_always_one_hundred_percent(tmp_path):
    report = report_of(tmp_path, [order(), order(order_id="ORD-2", category="sports")])
    line = line_starting(report, "ИТОГО")

    assert line.endswith("100.0%")
    assert "     2 " in line


def test_long_category_name_is_cut_to_column_width(tmp_path):
    """Колонка шириной 16 символов, длинное название обрезается."""
    long_name = "Очень длинное название категории"
    report = report_of(tmp_path, [order(category=long_name)])

    assert long_name[:16] in report
    assert long_name not in report


def test_all_six_sections_go_in_fixed_order(tmp_path):
    report = report_of(tmp_path, [order()])
    sections = [
        "ОТЧЕТ ПО ЗАКАЗАМ ИНТЕРНЕТ-МАГАЗИНА",
        "ВЫРУЧКА ПО КАТЕГОРИЯМ",
        "ВЫРУЧКА ПО МЕСЯЦАМ",
        "ТОП-5 ТОВАРОВ",
        "ПРИМЕНЕНИЕ СКИДОК",
        "ВОЗВРАТЫ",
    ]
    positions = [report.index(section) for section in sections]

    assert positions == sorted(positions)


def test_refund_total_is_printed_as_negative(tmp_path):
    report = report_of(tmp_path, [order(status=config.STATUS_REFUND)])

    assert line_starting(report, "Возвратов:") == "Возвратов: 1, на сумму -120.00"


def test_warnings_counter_is_printed(tmp_path):
    loaded = LoadResult(orders=[order()], total_rows=1, warnings=["a", "b"])
    summary = aggregate.build_summary(loaded, settings(tmp_path))
    report = reporting.render_report(summary, settings(tmp_path))

    assert line_starting(report, "Предупреждений:") == "Предупреждений: 2"


def test_month_row_format(tmp_path):
    report = report_of(tmp_path, [order()])

    assert line_starting(report, "2025-01") == "2025-01        1 заказов         120.00"


def test_top_row_is_numbered(tmp_path):
    report = report_of(tmp_path, [order()])

    assert " 1. Book" in report


# ---------------------------------------------------------------------------
# Запись файлов
# ---------------------------------------------------------------------------


def test_write_outputs_creates_both_files(tmp_path):
    """Пишутся оба файла: отчёт и выгрузка."""
    current = settings(tmp_path)
    loaded = LoadResult(orders=[order()], total_rows=1)
    summary = aggregate.build_summary(loaded, current)
    text, exported = reporting.write_outputs(loaded, summary, current)

    assert current.report_path.exists()
    assert text == current.report_path.read_text(encoding="utf-8")
    assert exported == 1

    export_lines = current.export_path.read_text(encoding="utf-8").splitlines()
    assert export_lines[0] == "category,month,orders,gross,discount,tax,total"
    assert export_lines[1] == "books,2025-01,1,100.00,0.00,20.00,120.00"


def test_write_outputs_returns_row_count(tmp_path):
    """Число строк выгрузки возвращается, а не пересчитывается второй раз."""
    current = settings(tmp_path)
    loaded = LoadResult(
        orders=[order(), order(order_id="ORD-2", month="2025-02")],
        total_rows=2,
    )
    summary = aggregate.build_summary(loaded, current)
    _, exported = reporting.write_outputs(loaded, summary, current)

    assert exported == 2


def test_reporting_does_not_import_pricing():
    """Граница слоёв проверяется списком импортов, а не на словах."""
    source = (Path(reporting.__file__)).read_text(encoding="utf-8")

    assert "import pricing" not in source
    assert "from .pricing" not in source
