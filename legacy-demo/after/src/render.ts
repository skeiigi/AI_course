/**
 * Формирование отчёта: из агрегатов в текст и в строки выгрузки.
 *
 * Слой не считает деньги. Он только раскладывает готовые числа по колонкам.
 * Ширины колонок и порядок разделов зафиксированы характеризующими тестами:
 * у отчёта есть потребители, которые разбирают его построчно.
 */

import * as config from './config.js';
import { formatCents } from './money.js';
import { compareKeys } from './aggregate.js';
import type { Bucket, ExportRow, Summary } from './types.js';

const EXPORT_HEADER = 'category,month,orders,gross,discount,tax,total';

/** Обрезает до ширины колонки и выравнивает влево. */
function left(value: string | number, width: number): string {
  return String(value).slice(0, width).padEnd(width, ' ');
}

/** Выравнивает вправо. */
function right(value: string | number, width: number): string {
  return String(value).padStart(width, ' ');
}

/** Денежная колонка фиксированной ширины. */
function money(cents: number, width: number): string {
  return right(formatCents(cents), width);
}

/** Русское название категории для печати. */
export function categoryTitle(categoryKey: string): string {
  if (categoryKey === '') {
    return config.NO_CATEGORY_TITLE;
  }
  return config.CATEGORY_TITLES[categoryKey] ?? categoryKey;
}

/** Доля группы в итоге, в процентах с одним знаком. */
export function sharePercent(partCents: number, wholeCents: number): number {
  const denominator = wholeCents === 0 ? 100 : wholeCents;
  return Math.round((partCents / denominator) * 1000) / 10;
}

/** Категории по убыванию итога, при равенстве по имени ключа. */
function sortedByTotal(buckets: ReadonlyMap<string, Bucket>): [string, Bucket][] {
  return [...buckets.entries()].sort(
    (a, b) => b[1].totalCents - a[1].totalCents || compareKeys(a[0], b[0]),
  );
}

/** Группы по возрастанию ключа: месяцы и коды скидок. */
function sortedByKey(buckets: ReadonlyMap<string, Bucket>): [string, Bucket][] {
  return [...buckets.entries()].sort((a, b) => compareKeys(a[0], b[0]));
}

function categoryRow(title: string, bucket: Bucket, share: string): string {
  return [
    left(title, 16),
    right(bucket.orders, 5),
    money(bucket.grossCents, 10),
    money(bucket.discountCents, 8),
    money(bucket.taxCents, 9),
    money(bucket.totalCents, 10),
    `${right(share, 5)}%`,
  ].join(' ');
}

/** Собирает текст отчёта целиком. */
export function renderReport(summary: Summary, ordersPath: string): string {
  const double = '='.repeat(config.REPORT_WIDTH);
  const single = '-'.repeat(config.REPORT_WIDTH);
  const lines: string[] = [];

  lines.push(double);
  lines.push('ОТЧЕТ ПО ЗАКАЗАМ ИНТЕРНЕТ-МАГАЗИНА');
  lines.push(double);
  lines.push(`Файл: ${ordersPath}`);
  lines.push(`Строк в файле: ${summary.totalRows}`);
  lines.push(`Учтено заказов: ${summary.countedOrders}`);
  lines.push(`Отменённых: ${summary.cancelledOrders}`);
  lines.push(`Пропущено из-за ошибок в данных: ${summary.skippedRows}`);
  lines.push('');

  lines.push(single);
  lines.push('ВЫРУЧКА ПО КАТЕГОРИЯМ');
  lines.push(single);
  lines.push(
    [
      left('Категория', 16),
      right('Зак.', 5),
      right('Сумма', 10),
      right('Скидки', 8),
      right('Налог', 9),
      right('Итого', 10),
      right('Доля', 6),
    ].join(' '),
  );

  const grandTotal: Bucket = {
    orders: 0,
    grossCents: 0,
    discountCents: 0,
    taxCents: 0,
    totalCents: 0,
  };

  for (const [key, bucket] of sortedByTotal(summary.categories)) {
    const share = sharePercent(bucket.totalCents, summary.grandTotalCents).toFixed(1);
    lines.push(categoryRow(categoryTitle(key), bucket, share));
    grandTotal.orders += bucket.orders;
    grandTotal.grossCents += bucket.grossCents;
    grandTotal.discountCents += bucket.discountCents;
    grandTotal.taxCents += bucket.taxCents;
    grandTotal.totalCents += bucket.totalCents;
  }

  lines.push(single);
  lines.push(categoryRow('ИТОГО', grandTotal, '100.0'));
  lines.push('');

  lines.push(single);
  lines.push('ВЫРУЧКА ПО МЕСЯЦАМ');
  lines.push(single);
  for (const [month, bucket] of sortedByKey(summary.months)) {
    lines.push(
      `${left(month, 10)} ${right(bucket.orders, 5)} заказов ${money(bucket.totalCents, 14)}`,
    );
  }
  lines.push('');

  lines.push(single);
  lines.push(`ТОП-${config.TOP_ITEMS_COUNT} ТОВАРОВ (без скидок и налога)`);
  lines.push(single);
  summary.topItems.forEach((entry, index) => {
    lines.push(`${right(index + 1, 2)}. ${left(entry.item, 30)} ${money(entry.grossCents, 14)}`);
  });
  lines.push('');

  lines.push(single);
  lines.push('ПРИМЕНЕНИЕ СКИДОК');
  lines.push(single);
  for (const [code, bucket] of sortedByKey(summary.discountCodes)) {
    lines.push(
      `${left(code, 10)} ${right(bucket.orders, 5)} заказов, скидок на ${money(bucket.discountCents, 10)}`,
    );
  }
  lines.push('');

  lines.push(single);
  lines.push('ВОЗВРАТЫ');
  lines.push(single);
  lines.push(
    `Возвратов: ${summary.refundCount}, на сумму ${formatCents(summary.refundTotalCents)}`,
  );
  lines.push('');

  lines.push(double);
  lines.push(`Предупреждений: ${summary.warningsCount}`);
  lines.push(double);

  return `${lines.join('\n')}\n`;
}

/** Собирает текст выгрузки `revenue.csv`. */
export function renderExportCsv(rows: readonly ExportRow[]): string {
  const lines = [EXPORT_HEADER];
  for (const row of rows) {
    lines.push(
      [
        row.category,
        row.month,
        String(row.orders),
        formatCents(row.grossCents),
        formatCents(row.discountCents),
        formatCents(row.taxCents),
        formatCents(row.totalCents),
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
