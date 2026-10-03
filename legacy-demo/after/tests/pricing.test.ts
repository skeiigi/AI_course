/**
 * Правила расчёта денег по одной строке заказа.
 *
 * Обратите внимание на `скидка округляется по правилу «половина вверх»`.
 * Тот же случай зафиксирован в характеризующем тесте исходной версии
 * с прежним, неверным значением. Ожидание изменено вместе с исправлением
 * расчёта, а не подогнано под новый код.
 */

import { describe, expect, it } from 'vitest';

import { calculateLine, discountCents, discountPercent, grossCents } from '../src/pricing.js';
import type { Order } from '../src/types.js';

function order(overrides: Partial<Order> = {}): Order {
  return {
    orderId: 'ORD-1',
    month: '2025-01',
    customer: 'CUST-1',
    category: 'home',
    item: 'Plant pot',
    quantity: 1,
    unitPriceCents: 1110,
    discountCode: 'SALE15',
    status: 'P',
    ...overrides,
  };
}

describe('grossCents', () => {
  it('умножает количество на цену', () => {
    expect(grossCents(order({ quantity: 3, unitPriceCents: 2990 }))).toBe(8970);
  });

  it('у возврата валовая сумма отрицательная', () => {
    expect(grossCents(order({ status: 'R', quantity: 1, unitPriceCents: 10000 }))).toBe(-10000);
  });
});

describe('discountPercent', () => {
  it('берёт процент из кода скидки', () => {
    expect(discountPercent(1110, 'SALE15', 'P')).toBe(15);
    expect(discountPercent(1110, 'NONE', 'P')).toBe(0);
  });

  it('незнакомый код скидки не даёт', () => {
    expect(discountPercent(1110, 'PROMO99', 'P')).toBe(0);
  });

  it('заказ дороже 1000 получает пять дополнительных процентов', () => {
    expect(discountPercent(151_200, 'SALE15', 'P')).toBe(20);
  });

  it('общая скидка ограничена 25 процентами', () => {
    expect(discountPercent(151_200, 'VIP20', 'P')).toBe(25);
  });

  it('порог применяется строго больше, а не больше или равно', () => {
    expect(discountPercent(100_000, 'SALE15', 'P')).toBe(15);
    expect(discountPercent(100_001, 'SALE15', 'P')).toBe(20);
  });

  it('возврату скидка не полагается', () => {
    expect(discountPercent(-10_000, 'VIP20', 'R')).toBe(0);
  });
});

describe('discountCents', () => {
  it('скидка округляется по правилу «половина вверх»', () => {
    expect(discountCents(1110, 15, 'half-up')).toBe(167);
  });

  it('режим совместимости повторяет усечение исходной версии', () => {
    expect(discountCents(1110, 15, 'legacy-truncate')).toBe(166);
  });

  it('на суммах без третьего знака оба режима совпадают', () => {
    expect(discountCents(151_200, 20, 'half-up')).toBe(30_240);
    expect(discountCents(151_200, 20, 'legacy-truncate')).toBe(30_240);
  });
});

describe('calculateLine', () => {
  it('считает скидку, налог и итог по строке заказа', () => {
    const amounts = calculateLine(order(), { rounding: 'half-up' });
    expect(amounts).toEqual({
      grossCents: 1110,
      discountCents: 167,
      netCents: 943,
      taxCents: 189,
      totalCents: 1132,
    });
  });

  it('в режиме совместимости даёт числа исходной версии', () => {
    const amounts = calculateLine(order(), { rounding: 'legacy-truncate' });
    expect(amounts.discountCents).toBe(166);
    expect(amounts.totalCents).toBe(1133);
  });

  it('без скидки и налога остаётся валовая сумма', () => {
    const amounts = calculateLine(order(), {
      rounding: 'half-up',
      applyDiscount: false,
      applyTax: false,
    });
    expect(amounts.grossCents).toBe(1110);
    expect(amounts.discountCents).toBe(0);
    expect(amounts.taxCents).toBe(0);
    expect(amounts.totalCents).toBe(1110);
  });

  it('возврат уменьшает выручку и скидки не получает', () => {
    const amounts = calculateLine(
      order({ status: 'R', unitPriceCents: 10_000, discountCode: 'SALE15' }),
      { rounding: 'half-up' },
    );
    expect(amounts.grossCents).toBe(-10_000);
    expect(amounts.discountCents).toBe(0);
    expect(amounts.taxCents).toBe(-2000);
    expect(amounts.totalCents).toBe(-12_000);
  });
});
