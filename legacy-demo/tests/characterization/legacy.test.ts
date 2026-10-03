/**
 * Характеризующие тесты исходной версии `legacy/report.js`.
 *
 * Эти тесты не проверяют, что программа работает правильно. Они фиксируют,
 * как она работает сегодня, включая известную ошибку округления скидки.
 * Пока такие тесты зелёные, менять код безопасно: любое изменение поведения
 * будет замечено сразу.
 *
 *     npm run test:characterization
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..', '..');
const LEGACY = join(PROJECT, 'legacy', 'report.js');
const ORDERS = join(PROJECT, 'data', 'orders.csv');
const GOLDEN = join(HERE, 'golden');

const HEADER = 'order_id,date,customer,category,item,qty,price,discount_code,status,region';

/** Ширина колонки с названием категории в таблице отчёта. */
const NAME_WIDTH = 16;

const workDirs: string[] = [];

afterEach(() => {
  while (workDirs.length > 0) {
    const dir = workDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

/** Собирает содержимое файла заказов из готовых строк. */
function makeCsv(...rows: string[]): string {
  return `${HEADER}\n${rows.join('\n')}\n`;
}

interface LegacyRun {
  readonly stdout: string;
  readonly report: string;
  readonly exported: string;
}

/** Запускает исходную версию в отдельной папке и возвращает её результаты. */
function runLegacy(csvText?: string): LegacyRun {
  const workDir = mkdtempSync(join(tmpdir(), 'legacy-char-'));
  workDirs.push(workDir);
  mkdirSync(join(workDir, 'data'), { recursive: true });

  if (csvText === undefined) {
    cpSync(ORDERS, join(workDir, 'data', 'orders.csv'));
  } else {
    writeFileSync(join(workDir, 'data', 'orders.csv'), csvText, 'utf8');
  }

  const finished = spawnSync(process.execPath, [LEGACY], { cwd: workDir, encoding: 'utf8' });
  expect(finished.status, finished.stderr ?? '').toBe(0);

  return {
    stdout: finished.stdout ?? '',
    report: readFileSync(join(workDir, 'out', 'report.txt'), 'utf8'),
    exported: readFileSync(join(workDir, 'out', 'revenue.csv'), 'utf8'),
  };
}

/** Находит в отчёте первую строку, начинающуюся с указанного текста. */
function lineStartingWith(report: string, prefix: string): string {
  const found = report.split('\n').find((line) => line.startsWith(prefix));
  if (found === undefined) {
    throw new Error(`в отчёте нет строки, начинающейся с «${prefix}»`);
  }
  return found;
}

/** Возвращает то, что стоит после двоеточия в строке отчёта. */
function valueAfter(report: string, prefix: string): string {
  const line = lineStartingWith(report, prefix);
  return line.slice(line.indexOf(':') + 1).trim();
}

/** Числа одной строки таблицы категорий: заказы, сумма, скидка, налог, итог, доля. */
function categoryCells(report: string, title: string): string[] {
  return lineStartingWith(report, title).slice(NAME_WIDTH).trim().split(/\s+/);
}

describe('отчёт целиком совпадает с эталоном', () => {
  it('report.txt на штатных данных совпадает символ в символ', () => {
    const run = runLegacy();
    expect(run.report).toBe(readFileSync(join(GOLDEN, 'report.txt'), 'utf8'));
  });

  it('revenue.csv на штатных данных совпадает символ в символ', () => {
    const run = runLegacy();
    expect(run.exported).toBe(readFileSync(join(GOLDEN, 'revenue.csv'), 'utf8'));
  });

  it('счётчики в шапке отчёта не меняются', () => {
    const { report } = runLegacy();
    expect(valueAfter(report, 'Строк в файле')).toBe('219');
    expect(valueAfter(report, 'Учтено заказов')).toBe('204');
    expect(valueAfter(report, 'Отменённых')).toBe('12');
    expect(valueAfter(report, 'Пропущено из-за ошибок в данных')).toBe('3');
  });

  it('предупреждения печатаются до отчёта и в том же порядке', () => {
    const { stdout } = runLegacy();
    const warnings = stdout.split('\n').filter((line) => line.startsWith('WARN:'));
    expect(warnings).toEqual([
      'WARN: ne chislo v zakaze ORD-9008',
      'WARN: ne chislo v zakaze ORD-9009',
      'WARN: otricatelnoe kolichestvo v zakaze ORD-9006',
    ]);
  });
});

describe('зафиксированная ошибка: скидка усекается вместо округления', () => {
  // 15 процентов от 11,10 равны 1,665. По правилам округления денег это 1,67.
  // Исходная версия отбрасывает третий знак и получает 1,66. Тест фиксирует
  // текущее, неверное значение. Менять его можно только вместе с осознанным
  // исправлением расчёта.
  const LEGACY_DISCOUNT = '1.66';
  const CORRECT_DISCOUNT = '1.67';

  it('строка ORD-1010 из data/orders.csv считается с усечением', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1010,2025-01-06,CUST-056,home,Plant pot,1,11.10,SALE15,P,kra'),
    );
    const cells = categoryCells(report, 'Дом и сад');
    expect(cells[1]).toBe('11.10');
    expect(cells[2]).toBe(LEGACY_DISCOUNT);
    expect(cells[2]).not.toBe(CORRECT_DISCOUNT);
  });

  it('ошибка в скидке тянет за собой налог и итог', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1010,2025-01-06,CUST-056,home,Plant pot,1,11.10,SALE15,P,kra'),
    );
    const cells = categoryCells(report, 'Дом и сад');
    expect(cells[3]).toBe('1.89');
    expect(cells[4]).toBe('11.33');
  });

  it('на штатных данных недобор скидок виден в итоговой строке', () => {
    const { report } = runLegacy();
    expect(categoryCells(report, 'ИТОГО')[2]).toBe('1404.22');
  });
});

