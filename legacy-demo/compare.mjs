/**
 * Сверка исходной версии и результата миграции.
 *
 * Скрипт запускает обе версии на одном и том же файле заказов и показывает,
 * где они расходятся. Проверяются две вещи.
 *
 * 1. В режиме совместимости (--legacy-rounding) версия на TypeScript обязана
 *    повторить отчёт исходной версии символ в символ. Это доказательство того,
 *    что миграция ничего не сломала.
 * 2. В обычном режиме отличается ровно то, что исправлено осознанно:
 *    округление скидки. Различия показываются построчно.
 *
 * Запуск из папки проекта:
 *
 *     npm run compare
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = dirname(fileURLToPath(import.meta.url));
const ORDERS = join(PROJECT, 'data', 'orders.csv');
const LEGACY = join(PROJECT, 'legacy', 'report.js');
const AFTER = join(PROJECT, 'after', 'dist', 'main.js');
const WIDTH = 60;
const MAX_DIFF_LINES = 14;

/** Собирает версию на TypeScript, если её ещё не собирали. */
function ensureBuild() {
  if (existsSync(AFTER)) {
    return true;
  }
  console.log('Сборка после миграции не найдена, запускаю npm run build');
  const built = spawnSync('npm', ['run', 'build'], { cwd: PROJECT, stdio: 'inherit', shell: true });
  if (built.status !== 0 || !existsSync(AFTER)) {
    console.log('Собрать не удалось. Выполните вручную: npm ci, затем npm run build');
    return false;
  }
  return true;
}

/** Запускает одну версию отчёта в отдельной папке и возвращает её результаты. */
function runVersion(args, label) {
  const workDir = mkdtempSync(join(tmpdir(), 'legacy-demo-'));
  try {
    mkdirSync(join(workDir, 'data'), { recursive: true });
    cpSync(ORDERS, join(workDir, 'data', 'orders.csv'));

    const finished = spawnSync(process.execPath, args, {
      cwd: workDir,
      encoding: 'utf8',
    });
    if (finished.status !== 0) {
      console.log(`Версия «${label}» завершилась с ошибкой:`);
      console.log(finished.stdout ?? '');
      console.log(finished.stderr ?? '');
      process.exit(2);
    }

    return {
      report: readFileSync(join(workDir, 'out', 'report.txt'), 'utf8'),
      exported: readFileSync(join(workDir, 'out', 'revenue.csv'), 'utf8'),
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** Печатает построчные различия двух текстов и возвращает их количество. */
function showDiff(title, oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const changes = [];

  const length = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < length; index += 1) {
    if (oldLines[index] !== newLines[index]) {
      if (oldLines[index] !== undefined) changes.push(`- ${oldLines[index]}`);
      if (newLines[index] !== undefined) changes.push(`+ ${newLines[index]}`);
    }
  }

  console.log('');
  console.log(title);
  console.log('-'.repeat(WIDTH));
  if (changes.length === 0) {
    console.log('различий нет');
    return 0;
  }
  for (const line of changes.slice(0, MAX_DIFF_LINES)) {
    console.log(line);
  }
  if (changes.length > MAX_DIFF_LINES) {
    console.log(`... и ещё строк: ${changes.length - MAX_DIFF_LINES}`);
  }
  return changes.length;
}

function main() {
  if (!existsSync(ORDERS)) {
    console.log(`Не найден файл ${ORDERS}`);
    return 2;
  }
  if (!ensureBuild()) {
    return 2;
  }

  const legacy = runVersion([LEGACY], 'legacy/report.js');
  const compat = runVersion([AFTER, '--legacy-rounding', '--quiet'], 'after, режим совместимости');
  const fixed = runVersion([AFTER, '--quiet'], 'after, обычный режим');

  console.log('='.repeat(WIDTH));
  console.log('ШАГ 1. Миграция без изменения поведения');
  console.log('='.repeat(WIDTH));
  console.log('legacy/report.js  против  after/dist/main.js --legacy-rounding');

  const sameReport = legacy.report === compat.report;
  const sameExport = legacy.exported === compat.exported;
  console.log(`Отчёт report.txt:      ${sameReport ? 'совпадает' : 'РАСХОДИТСЯ'}`);
  console.log(`Выгрузка revenue.csv:  ${sameExport ? 'совпадает' : 'РАСХОДИТСЯ'}`);

  if (!sameReport) showDiff('Различия в отчёте', legacy.report, compat.report);
  if (!sameExport) showDiff('Различия в выгрузке', legacy.exported, compat.exported);

  console.log('');
  console.log('='.repeat(WIDTH));
  console.log('ШАГ 2. Осознанное исправление ошибки округления');
  console.log('='.repeat(WIDTH));
  console.log('legacy/report.js  против  after/dist/main.js');

  const reportChanges = showDiff('Различия в отчёте', legacy.report, fixed.report);
  const exportChanges = showDiff('Различия в выгрузке', legacy.exported, fixed.exported);

  console.log('');
  console.log('='.repeat(WIDTH));
  if (sameReport && sameExport && reportChanges > 0 && exportChanges > 0) {
    console.log('ИТОГ: поведение сохранено, исправлена только ошибка округления.');
    return 0;
  }
  console.log('ИТОГ: сверка не сошлась, разберитесь с различиями выше.');
  return 1;
}

process.exit(main());
