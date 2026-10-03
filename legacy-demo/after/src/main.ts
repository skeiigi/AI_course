/**
 * Точка входа отчёта по заказам.
 *
 * Здесь нет ни одной формулы и ни одного правила расчёта: только разбор
 * аргументов, склейка слоёв и запись файлов.
 *
 *   node after/dist/main.js
 *   node after/dist/main.js --orders data/orders.csv --out-dir out
 *   node after/dist/main.js --legacy-rounding --quiet
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildExportRows, buildSummary } from './aggregate.js';
import type { Settings } from './config.js';
import { loadOrders } from './loader.js';
import { renderExportCsv, renderReport } from './render.js';

/** Разбирает аргументы командной строки. Неизвестный ключ считается ошибкой. */
export function parseArgs(argv: readonly string[]): Settings {
  let ordersPath = 'data/orders.csv';
  let outputDir = 'out';
  let legacyRounding = false;
  let quiet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case '--orders':
        index += 1;
        ordersPath = argv[index] ?? ordersPath;
        break;
      case '--out-dir':
        index += 1;
        outputDir = argv[index] ?? outputDir;
        break;
      case '--legacy-rounding':
        legacyRounding = true;
        break;
      case '--quiet':
        quiet = true;
        break;
      default:
        throw new Error(`Неизвестный аргумент: ${String(flag)}`);
    }
  }

  return {
    ordersPath,
    outputDir,
    rounding: legacyRounding ? 'legacy-truncate' : 'half-up',
    quiet,
  };
}

/** Читает заказы, считает отчёт, пишет результаты. Возвращает текст отчёта. */
export function run(settings: Settings): string {
  const loaded = loadOrders(settings.ordersPath);
  for (const warning of loaded.warnings) {
    process.stderr.write(`ПРЕДУПРЕЖДЕНИЕ: ${warning}\n`);
  }

  const options = { rounding: settings.rounding } as const;
  const summary = buildSummary(loaded, options);
  const report = renderReport(summary, settings.ordersPath);
  const exportRows = buildExportRows(loaded.orders, options);

  mkdirSync(settings.outputDir, { recursive: true });
  writeFileSync(join(settings.outputDir, 'report.txt'), report, 'utf8');
  writeFileSync(join(settings.outputDir, 'revenue.csv'), renderExportCsv(exportRows), 'utf8');

  if (!settings.quiet) {
    process.stdout.write(report);
  }
  process.stdout.write(
    `Выгружено строк в ${join(settings.outputDir, 'revenue.csv')}: ${exportRows.length}\n`,
  );

  return report;
}

/** Запуск только когда файл вызван напрямую, а не импортирован тестом. */
const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  run(parseArgs(process.argv.slice(2)));
}
