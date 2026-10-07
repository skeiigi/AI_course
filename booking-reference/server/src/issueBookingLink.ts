/** Выдача секрета для старой брони локальным оператором после проверки гостя. */

import { createAccessToken, hashAccessToken } from './bookingAccess.js';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { createRepository } from './repository.js';

const bookingId = Number(process.argv[2]);
const baseUrl = process.argv[3];

if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || baseUrl === undefined) {
  throw new Error('Использование: npm run issue:booking-link -- <id> <адрес сайта>');
}

const url = new URL(baseUrl);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('Укажите корневой адрес сайта без учётных данных, параметров и фрагмента');
}

const db = openDatabase(config.dbFile);
try {
  const repository = createRepository(db);
  const token = createAccessToken();
  if (!repository.issueLegacyAccess(bookingId, hashAccessToken(token))) {
    throw new Error('Бронь не найдена или ссылка для неё уже была выдана');
  }
  console.log(`${url.origin}/#booking=${bookingId}.${token}`);
} finally {
  db.close();
}
