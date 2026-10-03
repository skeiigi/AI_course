/**
 * Формирование отчёта. Ширины колонок и порядок разделов проверяются здесь,
 * потому что у отчёта есть потребители, которые разбирают его построчно.
 */

import { describe, expect, it } from 'vitest';

import { buildExportRows, buildSummary } from '../src/aggregate.js';
import { categoryTitle, renderExportCsv, renderReport, sharePercent } from '../src/render.js';
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
    discountCode: 'SALE15',
    status: 'P',
    ...overrides,
  };
}

function loaded(orders: Order[]): LoadResult {
  return { orders, totalRows: orders.length, skipped: [], warnings: [] };
}

function reportOf(orders: Order[]): string {
  return renderReport(buildSummary(loaded(orders), HALF_UP), 'data/orders.csv');
}

function lineStartingWith(report: string, prefix: string): string {
  const found = report.split('\n').find((line) => line.startsWith(prefix));
  if (found === undefined) {
    throw new Error(`нет строки, начинающейся с «${prefix}»`);
  }
  return found;
}

describe('categoryTitle', () => {
  it('переводит известные категории', () => {
    expect(categoryTitle('electronics')).toBe('Электроника');
  });

  it('категорию без перевода печатает как есть', () => {
    expect(categoryTitle('toys')).toBe('toys');
  });

  it('пустую категорию называет «БЕЗ КАТЕГОРИИ»', () => {
    expect(categoryTitle('')).toBe('БЕЗ КАТЕГОРИИ');
  });
});

describe('sharePercent', () => {
  it('считает долю с одним знаком после запятой', () => {
    expect(sharePercent(2500, 10_000)).toBe(25);
    expect(sharePercent(1234, 10_000)).toBe(12.3);
  });

  it('на нулевом итоге не делит на ноль', () => {
    expect(sharePercent(0, 0)).toBe(0);
  });
});

describe('renderReport', () => {
  it('держит ширину рамки в 60 символов', () => {
    const lines = reportOf([order()]).split('\n');
    expect(lines[0]).toBe('='.repeat(60));
    expect(lines[9]).toBe('-'.repeat(60));
  });

  it('печатает шапку с именем файла и счётчиками', () => {
    const report = reportOf([order()]);
    expect(lineStartingWith(report, 'Файл:')).toBe('Файл: data/orders.csv');
    expect(lineStartingWith(report, 'Строк в файле:')).toBe('Строк в файле: 1');
    expect(lineStartingWith(report, 'Учтено заказов:')).toBe('Учтено заказов: 1');
  });

  it('держит колонки таблицы категорий на своих местах', () => {
    const report = reportOf([order()]);
    expect(lineStartingWith(report, 'Дом и сад')).toBe(
      'Дом и сад            1      11.10     1.67      1.89      11.32 100.0%',
    );
  });

  it('печатает все шесть разделов в фиксированном порядке', () => {
    const report = reportOf([order()]);
    const headings = [
      'ОТЧЕТ ПО ЗАКАЗАМ ИНТЕРНЕТ-МАГАЗИНА',
      'ВЫРУЧКА ПО КАТЕГОРИЯМ',
      'ВЫРУЧКА ПО МЕСЯЦАМ',
      'ТОП-5 ТОВАРОВ (без скидок и налога)',
      'ПРИМЕНЕНИЕ СКИДОК',
      'ВОЗВРАТЫ',
    ];
    const positions = headings.map((heading) => report.indexOf(`\n${heading}\n`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('обрезает длинное название категории до ширины колонки', () => {
    const report = reportOf([order({ category: 'очень-длинная-категория-заказов' })]);
    expect(lineStartingWith(report, 'очень-длинная-ка').slice(0, 17)).toBe('очень-длинная-ка ');
  });

  it('печатает сумму возвратов отрицательным числом', () => {
    const report = reportOf([order({ status: 'R', unitPriceCents: 10_000 })]);
    expect(lineStartingWith(report, 'Возвратов:')).toBe('Возвратов: 1, на сумму -120.00');
  });
});

describe('renderExportCsv', () => {
  it('печатает заголовок и строки в фиксированном формате', () => {
    const rows = buildExportRows([order()], HALF_UP);
    expect(renderExportCsv(rows)).toBe(
      'category,month,orders,gross,discount,tax,total\nhome,2025-01,1,11.10,1.67,1.89,11.32\n',
    );
  });
});
