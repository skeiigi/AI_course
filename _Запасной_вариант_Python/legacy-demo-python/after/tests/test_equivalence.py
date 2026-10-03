"""Доказательство эквивалентности: исходная версия и версия после
рефакторинга дают на одних данных один и тот же результат.

Тест запускает настоящие ``legacy_report.py`` и ``after/main.py``
в отдельных временных папках и сравнивает файлы результата. Сравнение
с золотыми файлами тут не подошло бы: если золотые файлы когда-нибудь
устареют, такой тест этого не заметит.

    python -m pytest after/tests/test_equivalence.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List

import pytest

PROJECT = Path(__file__).resolve().parents[2]
ORDERS = PROJECT / "orders.csv"
LEGACY = PROJECT / "legacy_report.py"
AFTER = PROJECT / "after" / "main.py"


@dataclass
class RunResult:
    """Файлы, которые оставил после себя один прогон."""

    report: str
    exported: str


def run_version(tmp_path: Path, name: str, args: List[str]) -> RunResult:
    """Запускает одну из версий в своей папке и возвращает её результаты."""
    work_dir = tmp_path / name
    work_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(ORDERS, work_dir / "orders.csv")

    env_path = str(PROJECT / "after")
    finished = subprocess.run(
        [sys.executable, *args],
        cwd=work_dir,
        capture_output=True,
        text=True,
        env={"PYTHONPATH": env_path, "PATH": "/usr/bin:/bin"},
    )
    assert finished.returncode == 0, finished.stderr

    return RunResult(
        report=(work_dir / "out" / "report.txt").read_text(encoding="utf-8"),
        exported=(work_dir / "out" / "revenue.csv").read_text(encoding="utf-8"),
    )


@pytest.fixture(scope="module")
def runs(tmp_path_factory) -> dict:
    """Три прогона: legacy, новая версия в режиме совместимости, исправленная."""
    base = tmp_path_factory.mktemp("equivalence")
    return {
        "legacy": run_version(base, "legacy", [str(LEGACY), "orders.csv"]),
        "compat": run_version(base, "compat", [str(AFTER), "--legacy-rounding", "--quiet"]),
        "fixed": run_version(base, "fixed", [str(AFTER), "--quiet"]),
    }


def category_cells(report: str, title: str) -> List[str]:
    """Числа строки таблицы категорий: заказы, сумма, скидка, налог, итог, доля."""
    for line in report.split("\n"):
        if line.startswith(title):
            return line[16:].strip().split()
    raise AssertionError("нет строки категории «%s»" % title)


def line_starting(report: str, prefix: str) -> str:
    for line in report.split("\n"):
        if line.startswith(prefix):
            return line
    raise AssertionError("нет строки, начинающейся с «%s»" % prefix)


# ---------------------------------------------------------------------------
# Шаг 1: рефакторинг не изменил поведение
# ---------------------------------------------------------------------------


def test_report_matches_legacy_character_by_character(runs) -> None:
    """Отчёт в режиме совместимости совпадает с legacy символ в символ."""
    assert runs["compat"].report == runs["legacy"].report


def test_export_matches_legacy_character_by_character(runs) -> None:
    """Выгрузка в режиме совместимости совпадает с legacy символ в символ."""
    assert runs["compat"].exported == runs["legacy"].exported


# ---------------------------------------------------------------------------
# Шаг 2: исправлена только ошибка округления
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "prefix", ["Строк в файле:", "Учтено заказов:", "Отменённых:", "Предупреждений:"]
)
def test_counters_are_not_affected(runs, prefix: str) -> None:
    """Счётчики заказов исправление не затрагивает."""
    assert line_starting(runs["fixed"].report, prefix) == line_starting(
        runs["legacy"].report, prefix
    )


@pytest.mark.parametrize(
    "title", ["Электроника", "Книги", "Одежда", "Дом и сад", "Спорт", "toys"]
)
def test_gross_by_category_is_not_affected(runs, title: str) -> None:
    """Валовые суммы и число заказов по категориям не изменились."""
    legacy_cells = category_cells(runs["legacy"].report, title)
    fixed_cells = category_cells(runs["fixed"].report, title)
    assert fixed_cells[0] == legacy_cells[0]
    assert fixed_cells[1] == legacy_cells[1]


def test_discount_grew_by_fifty_kopecks(runs) -> None:
    """Сумма скидок выросла на 50 копеек: это и есть недобор от усечения."""
    assert category_cells(runs["legacy"].report, "ИТОГО")[2] == "1404.22"
    assert category_cells(runs["fixed"].report, "ИТОГО")[2] == "1404.72"


def test_top_items_section_is_untouched(runs) -> None:
    """Раздел «Топ товаров» не затронут: он считается без скидок."""

    def section(report: str) -> List[str]:
        after_header = report.split("ТОП-5 ТОВАРОВ")[1]
        return after_header.split("ПРИМЕНЕНИЕ СКИДОК")[0].split("\n")

    assert section(runs["fixed"].report) == section(runs["legacy"].report)


def test_export_changed_only_in_money_columns(runs) -> None:
    """В выгрузке изменились только колонки скидки, налога и итога."""
    legacy_rows = runs["legacy"].exported.strip().split("\n")[1:]
    fixed_rows = runs["fixed"].exported.strip().split("\n")[1:]
    assert len(fixed_rows) == len(legacy_rows)

    changed = 0
    for before_row, after_row in zip(legacy_rows, fixed_rows):
        before = before_row.split(",")
        after = after_row.split(",")
        # Категория, месяц, число заказов и валовая сумма остаются прежними.
        assert after[:4] == before[:4]
        if after[4:] != before[4:]:
            changed += 1

    assert changed > 0, "исправление обязано быть заметно"
