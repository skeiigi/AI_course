/**
 * Готовит чистую базу для сквозных тестов и сразу отдаёт управление серверу.
 *
 * Скрипт запускается из webServer в playwright.config.ts, до старта сервиса.
 * Отдельная подготовка через globalSetup не подошла бы: Playwright поднимает
 * webServer раньше, чем выполняет globalSetup, и сервис успел бы открыть
 * старую базу.
 *
 * Файл написан на обычном JavaScript: Playwright запускает его командой node,
 * а не своим загрузчиком TypeScript.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const seedEntry = resolve(here, '..', 'server', 'dist', 'seed.js');
const webDir = resolve(here, '..', 'web', 'dist');
const dbFile = process.env.BOOKING_DB_FILE;

if (dbFile === undefined) {
  throw new Error('Не задана переменная окружения BOOKING_DB_FILE');
}

for (const required of [seedEntry, webDir]) {
  if (!existsSync(required)) {
    throw new Error(
      `Не найдено: ${required}\nСоберите проект командой npm run build в корне репозитория.`,
    );
  }
}

// Удаляем старую базу вместе со служебными файлами журнала SQLite,
// чтобы каждый запуск начинался с одинакового состояния.
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${dbFile}${suffix}`, { force: true });
}

execFileSync(process.execPath, [seedEntry], { stdio: 'inherit' });
