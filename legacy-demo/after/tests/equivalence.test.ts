/**
 * Доказательство эквивалентности: исходная версия и версия после миграции
 * дают на одних данных один и тот же результат.
 *
 * Тест запускает `legacy/report.js` и собранный `after/dist/main.js`
 * в отдельных папках и сравнивает файлы результата.
 *
 *     npm run test:after
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORDERS = join(PROJECT, 'data', 'orders.csv');
const LEGACY = join(PROJECT, 'legacy', 'report.js');
const AFTER = join(PROJECT, 'after', 'dist', 'main.js');

const workDirs: string[] = [];

afterAll(() => {
  for (const dir of workDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface RunResult {
  readonly report: string;
  readonly exported: string;
}

function runVersion(args: string[]): RunResult {
  if (!existsSync(AFTER)) {
    throw new Error('Не найден after/dist/main.js. Выполните npm run build');
  }

  const workDir = mkdtempSync(join(tmpdir(), 'legacy-equiv-'));
  workDirs.push(workDir);
  mkdirSync(join(workDir, 'data'), { recursive: true });
  cpSync(ORDERS, join(workDir, 'data', 'orders.csv'));

  const finished = spawnSync(process.execPath, args, { cwd: workDir, encoding: 'utf8' });
  expect(finished.status, finished.stderr ?? '').toBe(0);

  return {
    report: readFileSync(join(workDir, 'out', 'report.txt'), 'utf8'),
    exported: readFileSync(join(workDir, 'out', 'revenue.csv'), 'utf8'),
  };
}

/** Числа строки таблицы категорий: заказы, сумма, скидка, налог, итог, доля. */
function categoryCells(report: string, title: string): string[] {
  const line = report.split('\n').find((row) => row.startsWith(title));
  if (line === undefined) {
    throw new Error(`нет строки категории «${title}»`);
  }
  return line.slice(16).trim().split(/\s+/);
}

const legacy = runVersion([LEGACY]);
const compat = runVersion([AFTER, '--legacy-rounding', '--quiet']);
const fixed = runVersion([AFTER, '--quiet']);

describe('шаг 1: миграция не изменила поведение', () => {
  it('отчёт в режиме совместимости совпадает символ в символ', () => {
    expect(compat.report).toBe(legacy.report);
  });

  it('выгрузка в режиме совместимости совпадает символ в символ', () => {
    expect(compat.exported).toBe(legacy.exported);
  });
});

describe('шаг 2: исправлена только ошибка округления', () => {
  it('счётчики заказов не изменились', () => {
    for (const prefix of ['Строк в файле:', 'Учтено заказов:', 'Отменённых:']) {
      const before = legacy.report.split('\n').find((line) => line.startsWith(prefix));
      const after = fixed.report.split('\n').find((line) => line.startsWith(prefix));
      expect(after).toBe(before);
    }
  });

  it('валовые суммы по категориям не изменились', () => {
    for (const title of ['Электроника', 'Книги', 'Одежда', 'Дом и сад', 'Спорт', 'toys']) {
      expect(categoryCells(fixed.report, title)[1]).toBe(categoryCells(legacy.report, title)[1]);
      expect(categoryCells(fixed.report, title)[0]).toBe(categoryCells(legacy.report, title)[0]);
    }
  });

  it('сумма скидок выросла на 50 копеек: недобор от усечения', () => {
    expect(categoryCells(legacy.report, 'ИТОГО')[2]).toBe('1404.22');
    expect(categoryCells(fixed.report, 'ИТОГО')[2]).toBe('1404.72');
  });

  it('раздел «Топ товаров» не затронут: он считается без скидок', () => {
    const section = (report: string): string[] =>
      report.split('ТОП-5 ТОВАРОВ')[1]?.split('ПРИМЕНЕНИЕ СКИДОК')[0]?.split('\n') ?? [];
    expect(section(fixed.report)).toEqual(section(legacy.report));
  });

  it('в выгрузке изменились только колонки скидки, налога и итога', () => {
    const legacyRows = legacy.exported.trim().split('\n').slice(1);
    const fixedRows = fixed.exported.trim().split('\n').slice(1);
    expect(fixedRows).toHaveLength(legacyRows.length);

    let changed = 0;
    legacyRows.forEach((row, index) => {
      const before = row.split(',');
      const after = (fixedRows[index] ?? '').split(',');
      expect(after.slice(0, 4)).toEqual(before.slice(0, 4));
      if (after.slice(4).join(',') !== before.slice(4).join(',')) {
        changed += 1;
      }
    });
    expect(changed).toBeGreaterThan(0);
  });
});
