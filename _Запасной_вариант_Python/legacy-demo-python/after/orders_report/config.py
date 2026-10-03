"""Бизнес-константы и настройки запуска.

Все числа, которые в legacy-версии были разбросаны по коду, собраны здесь
и названы. Менять правила расчёта нужно в этом файле.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Dict

#: Шаг округления денежных сумм: одна копейка.
CENT = Decimal("0.01")

#: Ставка налога, применяется к сумме после скидки.
TAX_RATE = Decimal("0.20")

#: Заказ дороже этой суммы получает дополнительные проценты скидки.
LARGE_ORDER_THRESHOLD = Decimal("1000")

#: Сколько процентов добавляется к скидке за крупный заказ.
LARGE_ORDER_BONUS_PERCENT = Decimal("5")

#: Больше этого процента скидка не даётся ни при каких условиях.
MAX_DISCOUNT_PERCENT = Decimal("25")

#: Сколько товаров показывать в разделе «Топ товаров».
TOP_ITEMS_COUNT = 5

#: Ширина текстового отчёта в символах.
REPORT_WIDTH = 60

#: Метка месяца для заказов, у которых дату разобрать не удалось.
UNKNOWN_MONTH = "0000-00"

#: Как называется категория, если в файле она пустая.
NO_CATEGORY_TITLE = "БЕЗ КАТЕГОРИИ"

#: Статусы заказа в исходном файле.
STATUS_PAID = "P"
STATUS_REFUND = "R"
STATUS_CANCELLED = "C"

#: Сколько колонок ожидается в файле заказов.
EXPECTED_COLUMNS = 10

#: Процент скидки по коду. Неизвестный код скидки не даёт.
DISCOUNT_PERCENT_BY_CODE: Dict[str, Decimal] = {
    "NONE": Decimal("0"),
    "SALE5": Decimal("5"),
    "SALE10": Decimal("10"),
    "SALE15": Decimal("15"),
    "VIP20": Decimal("20"),
}

#: Человеческие названия категорий. Категории без названия печатаются как есть.
CATEGORY_TITLES: Dict[str, str] = {
    "electronics": "Электроника",
    "books": "Книги",
    "clothing": "Одежда",
    "home": "Дом и сад",
    "sports": "Спорт",
}


@dataclass(frozen=True)
class Settings:
    """Параметры одного запуска отчёта."""

    orders_path: Path
    output_dir: Path
    legacy_discount_rounding: bool = False

    @property
    def report_path(self) -> Path:
        """Путь к текстовому отчёту."""
        return self.output_dir / "report.txt"

    @property
    def export_path(self) -> Path:
        """Путь к CSV-выгрузке."""
        return self.output_dir / "revenue.csv"
