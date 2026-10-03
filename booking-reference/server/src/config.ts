/**
 * Настройки, которые берутся из переменных окружения.
 * Значения по умолчанию рассчитаны на запуск из папки проекта без настройки.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Корень репозитория: две папки вверх от этого файла (src или dist). */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const config = {
  host: process.env.BOOKING_HOST ?? '0.0.0.0',
  port: Number(process.env.BOOKING_PORT ?? 8000),
  dbFile: process.env.BOOKING_DB_FILE ?? resolve(projectRoot, 'booking.db'),
  webDir: process.env.BOOKING_WEB_DIR ?? resolve(projectRoot, 'web', 'dist'),
};
