"""Точка входа отчёта по заказам.

Запуск:

    python main.py                      обычный расчёт
    python main.py --legacy-rounding    расчёт с округлением как в legacy
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from orders_report import aggregate, config, loader, reporting


def parse_args(argv: list) -> argparse.Namespace:
    """Разбирает аргументы командной строки."""
    parser = argparse.ArgumentParser(description="Отчёт по заказам интернет-магазина")
    parser.add_argument("--orders", default="orders.csv", help="файл с заказами")
    parser.add_argument("--out-dir", default="out", help="папка для результатов")
    parser.add_argument(
        "--legacy-rounding",
        action="store_true",
        help="считать скидку как legacy-версия (для сверки поведения)",
    )
    parser.add_argument("--quiet", action="store_true", help="не печатать отчёт")
    return parser.parse_args(argv)


def main(argv: list) -> int:
    """Читает заказы, считает отчёт, пишет результаты."""
    args = parse_args(argv)
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")

    settings = config.Settings(
        orders_path=Path(args.orders),
        output_dir=Path(args.out_dir),
        legacy_discount_rounding=args.legacy_rounding,
    )

    loaded = loader.load_orders(settings.orders_path)
    summary = aggregate.build_summary(loaded, settings)
    text, exported = reporting.write_outputs(loaded, summary, settings)

    if not args.quiet:
        print(text)
    print("Выгружено строк в %s: %d" % (settings.export_path, exported))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
