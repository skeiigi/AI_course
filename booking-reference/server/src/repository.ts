/**
 * Слой данных: единственное место в проекте, где есть SQL.
 *
 * Наружу отдаются готовые объекты контракта, а не строки таблиц. Разница
 * заметна на расписании: в базе дни недели лежат строкой «1,2,3,4,5»,
 * а в API это массив чисел [1, 2, 3, 4, 5].
 *
 * Запросы подготавливаются один раз при создании хранилища. Подготовленный
 * запрос SQLite разбирает однажды, дальше только подставляет значения.
 */

import type { Db } from './db.js';
import type { Activity, ActivityCreate, Booking, BookingMessage, Schedule, ScheduleCreate } from './schemas.js';
import type { BusySlot } from './slotEngine.js';

/** Строка таблицы schedules: дни недели хранятся текстом. */
interface ScheduleRow {
  id: number;
  activity_id: number;
  weekdays: string;
  start_time: string;
  end_time: string;
  step_minutes: number;
}

/** Данные, которых хватает для записи брони в базу. */
export interface NewBooking {
  activity_id: number;
  date: string;
  start_time: string;
  end_time: string;
  guest_name: string;
  guest_email: string;
}

const ACTIVE = 'active';
const CANCELLED = 'cancelled';

/** Превращает список дней недели в строку для хранения: [3, 1] в «1,3». */
export function weekdaysToText(weekdays: number[]): string {
  return [...new Set(weekdays)].sort((a, b) => a - b).join(',');
}

/** Обратное превращение: «1,3» в [1, 3]. */
export function weekdaysFromText(value: string): number[] {
  if (value.length === 0) {
    return [];
  }
  return value.split(',').map(Number);
}

