/**
 * Подключение к SQLite и схема базы данных.
 *
 * Драйвер better-sqlite3 работает синхронно: запрос возвращает результат сразу,
 * без промисов. Для сервиса с одним процессом это быстрее асинхронного драйвера
 * и заметно проще читается. Обоснование выбора хранилища в docs/adr/0001.
 */

import Database from 'better-sqlite3';

export type Db = Database.Database;

/**
 * Схема базы. Три таблицы: активности, расписания и брони.
 * Слотов среди них нет: они вычисляются на лету, смотри docs/adr/0002.
 *
 * Время храним строками «ЧЧ:ММ:СС», даты строками «ГГГГ-ММ-ДД». В SQLite нет
 * отдельных типов для даты и времени, а в таком виде строки сравниваются
 * и сортируются так же, как сами моменты времени.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS activities (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  duration_minutes INTEGER NOT NULL,
  description      TEXT    NOT NULL DEFAULT '',
  color            TEXT    NOT NULL DEFAULT '#3b5bdb'
);

CREATE TABLE IF NOT EXISTS schedules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  weekdays     TEXT    NOT NULL,
  start_time   TEXT    NOT NULL,
  end_time     TEXT    NOT NULL,
  step_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  start_time  TEXT    NOT NULL,
  end_time    TEXT    NOT NULL,
  guest_name  TEXT    NOT NULL,
  guest_email TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active',
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_schedules_activity ON schedules (activity_id);
CREATE INDEX IF NOT EXISTS ix_bookings_guest     ON bookings (guest_email);

-- Второй рубеж защиты от двойного бронирования, смотри docs/adr/0003.
-- Частичный индекс: под ограничение попадают только действующие брони,
-- поэтому отменённый слот можно забронировать заново.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking
  ON bookings (activity_id, date, start_time)
  WHERE status = 'active';
`;

/**
 * Открывает базу и создаёт таблицы, если их ещё нет.
 * Значение ':memory:' даёт базу в оперативной памяти, ею пользуются тесты.
 */
export function openDatabase(file: string): Db {
  const db = new Database(file);

  // Внешние ключи в SQLite выключены по умолчанию, включаем их явно:
  // иначе ON DELETE CASCADE не сработает.
  db.pragma('foreign_keys = ON');

  // Журнал упреждающей записи ускоряет одновременные чтение и запись.
  // Для базы в памяти режим недоступен, поэтому включаем его только для файла.
  if (file !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  db.exec(SCHEMA);
  return db;
}

/** Признак нарушения уникального индекса. Используется в защите от двойной брони. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SQLITE_CONSTRAINT')
  );
}
