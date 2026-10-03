"""Форматирование отчёта и запись файлов.

Слой превращает готовые агрегаты в текст и в строки CSV. Ни одного
расчёта денег здесь нет: суммы приходят посчитанными из ``aggregate``.

Граница проверяется просто: этот файл не импортирует ``pricing``
и не знает, откуда взялись числа.
"""

from __future__ import annotations

import csv
from decimal import ROUND_HALF_UP, Decimal
from typing import List

from . import aggregate, config
from .models import Bucket, LoadResult

CATEGORY_ROW = "%-16s %5d %10.2f %8.2f %9.2f %10.2f %5s%%"
CATEGORY_HEAD = "%-16s %5s %10s %8s %9s %10s %6s"
MONTH_ROW = "%-10s %5d заказов %14.2f"
TOP_ROW = "%2d. %-30s %14.2f"
DISCOUNT_ROW = "%-10s %5d заказов, скидок на %10.2f"

EXPORT_HEADER = ["category", "month", "orders", "gross", "discount", "tax", "total"]


def category_title(category_key: str) -> str:
    """Человеческое название категории для печати."""
    if category_key == "":
        return config.NO_CATEGORY_TITLE
    return config.CATEGORY_TITLES.get(category_key, category_key)


def share(value: Decimal, whole: Decimal) -> Decimal:
    """Доля в процентах с одним знаком после запятой."""
    if whole == 0:
        whole = Decimal("1")
    return (value / whole * Decimal("100")).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def render_report(summary: aggregate.Summary, settings: config.Settings) -> str:
    """Собирает текст отчёта."""
    line_double = "=" * config.REPORT_WIDTH
    line_single = "-" * config.REPORT_WIDTH
    out: List[str] = []

    out.append(line_double)
    out.append("ОТЧЕТ ПО ЗАКАЗАМ ИНТЕРНЕТ-МАГАЗИНА")
    out.append(line_double)
    out.append("Файл: " + str(settings.orders_path))
    out.append("Строк в файле: " + str(summary.total_rows))
    out.append("Учтено заказов: " + str(summary.counted_orders))
    out.append("Отменённых: " + str(summary.cancelled_orders))
    out.append("Пропущено из-за ошибок в данных: " + str(summary.skipped_rows))
    out.append("")

    out.append(line_single)
    out.append("ВЫРУЧКА ПО КАТЕГОРИЯМ")
    out.append(line_single)
    out.append(CATEGORY_HEAD % ("Категория", "Зак.", "Сумма", "Скидки", "Налог", "Итого", "Доля"))

    grand = summary.grand_total
    total_row = Bucket()
    for key in aggregate.sorted_category_keys(summary):
        bucket = summary.categories[key]
        out.append(
            CATEGORY_ROW
            % (
                category_title(key)[:16],
                bucket.orders,
                bucket.gross,
                bucket.discount,
                bucket.tax,
                bucket.total,
                share(bucket.total, grand),
            )
        )
        total_row.orders += bucket.orders
        total_row.gross += bucket.gross
        total_row.discount += bucket.discount
        total_row.tax += bucket.tax
        total_row.total += bucket.total

    out.append(line_single)
    out.append(
        CATEGORY_ROW
        % (
            "ИТОГО",
            total_row.orders,
            total_row.gross,
            total_row.discount,
            total_row.tax,
            total_row.total,
            "100.0",
        )
    )
    out.append("")

    out.append(line_single)
    out.append("ВЫРУЧКА ПО МЕСЯЦАМ")
    out.append(line_single)
    for key in sorted(summary.months):
        bucket = summary.months[key]
        out.append(MONTH_ROW % (key, bucket.orders, bucket.total))
    out.append("")

    out.append(line_single)
    out.append("ТОП-%d ТОВАРОВ (без скидок и налога)" % config.TOP_ITEMS_COUNT)
    out.append(line_single)
    for number, (item, value) in enumerate(summary.top_items, start=1):
        out.append(TOP_ROW % (number, item[:30], value))
    out.append("")

    out.append(line_single)
    out.append("ПРИМЕНЕНИЕ СКИДОК")
    out.append(line_single)
    for key in sorted(summary.discount_codes):
        bucket = summary.discount_codes[key]
        out.append(DISCOUNT_ROW % (key, bucket.orders, bucket.discount))
    out.append("")

    out.append(line_single)
    out.append("ВОЗВРАТЫ")
    out.append(line_single)
    out.append("Возвратов: %d, на сумму %.2f" % (summary.refund_count, summary.refund_total))
    out.append("")

    out.append(line_double)
    out.append("Предупреждений: %d" % summary.warnings_count)
    out.append(line_double)

    return "\n".join(out) + "\n"


def write_outputs(
    loaded: LoadResult, summary: aggregate.Summary, settings: config.Settings
) -> tuple[str, int]:
    """Пишет текстовый отчёт и CSV-выгрузку.

    Возвращает текст отчёта и число строк выгрузки, чтобы точке входа
    не приходилось собирать эти строки второй раз только ради счётчика.
    """
    settings.output_dir.mkdir(parents=True, exist_ok=True)

    text = render_report(summary, settings)
    settings.report_path.write_text(text, encoding="utf-8")

    rows = aggregate.build_export_rows(loaded.orders, settings)
    with open(settings.export_path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(EXPORT_HEADER)
        writer.writerows(rows)

    return text, len(rows)
