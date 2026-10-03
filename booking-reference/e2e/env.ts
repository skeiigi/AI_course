/** Общие пути и порт для сквозных тестов. Используются и настройками, и подготовкой. */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Порт для тестов отличается от рабочего, чтобы не мешать запущенному сервису. */
export const E2E_PORT = 8123;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** Отдельный файл базы: тесты не трогают данные, с которыми вы работаете руками. */
export const E2E_DB_FILE = resolve(here, 'e2e.db');

export const PREPARE_ENTRY = resolve(here, 'prepare.mjs');
export const SERVER_ENTRY = resolve(here, '..', 'server', 'dist', 'index.js');
export const SEED_ENTRY = resolve(here, '..', 'server', 'dist', 'seed.js');
export const WEB_DIR = resolve(here, '..', 'web', 'dist');
