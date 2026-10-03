# -*- coding: utf-8 -*-
"""Характеризующие тесты legacy-версии отчёта.

Эти тесты НЕ проверяют, что программа работает правильно.
Они фиксируют, как она работает сегодня, включая известную ошибку
округления скидки. Пока такие тесты зелёные, рефакторинг безопасен:
любое изменение поведения будет замечено сразу.

Запуск из папки проекта:

    pytest tests -q
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT = Path(__file__).resolve().parent.parent
LEGACY = PROJECT / "legacy_report.py"
GOLDEN = PROJECT / "tests" / "golden"

HEADER = "order_id,date,customer,category,item,qty,price,discount_code,status,region"


def make_csv(*rows: str) -> str:
    """Собирает содержимое файла заказов из готовых строк."""
    return HEADER + "\n" + "\n".join(rows) + "\n"


def run_legacy(work_dir: Path, csv_text: str = None):
    """Запускает legacy-скрипт в отдельной папке и возвращает его результаты.

    Возвращает пару: текст отчёта и содержимое CSV-выгрузки.
    """
    if csv_text is None:
        shutil.copy(PROJECT / "orders.csv", work_dir / "orders.csv")
    else:
        (work_dir / "orders.csv").write_text(csv_text, encoding="utf-8")

    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    finished = subprocess.run(
        [sys.executable, str(LEGACY)],
        cwd=str(work_dir),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    assert finished.returncode == 0, finished.stderr

    report = (work_dir / "out" / "report.txt").read_text(encoding="utf-8")
    export = (work_dir / "out" / "revenue.csv").read_text(encoding="utf-8")
    return report, export


def run_legacy_with_output(work_dir: Path, csv_text: str = None):
    """То же, что run_legacy, но отдаёт ещё и то, что программа напечатала.

    Предупреждения legacy-версия пишет в стандартный вывод, а не в отчёт,
    поэтому без него часть поведения зафиксировать нельзя.
    """
    if csv_text is None:
        shutil.copy(PROJECT / "orders.csv", work_dir / "orders.csv")
    else:
        (work_dir / "orders.csv").write_text(csv_text, encoding="utf-8")

    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    finished = subprocess.run(
        [sys.executable, str(LEGACY)],
        cwd=str(work_dir),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    assert finished.returncode == 0, finished.stderr

    report = (work_dir / "out" / "report.txt").read_text(encoding="utf-8")
    return report, finished.stdout


def line_starting_with(report: str, prefix: str) -> str:
    """Находит в отчёте первую строку, начинающуюся с указанного текста."""
    for line in report.splitlines():
        if line.startswith(prefix):
            return line
    raise AssertionError("в отчёте нет строки, начинающейся с %r" % prefix)


def value_after(report: str, prefix: str) -> str:
    """Возвращает то, что стоит после двоеточия в строке отчёта."""
    return line_starting_with(report, prefix).split(":", 1)[1].strip()


#: В таблице категорий название занимает первые 16 символов строки,
#: дальше идут числа: заказы, сумма, скидка, налог, итог, доля.
NAME_WIDTH = 16


def category_cells(report: str, title: str):
    """Числа одной строки таблицы категорий."""
    return line_starting_with(report, title)[NAME_WIDTH:].split()


# --------------------------------------------------------------------------
# 1. Отчёт целиком: эталонные файлы
# --------------------------------------------------------------------------


def test_report_matches_golden(tmp_path):
    """Отчёт на штатных данных совпадает с эталоном до символа."""
    report, _ = run_legacy(tmp_path)
    assert report == (GOLDEN / "report.txt").read_text(encoding="utf-8")


def test_export_matches_golden(tmp_path):
    """CSV-выгрузка на штатных данных совпадает с эталоном до символа."""
    _, export = run_legacy(tmp_path)
    assert export == (GOLDEN / "revenue.csv").read_text(encoding="utf-8")


def test_header_counters(tmp_path):
    """Счётчики в шапке отчёта не меняются."""
    report, _ = run_legacy(tmp_path)
    assert value_after(report, "Строк в файле") == "219"
    assert value_after(report, "Учтено заказов") == "204"
    assert value_after(report, "Отменённых") == "12"
    assert value_after(report, "Пропущено из-за ошибок в данных") == "3"


# --------------------------------------------------------------------------
# 2. Известная ошибка: округление скидки
# --------------------------------------------------------------------------

#: Скидка 15 процентов от 100,10 равна 15,015. По правилам округления денег
#: это 15,02. Legacy отбрасывает третий знак и получает 15,01.
#: Тест фиксирует текущее, неверное значение. Менять его можно только
#: вместе с осознанным исправлением расчёта.
LEGACY_DISCOUNT = "15.01"
CORRECT_DISCOUNT = "15.02"


def test_discount_rounding_is_truncated(tmp_path):
    """ЗАФИКСИРОВАННАЯ ОШИБКА: скидка усекается, а не округляется."""
    csv_text = make_csv("ORD-1,2025-01-10,CUST-1,books,Book,1,100.10,SALE15,P,msk")
    report, _ = run_legacy(tmp_path, csv_text)

    cells = category_cells(report, "Книги")
    assert cells[1] == "100.10", "сумма до скидки"
    assert cells[2] == LEGACY_DISCOUNT, "скидка считается с усечением"
    assert cells[2] != CORRECT_DISCOUNT, "правильное значение пока не получается"


def test_truncation_shifts_tax_and_total(tmp_path):
    """Ошибка в скидке тянет за собой налог и итог."""
    csv_text = make_csv("ORD-1,2025-01-10,CUST-1,books,Book,1,100.10,SALE15,P,msk")
    report, _ = run_legacy(tmp_path, csv_text)

    cells = category_cells(report, "Книги")
    assert cells[3] == "17.02", "налог 20 процентов от 85,09"
    assert cells[4] == "102.11", "итог строки"


def test_truncation_accumulates_on_real_data(tmp_path):
    """На штатных данных недобор скидок виден в итоговой строке."""
    report, _ = run_legacy(tmp_path)
    cells = category_cells(report, "ИТОГО")
    assert cells[2] == "1404.22", "сумма всех скидок при усечении"


# --------------------------------------------------------------------------
# 3. Правила расчёта
# --------------------------------------------------------------------------


def test_large_order_gets_extra_percent(tmp_path):
    """Заказ дороже 1 000 получает пять дополнительных процентов скидки."""
    csv_text = make_csv(
        "ORD-1,2025-01-10,CUST-1,electronics,Monitor 24,8,189.00,SALE15,P,msk"
    )
    report, _ = run_legacy(tmp_path, csv_text)

    cells = category_cells(report, "Электроника")
    assert cells[1] == "1512.00"
    assert cells[2] == "302.40", "не 15, а 20 процентов"


def test_discount_is_capped(tmp_path):
    """Общая скидка не превышает 25 процентов."""
    csv_text = make_csv(
        "ORD-1,2025-01-10,CUST-1,electronics,Monitor 24,8,189.00,VIP20,P,msk"
    )
    report, _ = run_legacy(tmp_path, csv_text)

    cells = category_cells(report, "Электроника")
    assert cells[2] == "378.00", "20 плюс 5 ограничены 25 процентами"


def test_refund_is_negative_and_without_discount(tmp_path):
    """Возврат уменьшает выручку и скидки не получает."""
    csv_text = make_csv("ORD-1,2025-02-01,CUST-1,books,Book,1,100.00,SALE15,R,msk")
    report, _ = run_legacy(tmp_path, csv_text)

    cells = category_cells(report, "Книги")
    assert cells[1] == "-100.00"
    assert cells[2] == "0.00"
    assert line_starting_with(report, "Возвратов").endswith("-120.00")


def test_cancelled_order_is_not_counted(tmp_path):
    """Отменённый заказ не попадает ни в одну сумму."""
    csv_text = make_csv(
        "ORD-1,2025-02-01,CUST-1,books,Book,1,100.00,NONE,P,msk",
        "ORD-2,2025-02-01,CUST-2,books,Book,1,100.00,NONE,C,msk",
    )
    report, _ = run_legacy(tmp_path, csv_text)

    assert value_after(report, "Отменённых") == "1"
    assert value_after(report, "Учтено заказов") == "1"
    assert category_cells(report, "Книги")[0] == "1"


def test_zero_price_row_is_counted(tmp_path):
    """Строка с нулевой ценой остаётся заказом с нулевой выручкой."""
    csv_text = make_csv("ORD-1,2025-02-01,CUST-1,books,Sample,1,0.00,NONE,P,msk")
    report, _ = run_legacy(tmp_path, csv_text)

    assert value_after(report, "Учтено заказов") == "1"
    assert category_cells(report, "Книги")[1] == "0.00"


def test_broken_rows_are_skipped_with_warning(tmp_path):
    """Строки с нечисловыми полями и отрицательным количеством пропускаются."""
    csv_text = make_csv(
        "ORD-1,2025-02-01,CUST-1,books,Book,two,59.90,NONE,P,msk",
        "ORD-2,2025-02-01,CUST-2,books,Book,-1,59.90,NONE,P,msk",
        "ORD-3,2025-02-01,CUST-3,books,Book,1,59.90,NONE,P,msk",
    )
    report, _ = run_legacy(tmp_path, csv_text)

    assert value_after(report, "Пропущено из-за ошибок в данных") == "2"
    assert value_after(report, "Предупреждений") == "2"


# --------------------------------------------------------------------------
# 4. Особенности форматирования, которые легко потерять при рефакторинге
# --------------------------------------------------------------------------


def test_empty_category_has_own_bucket(tmp_path):
    """Пустая категория печатается как «БЕЗ КАТЕГОРИИ»."""
    csv_text = make_csv("ORD-1,2025-02-01,CUST-1,,Gift card,1,50.00,NONE,P,msk")
    report, _ = run_legacy(tmp_path, csv_text)
    assert category_cells(report, "БЕЗ КАТЕГОРИИ")[1] == "50.00"


def test_category_without_russian_name_is_printed_as_is(tmp_path):
    """Для категории toys перевода нет, печатается английский ключ."""
    csv_text = make_csv("ORD-1,2025-02-01,CUST-1,toys,Toy car,1,50.00,NONE,P,msk")
    report, _ = run_legacy(tmp_path, csv_text)
    assert category_cells(report, "toys")[1] == "50.00"


def test_unknown_discount_code_gives_no_discount(tmp_path):
    """Незнакомый код скидки молча трактуется как нулевая скидка."""
    csv_text = make_csv("ORD-1,2025-02-01,CUST-1,books,Book,1,50.00,PROMO99,P,msk")
    report, _ = run_legacy(tmp_path, csv_text)

    assert category_cells(report, "Книги")[2] == "0.00"
    assert line_starting_with(report, "PROMO99").split()[1] == "1"


def test_unparsable_date_goes_to_zero_month(tmp_path):
    """Дата в чужом формате даёт месяц 0000-00, а не ошибку."""
    csv_text = make_csv("ORD-1,2025.02.01,CUST-1,books,Book,1,50.00,NONE,P,msk")
    report, _ = run_legacy(tmp_path, csv_text)
    assert line_starting_with(report, "0000-00").split()[1] == "1"


def test_top_items_ignore_discounts_and_tax(tmp_path):
    """Топ товаров считается по валовой сумме, а таблица категорий по итогу."""
    csv_text = make_csv("ORD-1,2025-01-10,CUST-1,books,Book,1,100.10,SALE15,P,msk")
    report, _ = run_legacy(tmp_path, csv_text)

    assert category_cells(report, "Книги")[4] == "102.11"
    assert line_starting_with(report, " 1. Book").split()[-1] == "100.10"


def test_export_columns_and_first_row(tmp_path):
    """Заголовок выгрузки и порядок строк зафиксированы."""
    _, export = run_legacy(tmp_path)
    lines = export.splitlines()
    assert lines[0] == "category,month,orders,gross,discount,tax,total"
    assert lines[1].startswith(",2025-02"), "пустая категория идёт первой"
    assert len(lines) == 40


def test_warnings_go_to_standard_output_in_order(tmp_path):
    """Предупреждения печатаются по ходу чтения, в порядке строк файла.

    Зафиксировано как есть: legacy пишет их в стандартный вывод, а в отчёт
    попадает только счётчик.
    """
    _, printed = run_legacy_with_output(tmp_path)

    warnings = [line for line in printed.splitlines() if line.startswith("WARN")]
    assert len(warnings) == 3
    # Порядок зафиксирован как есть: сначала нечисловые значения,
    # отрицательное количество проверяется позже и печатается последним.
    assert "ne chislo v zakaze ORD-9008" in warnings[0]
    assert "ne chislo v zakaze ORD-9009" in warnings[1]
    assert "otricatelnoe kolichestvo v zakaze ORD-9006" in warnings[2]


def test_warning_about_header_is_printed(tmp_path):
    """Заголовок не из десяти колонок даёт отдельное предупреждение."""
    # Заголовок из девяти колонок, а строка данных из десяти: так видно,
    # что замечание к заголовку не считается пропущенной строкой.
    csv_text = (
        "order_id,date,customer,category,item,qty,price,discount_code,status\n"
        "ORD-1,2025-03-11,CUST-1,books,Book,1,59.90,NONE,P,msk\n"
    )
    report, printed = run_legacy_with_output(tmp_path, csv_text)

    assert "strannyy zagolovok: 9" in printed
    assert value_after(report, "Предупреждений") == "1"
    assert value_after(report, "Пропущено из-за ошибок в данных") == "0"


def test_refund_reduces_item_total_in_top(tmp_path):
    """Возврат вычитается из суммы товара в разделе «Топ товаров»."""
    report, _ = run_legacy(
        tmp_path,
        make_csv(
            "ORD-1,2025-03-11,CUST-1,books,Book,1,100.00,NONE,P,msk",
            "ORD-2,2025-03-11,CUST-1,books,Book,1,40.00,NONE,R,msk",
        ),
    )

    assert " 1. Book" in report
    top_line = line_starting_with(report, " 1. Book")
    assert top_line.split()[-1] == "60.00"