export function createRepository(db: Db) {
  const statements = {
    listActivities: db.prepare<[], Activity>('SELECT * FROM activities ORDER BY id'),
    getActivity: db.prepare<[number], Activity>('SELECT * FROM activities WHERE id = ?'),
    insertActivity: db.prepare<[string, number, string, string]>(
      'INSERT INTO activities (name, duration_minutes, description, color) VALUES (?, ?, ?, ?)',
    ),

    listSchedules: db.prepare<[], ScheduleRow>('SELECT * FROM schedules ORDER BY id'),
    listSchedulesByActivity: db.prepare<[number], ScheduleRow>(
      'SELECT * FROM schedules WHERE activity_id = ? ORDER BY id',
    ),
    getSchedule: db.prepare<[number], ScheduleRow>('SELECT * FROM schedules WHERE id = ?'),
    insertSchedule: db.prepare<[number, string, string, string, number]>(
      `INSERT INTO schedules (activity_id, weekdays, start_time, end_time, step_minutes)
       VALUES (?, ?, ?, ?, ?)`,
    ),

    // Название активности подтягиваем сразу: клиенту хватит одного запроса,
    // чтобы показать список броней целиком.
    getBooking: db.prepare<[number], Booking>(
      `SELECT b.*, a.name AS activity_name
       FROM bookings b JOIN activities a ON a.id = b.activity_id
       WHERE b.id = ?`,
    ),
    getAuthorizedBooking: db.prepare<[number, string], Booking>(
      `SELECT b.*, a.name AS activity_name
       FROM bookings b
       JOIN activities a ON a.id = b.activity_id
       JOIN booking_access access ON access.booking_id = b.id
       WHERE b.id = ? AND access.token_hash = ?`,
    ),
    listBusySlots: db.prepare<[number, string, string], BusySlot>(
      `SELECT date, start_time FROM bookings
       WHERE activity_id = ? AND status = '${ACTIVE}' AND date BETWEEN ? AND ?`,
    ),
    findActiveBooking: db.prepare<[number, string, string], Booking>(
      `SELECT b.*, a.name AS activity_name
       FROM bookings b JOIN activities a ON a.id = b.activity_id
       WHERE b.activity_id = ? AND b.date = ? AND b.start_time = ? AND b.status = '${ACTIVE}'`,
    ),
    insertBooking: db.prepare<[number, string, string, string, string, string, string]>(
      `INSERT INTO bookings
         (activity_id, date, start_time, end_time, guest_name, guest_email, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '${ACTIVE}', ?)`,
    ),
    insertBookingAccess: db.prepare<[number, string]>(
      'INSERT INTO booking_access (booking_id, token_hash) VALUES (?, ?)',
    ),
    issueLegacyAccess: db.prepare<[number, string]>(
      `INSERT INTO booking_access (booking_id, token_hash) VALUES (?, ?)
       ON CONFLICT (booking_id) DO NOTHING`,
    ),
    cancelBooking: db.prepare<[number]>(
      `UPDATE bookings SET status = '${CANCELLED}' WHERE id = ?`,
    ),
    listBookingMessages: db.prepare<[number], BookingMessage>(
      'SELECT id, booking_id, sender_name, body, created_at FROM booking_messages WHERE booking_id = ? ORDER BY id',
    ),
    insertBookingMessage: db.prepare<[number, string, string, string]>(
      'INSERT INTO booking_messages (booking_id, sender_name, body, created_at) VALUES (?, ?, ?, ?)',
    ),
    getBookingMessage: db.prepare<[number], BookingMessage>(
      'SELECT id, booking_id, sender_name, body, created_at FROM booking_messages WHERE id = ?',
    ),
  };

  function toSchedule(row: ScheduleRow): Schedule {
    return { ...row, weekdays: weekdaysFromText(row.weekdays) };
  }

  function insertBookingWithAccess(input: NewBooking, tokenHash: string): Booking {
    const result = statements.insertBooking.run(
      input.activity_id,
      input.date,
      input.start_time,
      input.end_time,
      input.guest_name,
      input.guest_email,
      new Date().toISOString(),
    );
    const id = Number(result.lastInsertRowid);
    statements.insertBookingAccess.run(id, tokenHash);
    return statements.getBooking.get(id)!;
  }

  const insertOneBooking = db.transaction(insertBookingWithAccess);
  const insertManyBookings = db.transaction(
    (items: Array<{ input: NewBooking; tokenHash: string }>): Booking[] =>
      items.map(({ input, tokenHash }) => insertBookingWithAccess(input, tokenHash)),
  );

  return {
    listActivities(): Activity[] {
      return statements.listActivities.all();
    },

    getActivity(id: number): Activity | null {
      return statements.getActivity.get(id) ?? null;
    },

    createActivity(input: ActivityCreate): Activity {
      const result = statements.insertActivity.run(
        input.name,
        input.duration_minutes,
        input.description,
        input.color,
      );
      return statements.getActivity.get(Number(result.lastInsertRowid))!;
    },

    listSchedules(activityId?: number): Schedule[] {
      const rows =
        activityId === undefined
          ? statements.listSchedules.all()
          : statements.listSchedulesByActivity.all(activityId);
      return rows.map(toSchedule);
    },

    createSchedule(input: ScheduleCreate): Schedule {
      const result = statements.insertSchedule.run(
        input.activity_id,
        weekdaysToText(input.weekdays),
        input.start_time,
        input.end_time,
        input.step_minutes,
      );
      return toSchedule(statements.getSchedule.get(Number(result.lastInsertRowid))!);
    },

    getBooking(id: number): Booking | null {
      return statements.getBooking.get(id) ?? null;
    },

    getAuthorizedBooking(id: number, tokenHash: string): Booking | null {
      return statements.getAuthorizedBooking.get(id, tokenHash) ?? null;
    },

    listBookingMessages(bookingId: number): BookingMessage[] {
      return statements.listBookingMessages.all(bookingId);
    },

    createBookingMessage(bookingId: number, senderName: string, body: string): BookingMessage {
      const result = statements.insertBookingMessage.run(
        bookingId, senderName, body, new Date().toISOString(),
      );
      return statements.getBookingMessage.get(Number(result.lastInsertRowid))!;
    },

    issueLegacyAccess(id: number, tokenHash: string): boolean {
      if (statements.getBooking.get(id) === undefined) {
        return false;
      }
      return statements.issueLegacyAccess.run(id, tokenHash).changes === 1;
    },

    /** Занятые слоты активности внутри диапазона дат. Нужны движку слотов. */
    listBusySlots(activityId: number, dateFrom: string, dateTo: string): BusySlot[] {
      return statements.listBusySlots.all(activityId, dateFrom, dateTo);
    },

    /** Действующая бронь на конкретный слот. Отменённые брони не мешают. */
    findActiveBooking(activityId: number, date: string, startTime: string): Booking | null {
      return statements.findActiveBooking.get(activityId, date, startTime) ?? null;
    },

    createBooking(input: NewBooking, tokenHash: string): Booking {
      return insertOneBooking(input, tokenHash);
    },

    createBookings(items: Array<{ input: NewBooking; tokenHash: string }>): Booking[] {
      return insertManyBookings(items);
    },

    cancelBooking(id: number): Booking {
      statements.cancelBooking.run(id);
      return statements.getBooking.get(id)!;
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