describe('правила расчёта', () => {
  it('заказ дороже 1000 получает пять дополнительных процентов скидки', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025-01-10,CUST-1,electronics,Monitor 24,8,189.00,SALE15,P,msk'),
    );
    const cells = categoryCells(report, 'Электроника');
    expect(cells[1]).toBe('1512.00');
    expect(cells[2]).toBe('302.40');
  });

  it('общая скидка не превышает 25 процентов', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025-01-10,CUST-1,electronics,Monitor 24,8,189.00,VIP20,P,msk'),
    );
    expect(categoryCells(report, 'Электроника')[2]).toBe('378.00');
  });

  it('возврат уменьшает выручку и скидки не получает', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025-02-01,CUST-1,books,Book,1,100.00,SALE15,R,msk'),
    );
    const cells = categoryCells(report, 'Книги');
    expect(cells[1]).toBe('-100.00');
    expect(cells[2]).toBe('0.00');
    expect(lineStartingWith(report, 'Возвратов').endsWith('-120.00')).toBe(true);
  });

  it('отменённый заказ не попадает ни в одну сумму', () => {
    const { report } = runLegacy(
      makeCsv(
        'ORD-1,2025-02-01,CUST-1,books,Book,1,100.00,NONE,P,msk',
        'ORD-2,2025-02-01,CUST-2,books,Book,1,100.00,NONE,C,msk',
      ),
    );
    expect(valueAfter(report, 'Отменённых')).toBe('1');
    expect(valueAfter(report, 'Учтено заказов')).toBe('1');
    expect(categoryCells(report, 'Книги')[0]).toBe('1');
  });

  it('строка с нулевой ценой остаётся заказом с нулевой выручкой', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025-02-01,CUST-1,books,Sample,1,0.00,NONE,P,msk'),
    );
    expect(valueAfter(report, 'Учтено заказов')).toBe('1');
    expect(categoryCells(report, 'Книги')[1]).toBe('0.00');
  });

  it('строки с нечисловыми полями и отрицательным количеством пропускаются', () => {
    const { report } = runLegacy(
      makeCsv(
        'ORD-1,2025-02-01,CUST-1,books,Book,two,59.90,NONE,P,msk',
        'ORD-2,2025-02-01,CUST-2,books,Book,-1,59.90,NONE,P,msk',
        'ORD-3,2025-02-01,CUST-3,books,Book,1,59.90,NONE,P,msk',
      ),
    );
    expect(valueAfter(report, 'Пропущено из-за ошибок в данных')).toBe('2');
    expect(valueAfter(report, 'Предупреждений')).toBe('2');
  });
});

describe('особенности формата, которые легко потерять при миграции', () => {
  it('пустая категория печатается как «БЕЗ КАТЕГОРИИ»', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025-02-01,CUST-1,,Gift card,1,50.00,NONE,P,msk'),
    );
    expect(categoryCells(report, 'БЕЗ КАТЕГОРИИ')[1]).toBe('50.00');
  });

  it('для категории toys перевода нет, печатается английский ключ', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025-02-01,CUST-1,toys,Toy car,1,50.00,NONE,P,msk'),
    );
    expect(categoryCells(report, 'toys')[1]).toBe('50.00');
  });

  it('незнакомый код скидки молча трактуется как нулевая скидка', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025-02-01,CUST-1,books,Book,1,50.00,PROMO99,P,msk'),
    );
    expect(categoryCells(report, 'Книги')[2]).toBe('0.00');
    expect(lineStartingWith(report, 'PROMO99').trim().split(/\s+/)[1]).toBe('1');
  });

  it('дата в чужом формате даёт месяц 0000-00, а не ошибку', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025.02.01,CUST-1,books,Book,1,50.00,NONE,P,msk'),
    );
    expect(lineStartingWith(report, '0000-00').trim().split(/\s+/)[1]).toBe('1');
  });

  it('возврат уменьшает сумму товара в топе', () => {
    const { report } = runLegacy(
      makeCsv(
        'ORD-1,2025-01-06,CUST-1,home,Plant pot,3,11.10,NONE,P,kra',
        'ORD-2,2025-01-07,CUST-2,home,Plant pot,1,11.10,NONE,R,kra',
      ),
    );
    const topLine = lineStartingWith(report, ' 1. Plant pot').trim().split(/\s+/);
    expect(topLine[topLine.length - 1]).toBe('22.20');
  });

  it('топ товаров считается по валовой сумме, а таблица категорий по итогу', () => {
    const { report } = runLegacy(
      makeCsv('ORD-1,2025-01-06,CUST-1,home,Plant pot,1,11.10,SALE15,P,kra'),
    );
    expect(categoryCells(report, 'Дом и сад')[4]).toBe('11.33');
    const topLine = lineStartingWith(report, ' 1. Plant pot').trim().split(/\s+/);
    expect(topLine[topLine.length - 1]).toBe('11.10');
  });

  it('заголовок выгрузки и порядок строк зафиксированы', () => {
    const { exported } = runLegacy();
    const lines = exported.split('\n');
    expect(lines[0]).toBe('category,month,orders,gross,discount,tax,total');
    expect(lines[1]?.startsWith(',2025-02')).toBe(true);
    expect(lines.filter((line) => line.length > 0)).toHaveLength(40);
  });
});
