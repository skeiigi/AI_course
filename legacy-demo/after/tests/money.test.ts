/**
 * Модуль денег. Самый маленький модуль проекта и самый ответственный:
 * ошибка округления, ради которой затевался практикум, живёт именно здесь.
 */

import { describe, expect, it } from 'vitest';

import {
  divideRoundHalfUp,
  formatCents,
  parseIntegerStrict,
  parseMoneyToCents,
} from '../src/money.js';

describe('divideRoundHalfUp', () => {
  it('округляет половину вверх, а не вниз', () => {
    expect(divideRoundHalfUp(16650, 100)).toBe(167);
    expect(divideRoundHalfUp(1665, 10)).toBe(167);
  });

  it('оставляет точные значения без изменений', () => {
    expect(divideRoundHalfUp(179400, 100)).toBe(1794);
    expect(divideRoundHalfUp(0, 100)).toBe(0);
  });

  it('округляет от нуля для отрицательных сумм', () => {
    expect(divideRoundHalfUp(-16650, 100)).toBe(-167);
  });

  it('не делит на ноль', () => {
    expect(() => divideRoundHalfUp(100, 0)).toThrow(RangeError);
  });
});

describe('parseMoneyToCents', () => {
  it('читает нормальные цены', () => {
    expect(parseMoneyToCents('11.10')).toBe(1110);
    expect(parseMoneyToCents('0.00')).toBe(0);
    expect(parseMoneyToCents('18.75')).toBe(1875);
    expect(parseMoneyToCents('5')).toBe(500);
    expect(parseMoneyToCents(' 89.99 ')).toBe(8999);
  });

  it('читает отрицательные суммы', () => {
    expect(parseMoneyToCents('-3.10')).toBe(-310);
  });

  it('отказывается разбирать мусор', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('two')).toBeNull();
    expect(parseMoneyToCents('12,50')).toBeNull();
  });

  it('не глотает хвост после числа, в отличие от parseFloat', () => {
    expect(Number.parseFloat('12abc')).toBe(12);
    expect(parseMoneyToCents('12abc')).toBeNull();
  });
});

describe('parseIntegerStrict', () => {
  it('читает целые количества', () => {
    expect(parseIntegerStrict('3')).toBe(3);
    expect(parseIntegerStrict('0')).toBe(0);
    expect(parseIntegerStrict('-1')).toBe(-1);
  });

  it('не округляет дробное молча, в отличие от parseInt', () => {
    expect(Number.parseInt('1.9', 10)).toBe(1);
    expect(parseIntegerStrict('1.9')).toBeNull();
  });

  it('отказывается разбирать мусор', () => {
    expect(parseIntegerStrict('two')).toBeNull();
    expect(parseIntegerStrict('')).toBeNull();
  });
});

describe('formatCents', () => {
  it('печатает две цифры после точки', () => {
    expect(formatCents(1110)).toBe('11.10');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(-160598)).toBe('-1605.98');
  });
});
