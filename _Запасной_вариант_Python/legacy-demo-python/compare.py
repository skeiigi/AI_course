# -*- coding: utf-8 -*-
"""Сверка legacy-версии и результата рефакторинга.

Скрипт запускает обе версии на одном и том же файле заказов и показывает,
где они расходятся.

Проверяются две вещи:

1. В режиме совместимости (``--legacy-rounding``) новая версия обязана
   повторить отчёт legacy символ в символ. Это доказательство того, что
   рефакторинг ничего не сломал.
2. В обычном режиме отличается ровно то, что мы исправили осознанно:
   округление скидки. Различия показываются построчно.

Запуск из папки проекта:

    python compare.py
"""

from __future__ import annotations

import difflib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
ORDERS = PROJECT / "orders.csv"
LEGACY = PROJECT / "legacy_report.py"
AFTER = PROJECT / "after" / "main.py"

MAX_DIFF_LINES = 14


def run_version(command: list, work_dir: Path) -> tuple:
    """Запускает одну версию отчёта и возвращает её файлы результата."""
    shutil.copy(ORDERS, work_dir / "orders.csv")

    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    finished = subprocess.run(
        command,
        cwd=str(work_dir),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    if finished.returncode != 0:
        print("Версия завершилась с ошибкой:", " ".join(command))
        print(finished.stdout)
        print(finished.stderr)
        raise SystemExit(2)

    report = (work_dir / "out" / "report.txt").read_text(encoding="utf-8")
    export = (work_dir / "out" / "revenue.csv").read_text(encoding="utf-8")
    return report, export


def show_diff(title: str, old_text: str, new_text: str) -> int:
    """Печатает различия двух текстов и возвращает их количество."""
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()
    diff = [
        line
        for line in difflib.unified_diff(old_lines, new_lines, "legacy", "after", n=0)
        if line.startswith(("+", "-")) and not line.startswith(("+++", "---"))
    ]

    print()
    print(title)
    print("-" * 60)
    if not diff:
        print("различий нет")
        return 0

    for line in diff[:MAX_DIFF_LINES]:
        print(line)
    if len(diff) > MAX_DIFF_LINES:
        print("... и ещё строк: %d" % (len(diff) - MAX_DIFF_LINES))
    return len(diff)


def main() -> int:
    """Прогоняет обе версии и печатает итог сверки."""
    if not ORDERS.exists():
        print("Не найден файл", ORDERS)
        return 2

    with tempfile.TemporaryDirectory() as raw_root:
        root = Path(raw_root)
        for name in ("legacy", "compat", "fixed"):
            (root / name).mkdir()

        legacy_report, legacy_export = run_version(
            [sys.executable, str(LEGACY)], root / "legacy"
        )
        compat_report, compat_export = run_version(
            [sys.executable, str(AFTER), "--legacy-rounding", "--quiet"],
            root / "compat",
        )
        fixed_report, fixed_export = run_version(
            [sys.executable, str(AFTER), "--quiet"], root / "fixed"
        )

    print("=" * 60)
    print("ШАГ 1. Рефакторинг без изменения поведения")
    print("=" * 60)
    print("legacy_report.py  против  after/main.py --legacy-rounding")

    same_report = legacy_report == compat_report
    same_export = legacy_export == compat_export
    print("Отчёт report.txt:      %s" % ("совпадает" if same_report else "РАСХОДИТСЯ"))
    print("Выгрузка revenue.csv:  %s" % ("совпадает" if same_export else "РАСХОДИТСЯ"))

    if not same_report:
        show_diff("Различия в отчёте", legacy_report, compat_report)
    if not same_export:
        show_diff("Различия в выгрузке", legacy_export, compat_export)

    print()
    print("=" * 60)
    print("ШАГ 2. Осознанное исправление ошибки округления")
    print("=" * 60)
    print("legacy_report.py  против  after/main.py")

    report_changes = show_diff("Различия в отчёте", legacy_report, fixed_report)
    export_changes = show_diff("Различия в выгрузке", legacy_export, fixed_export)

    print()
    print("=" * 60)
    if same_report and same_export and report_changes and export_changes:
        print("ИТОГ: поведение сохранено, исправлена только ошибка округления.")
        return 0

    print("ИТОГ: сверка не сошлась, разберитесь с различиями выше.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
