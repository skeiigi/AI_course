/**
 * Чтение файла заказов.
 *
 * Единственный слой, который знает про CSV. Наверх отдаёт список `Order`
 * и список пропущенных строк с причинами. Ошибочная строка не роняет разбор,
 * но и не теряется молча: она попадает в `skipped` и видна в отчёте.
 */

import { readFileSync } from 'node:fs';

import * as config from './config.js';
import { parseIntegerStrict, parseMoneyToCents } from './money.js';
import type { LoadResult, Order, OrderStatus, RowOutcome, SkippedRow } from './types.js';

/** Порядок колонок в файле заказов. */
const COLUMN = {
  orderId: 0,
  date: 1,
  customer: 2,
  category: 3,
  item: 4,
  quantity: 5,
  price: 6,
  discountCode: 7,
  status: 8,
  region: 9,
} as const;

/**
 * Метка месяца вида `2025-03`.
 *
 * Дата в чужом формате не считается ошибкой строки: заказ попадает в отчёт,
 * но в отдельную группу `0000-00`. Так было в legacy-версии, и менять это
 * без согласования с потребителем отчёта нельзя.
 */
export function parseMonth(dateText: string): string {
  const parts = dateText.trim().split('-');
  if (parts.length !== 3) {
    return config.UNKNOWN_MONTH;
  }
  const [year = '', month = '', day = ''] = parts;
  const monthNumber = parseIntegerStrict(month);
  const dayNumber = parseIntegerStrict(day);
  if (monthNumber === null || dayNumber === null) {
    return config.UNKNOWN_MONTH;
  }
  if (monthNumber < 1 || monthNumber > 12 || dayNumber > 31) {
    return config.UNKNOWN_MONTH;
  }
  return `${year}-${month}`;
}

/** Статус строки. Всё, что не `R` и не `C`, считается оплаченным заказом. */
export function parseStatus(raw: string): OrderStatus {
  const value = raw.trim();
  return value === 'R' || value === 'C' ? value : 'P';
}

/** Разбирает одну строку CSV. Результат явный: либо заказ, либо причина отказа. */
export function parseRow(columns: readonly string[], rowNumber: number): RowOutcome {
  if (columns.length < config.EXPECTED_COLUMNS) {
    return { ok: false, reason: `короткая строка номер ${rowNumber}` };
  }

  const orderId = (columns[COLUMN.orderId] ?? '').trim();
  const quantity = parseIntegerStrict(columns[COLUMN.quantity] ?? '');
  const unitPriceCents = parseMoneyToCents(columns[COLUMN.price] ?? '');

  if (quantity === null || unitPriceCents === null) {
    return { ok: false, reason: `не число в заказе ${orderId}` };
  }
  if (quantity < 0) {
    return { ok: false, reason: `отрицательное количество в заказе ${orderId}` };
  }

  return {
    ok: true,
    order: {
      orderId,
      month: parseMonth(columns[COLUMN.date] ?? ''),
      customer: (columns[COLUMN.customer] ?? '').trim(),
      category: (columns[COLUMN.category] ?? '').trim(),
      item: (columns[COLUMN.item] ?? '').trim(),
      quantity,
      unitPriceCents,
      discountCode: (columns[COLUMN.discountCode] ?? '').trim(),
      status: parseStatus(columns[COLUMN.status] ?? ''),
    },
  };
}

/** Разбивает текст файла на строки колонок. Кавычки в этих данных не используются. */
function splitRows(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0)
    .map((line) => line.split(','));
}

/** Читает файл заказов целиком. */
export function loadOrders(path: string): LoadResult {
  const rows = splitRows(readFileSync(path, 'utf8'));
  const header = rows[0];
  const orders: Order[] = [];
  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];

  if (header !== undefined && header.length !== config.EXPECTED_COLUMNS) {
    warnings.push(`неожиданный заголовок: ${header.length} колонок`);
  }

  let rowNumber = 0;
  for (const columns of rows.slice(1)) {
    rowNumber += 1;
    const outcome = parseRow(columns, rowNumber);
    if (outcome.ok) {
      orders.push(outcome.order);
    } else {
      skipped.push({
        rowNumber,
        orderId: (columns[COLUMN.orderId] ?? '').trim(),
        reason: outcome.reason,
      });
      warnings.push(outcome.reason);
    }
  }

  return { orders, totalRows: rowNumber, skipped, warnings };
}
