/**
 * Чтение файла заказов. Главное здесь: плохая строка обрабатывается явно.
 * В исходной версии это был `continue` внутри двухсотстрочной функции,
 * здесь это значение типа `RowOutcome`, которое нельзя не проверить.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadOrders, parseMonth, parseRow, parseStatus } from '../src/loader.js';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORDERS = join(PROJECT, 'data', 'orders.csv');

const HEADER = 'order_id,date,customer,category,item,qty,price,discount_code,status,region';

function columnsOf(line: string): string[] {
  return line.split(',');
}

describe('parseMonth', () => {
  it('берёт год и месяц из даты', () => {
    expect(parseMonth('2025-03-14')).toBe('2025-03');
  });

  it('дата в чужом формате даёт 0000-00', () => {
    expect(parseMonth('2025.06.29')).toBe('0000-00');
    expect(parseMonth('')).toBe('0000-00');
  });

  it('несуществующие месяц и день дают 0000-00', () => {
    expect(parseMonth('2025-13-40')).toBe('0000-00');
    expect(parseMonth('2025-00-10')).toBe('0000-00');
  });
});

describe('parseStatus', () => {
  it('различает возврат и отмену', () => {
    expect(parseStatus('R')).toBe('R');
    expect(parseStatus('C')).toBe('C');
  });

  it('всё остальное считает оплаченным заказом', () => {
    expect(parseStatus('P')).toBe('P');
    expect(parseStatus('')).toBe('P');
    expect(parseStatus('x')).toBe('P');
  });
});

describe('parseRow', () => {
  it('разбирает нормальную строку', () => {
    const outcome = parseRow(
      columnsOf('ORD-1010,2025-01-06,CUST-056,home,Plant pot,1,11.10,SALE15,P,kra'),
      1,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.order).toEqual({
      orderId: 'ORD-1010',
      month: '2025-01',
      customer: 'CUST-056',
      category: 'home',
      item: 'Plant pot',
      quantity: 1,
      unitPriceCents: 1110,
      discountCode: 'SALE15',
      status: 'P',
    });
  });

  it('короткая строка отклоняется с указанием номера', () => {
    const outcome = parseRow(columnsOf('ORD-1,2025-01-06,CUST-1'), 7);
    expect(outcome).toEqual({ ok: false, reason: 'короткая строка номер 7' });
  });

  it('нечисловое количество отклоняется', () => {
    const outcome = parseRow(
      columnsOf('ORD-9008,2025-03-28,CUST-018,clothing,Jeans slim,two,59.90,SALE5,P,nsk'),
      1,
    );
    expect(outcome).toEqual({ ok: false, reason: 'не число в заказе ORD-9008' });
  });

  it('пустая цена отклоняется', () => {
    const outcome = parseRow(
      columnsOf('ORD-9009,2025-04-30,CUST-009,home,Desk lamp,2,,NONE,P,ekb'),
      1,
    );
    expect(outcome).toEqual({ ok: false, reason: 'не число в заказе ORD-9009' });
  });

  it('отрицательное количество отклоняется отдельной причиной', () => {
    const outcome = parseRow(
      columnsOf('ORD-9006,2025-06-02,CUST-047,sports,Yoga mat,-1,26.15,NONE,P,msk'),
      1,
    );
    expect(outcome).toEqual({
      ok: false,
      reason: 'отрицательное количество в заказе ORD-9006',
    });
  });

  it('нулевое количество ошибкой не считается', () => {
    const outcome = parseRow(
      columnsOf('ORD-9004,2025-04-07,CUST-005,home,Mug 350ml,0,7.15,NONE,P,ekb'),
      1,
    );
    expect(outcome.ok).toBe(true);
  });
});

describe('loadOrders на штатном файле', () => {
  it('читает все строки и отделяет плохие', () => {
    const loaded = loadOrders(ORDERS);
    expect(loaded.totalRows).toBe(219);
    expect(loaded.orders).toHaveLength(216);
    expect(loaded.skipped).toHaveLength(3);
    expect(loaded.warnings).toHaveLength(3);
  });

  it('называет каждую пропущенную строку по номеру и заказу', () => {
    const loaded = loadOrders(ORDERS);
    expect(loaded.skipped.map((row) => row.orderId)).toEqual([
      'ORD-9008',
      'ORD-9009',
      'ORD-9006',
    ]);
  });

  it('заголовок из десяти колонок предупреждений не вызывает', () => {
    expect(columnsOf(HEADER)).toHaveLength(10);
    expect(loadOrders(ORDERS).warnings.every((text) => !text.includes('заголовок'))).toBe(true);
  });
});
