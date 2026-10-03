/**
 * Настройки сквозных тестов.
 *
 * Playwright сам поднимает собранный сервис на отдельном порту, дожидается
 * ответа и гасит его после тестов. Отдельно запускать сервер не нужно,
 * но проект должен быть собран: npm run build.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { E2E_BASE_URL, E2E_DB_FILE, E2E_PORT, PREPARE_ENTRY, SERVER_ENTRY, WEB_DIR } from './env';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: here,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // Тесты идут по порядку и делят одну базу: второй проверяет то,
  // что создал первый.
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  reporter: [['list']],

  use: {
    baseURL: E2E_BASE_URL,
    locale: 'ru-RU',
    timezoneId: 'Asia/Krasnoyarsk',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // Сначала готовим чистую базу, потом запускаем сервис. Обе команды
    // выполняет одна оболочка, поэтому порядок гарантирован.
    command: `node "${PREPARE_ENTRY}" && node "${SERVER_ENTRY}"`,
    url: `${E2E_BASE_URL}/api/activities`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      BOOKING_PORT: String(E2E_PORT),
      BOOKING_DB_FILE: E2E_DB_FILE,
      BOOKING_WEB_DIR: WEB_DIR,
    },
  },
});
