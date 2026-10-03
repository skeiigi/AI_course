"""Типы данных, которыми обмениваются слои."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import List

from . import config


@dataclass(frozen=True)
class Order:
    """Одна строка файла заказов, уже разобранная и проверенная."""

    order_id: str
    month: str
    customer: str
    category: str
    item: str
    quantity: int
    unit_price: Decimal
    discount_code: str
    status: str

    @property
    def is_cancelled(self) -> bool:
        """Отменённый заказ не участвует в выручке."""
        return self.status == config.STATUS_CANCELLED

    @property
    def is_refund(self) -> bool:
        """Возврат уменьшает выручку."""
        return self.status == config.STATUS_REFUND


@dataclass(frozen=True)
class LineAmounts:
    """Денежные суммы по одной строке заказа."""

    gross: Decimal
    discount: Decimal
    net: Decimal
    tax: Decimal
    total: Decimal


@dataclass
class LoadResult:
    """Результат чтения файла заказов."""

    orders: List[Order] = field(default_factory=list)
    total_rows: int = 0
    # Строки, которые не удалось разобрать.
    skipped: List[str] = field(default_factory=list)
    # Все предупреждения, включая замечания к заголовку файла.
    # Заголовок не является строкой данных, поэтому величины разные.
    warnings: List[str] = field(default_factory=list)

    @property
    def skipped_rows(self) -> int:
        """Сколько строк не удалось разобрать."""
        return len(self.skipped)


@dataclass
class Bucket:
    """Накопленные суммы по одной группе: категории, месяцу или коду скидки."""

    orders: int = 0
    gross: Decimal = Decimal("0.00")
    discount: Decimal = Decimal("0.00")
    tax: Decimal = Decimal("0.00")
    total: Decimal = Decimal("0.00")

    def add(self, amounts: "LineAmounts") -> None:
        """Прибавляет к накопителю суммы одной строки заказа."""
        self.orders += 1
        self.gross += amounts.gross
        self.discount += amounts.discount
        self.tax += amounts.tax
        self.total += amounts.total
