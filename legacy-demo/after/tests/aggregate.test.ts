/**
 * Агрегация. Проверяется то, что в исходной версии было размазано
 * по трём копиям одного расчёта: суммы по группам, топ товаров и выгрузка.
 */

import { describe, expect, it } from 'vitest';

import { buildExportRows, buildSummary, buildTopItems, compareKeys } from '../src/aggregate.js';
import type { LoadResult, Order } from '../src/types.js';

const HALF_UP = { rounding: 'half-up' } as const;

function order(overrides: Partial<Order> = {}): Order {
  return {
    orderId: 'ORD-1',
    month: '2025-01',
    customer: 'CUST-1',
    category: 'home',
    item: 'Plant pot',
    quantity: 1,
    unitPriceCents: 1110,
    discountCode: 'NONE',
    status: 'P',
    ...overrides,
  };
}

function loaded(orders: Order[], skipped = 0): LoadResult {
  return {
    orders,
    totalRows: orders.length + skipped,
    skipped: Array.from({ length: skipped }, (_, index) => ({
      rowNumber: index + 1,
      orderId: `ORD-BAD-${index}`,
      reason: 'не число',
    })),
    warnings: Array.from({ length: skipped }, () => 'не число'),
  };
}

describe('buildSummary', () => {
  it('считает заказы по категориям, месяцам и кодам скидок', () => {
    const summary = buildSummary(
      loaded([
        order({ category: 'home', month: '2025-01', discountCode: 'SALE15' }),
        order({ category: 'books', month: '2025-02', discountCode: 'NONE' }),
      ]),
      HALF_UP,
    );

    expect(summary.categories.get('home')?.orders).toBe(1);
    expect(summary.categories.get('home')?.discountCents).toBe(167);
    expect(summary.months.get('2025-02')?.orders).toBe(1);
    expect(summary.discountCodes.get('SALE15')?.orders).toBe(1);
  });

  it('отменённый заказ не попадает ни в одну сумму', () => {
    const summary = buildSummary(
      loaded([order({ status: 'C' }), order({ status: 'P' })]),
      HALF_UP,
    );
    expect(summary.cancelledOrders).toBe(1);
    expect(summary.countedOrders).toBe(1);
    expect(summary.categories.get('home')?.orders).toBe(1);
  });

  it('учтённые заказы равны строкам минус пропущенные минус отменённые', () => {
    const summary = buildSummary(loaded([order(), order({ status: 'C' })], 2), HALF_UP);
    expect(summary.totalRows).toBe(4);
    expect(summary.skippedRows).toBe(2);
    expect(summary.cancelledOrders).toBe(1);
    expect(summary.countedOrders).toBe(1);
  });

  it('возвраты считаются отдельно и уменьшают выручку', () => {
    const summary = buildSummary(
      loaded([order({ status: 'R', unitPriceCents: 10_000 })]),
      HALF_UP,
    );
    expect(summary.refundCount).toBe(1);
    expect(summary.refundTotalCents).toBe(-12_000);
    expect(summary.grandTotalCents).toBe(-12_000);
  });
});

describe('buildTopItems', () => {
  it('считает по валовой сумме, без скидок и налога', () => {
    const items = buildTopItems(
      [order({ item: 'Shelf wood', unitPriceCents: 7690, discountCode: 'VIP20' })],
      HALF_UP,
    );
    expect(items).toEqual([{ item: 'Shelf wood', grossCents: 7690 }]);
  });

  it('складывает одинаковые товары и отбрасывает отменённые', () => {
    const items = buildTopItems(
      [
        order({ item: 'Mug', unitPriceCents: 715, quantity: 2 }),
        order({ item: 'Mug', unitPriceCents: 715, quantity: 1 }),
        order({ item: 'Mug', unitPriceCents: 715, quantity: 5, status: 'C' }),
      ],
      HALF_UP,
    );
    expect(items).toEqual([{ item: 'Mug', grossCents: 2145 }]);
  });

  it('при равных суммах сортирует по имени товара', () => {
    const items = buildTopItems(
      [order({ item: 'Bottle' }), order({ item: 'Apron' })],
      HALF_UP,
    );
    expect(items.map((entry) => entry.item)).toEqual(['Apron', 'Bottle']);
  });

  it('оставляет не больше пяти строк', () => {
    const orders = ['a', 'b', 'c', 'd', 'e', 'f'].map((item, index) =>
      order({ item, unitPriceCents: (index + 1) * 100 }),
    );
    expect(buildTopItems(orders, HALF_UP)).toHaveLength(5);
  });
});

describe('buildExportRows', () => {
  it('группирует по категории и месяцу', () => {
    const rows = buildExportRows(
      [
        order({ category: 'home', month: '2025-01' }),
        order({ category: 'home', month: '2025-01' }),
        order({ category: 'books', month: '2025-02' }),
      ],
      HALF_UP,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.category).toBe('books');
    expect(rows[1]?.orders).toBe(2);
  });

  it('пустая категория идёт первой', () => {
    const rows = buildExportRows(
      [order({ category: 'books' }), order({ category: '' })],
      HALF_UP,
    );
    expect(rows[0]?.category).toBe('');
  });
});

describe('compareKeys', () => {
  it('сравнивает по кодам символов, а не по правилам языка', () => {
    expect(compareKeys('SALE10', 'SALE5')).toBe(-1);
    expect(compareKeys('SALE5', 'SALE10')).toBe(1);
    expect(compareKeys('home', 'home')).toBe(0);
  });
});
