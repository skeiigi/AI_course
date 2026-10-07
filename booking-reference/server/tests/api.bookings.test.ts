/**
 * Интеграционные тесты эндпоинтов броней.
 * Главное правило предметной области проверяется здесь: на один слот
 * не может быть двух действующих броней.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openDatabase } from '../src/db.js';
import { createAccessToken, hashAccessToken } from '../src/bookingAccess.js';
import { createRepository } from '../src/repository.js';
import type { Activity, Booking, BookingCreated } from '../src/schemas.js';
import { MONDAY, SATURDAY, createActivity, createActivityWithSchedule, createSchedule, createTestApp } from './helpers.js';

let app: FastifyInstance;

beforeEach(() => {
  app = createTestApp();
});

afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
});

function bookingPayload(activity: Activity, overrides: Record<string, unknown> = {}) {
  return {
    activity_id: activity.id,
    date: MONDAY,
    start_time: '10:00:00',
    guest_name: 'Иван Петров',
    guest_email: 'ivan@example.com',
    ...overrides,
  };
}

async function book(activity: Activity, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: bookingPayload(activity, overrides),
  });
}

function createdBooking(response: { json: <T>() => T }): BookingCreated {
  return response.json<BookingCreated>();
}

function authorization(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function bookBatch(activity: Activity, slots: Array<{ date: string; start_time: string }>, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/bookings/batch',
    payload: {
      activity_id: activity.id,
      slots,
      guest_name: 'Иван Петров',
      guest_email: 'ivan@example.com',
      ...overrides,
    },
  });
}

describe('POST /api/bookings/batch', () => {
  it('создаёт несколько броней с разными секретами', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await bookBatch(activity, [
      { date: MONDAY, start_time: '10:00:00' },
      { date: MONDAY, start_time: '10:30:00' },
    ]);

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { bookings } = response.json<{ bookings: BookingCreated[] }>();
    expect(bookings).toHaveLength(2);
    expect(bookings.map(({ booking }) => booking.start_time)).toEqual(['10:00:00', '10:30:00']);
    expect(bookings[0].access_token).not.toBe(bookings[1].access_token);
    for (const { booking, access_token: token } of bookings) {
      const fetched = await app.inject({
        method: 'GET', url: `/api/bookings/${booking.id}`, headers: authorization(token),
      });
      expect(fetched.statusCode).toBe(200);
    }
    const wrongSecret = await app.inject({
      method: 'GET',
      url: `/api/bookings/${bookings[1].booking.id}`,
      headers: authorization(bookings[0].access_token),
    });
    expect(wrongSecret.statusCode).toBe(404);
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/bookings/${bookings[0].booking.id}/cancel`,
      headers: authorization(bookings[0].access_token),
    });
    expect(cancelled.statusCode).toBe(200);
    const secondBooking = await app.inject({
      method: 'GET',
      url: `/api/bookings/${bookings[1].booking.id}`,
      headers: authorization(bookings[1].access_token),
    });
    expect(secondBooking.json().status).toBe('active');
  });

  it('не сохраняет свободный слот, если другой в наборе уже занят', async () => {
    const activity = await createActivityWithSchedule(app);
    await book(activity, { start_time: '10:30:00' });
    const response = await bookBatch(activity, [
      { date: MONDAY, start_time: '10:00:00' },
      { date: MONDAY, start_time: '10:30:00' },
    ]);
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('slot_taken');
    expect((await book(activity)).statusCode).toBe(201);
  });

  it('отклоняет повторение слота внутри набора', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await bookBatch(activity, [
      { date: MONDAY, start_time: '10:00:00' },
      { date: MONDAY, start_time: '10:00:00' },
    ]);
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
    expect((await book(activity)).statusCode).toBe(201);
  });

  it('не сохраняет набор с прошедшим слотом', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T03:30:00Z'));
    const activity = await createActivityWithSchedule(app);
    const response = await bookBatch(activity, [
      { date: '2026-10-06', start_time: '11:00:00' },
      { date: '2026-10-06', start_time: '10:00:00' },
    ]);
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('slot_in_past');
    expect((await book(activity, { date: '2026-10-06', start_time: '11:00:00' })).statusCode).toBe(201);
  });

  it('отклоняет пустой набор и набор длиннее 20 слотов', async () => {
    const activity = await createActivityWithSchedule(app);
    const empty = await bookBatch(activity, []);
    const tooMany = await bookBatch(activity, Array.from({ length: 21 }, () => ({
      date: MONDAY, start_time: '10:00:00',
    })));
    expect(empty.statusCode).toBe(422);
    expect(tooMany.statusCode).toBe(422);
  });

  it('откатывает уже записанные элементы при конфликте в базе', () => {
    const db = openDatabase(':memory:');
    try {
      const repository = createRepository(db);
      const activity = repository.createActivity({
        name: 'Консультация', duration_minutes: 30, description: '', color: '#3b5bdb',
      });
      const first = {
        activity_id: activity.id, date: MONDAY, start_time: '10:00:00', end_time: '10:30:00',
        guest_name: 'Иван Петров', guest_email: 'ivan@example.com',
      };
      const taken = { ...first, start_time: '10:30:00', end_time: '11:00:00' };
      repository.createBooking(taken, hashAccessToken(createAccessToken()));

      expect(() => repository.createBookings([
        { input: first, tokenHash: hashAccessToken(createAccessToken()) },
        { input: taken, tokenHash: hashAccessToken(createAccessToken()) },
      ])).toThrowError(/UNIQUE/i);
      expect(repository.findActiveBooking(activity.id, MONDAY, '10:00:00')).toBeNull();
    } finally {
      db.close();
    }
  });
});

describe('POST /api/bookings', () => {
  it('создаёт бронь и сам вычисляет время окончания', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity);

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { booking, access_token: token } = createdBooking(response);
    expect(booking).toMatchObject({
      activity_id: activity.id,
      activity_name: activity.name,
      date: MONDAY,
      start_time: '10:00:00',
      end_time: '10:30:00',
      status: 'active',
    });
    expect(Date.parse(booking.created_at)).not.toBeNaN();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('не бронирует время, которого нет в сетке', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { start_time: '10:07:00' });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('slot_not_found');
  });

  it('не бронирует прошедший слот даже прямым запросом к API', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T03:30:00Z'));
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { date: '2026-10-06', start_time: '10:00:00' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      code: 'slot_in_past',
      message: 'Нельзя забронировать время, которое уже прошло',
    });
  });

  it('не бронирует слот, начало которого совпало с текущим временем', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T03:30:00Z'));
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { date: '2026-10-06', start_time: '10:30:00' });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('slot_in_past');
  });

  it('бронирует будущий слот того же дня', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T03:30:00Z'));
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { date: '2026-10-06', start_time: '11:00:00' });
    expect(response.statusCode).toBe(201);
  });

  it('не бронирует день, которого нет в расписании', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { date: SATURDAY });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('slot_not_found');
  });

  it('отклоняет несуществующую дату брони', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { date: '2026-02-30' });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
  });

  it('бронирует слот с ненулевыми секундами без сдвига времени', async () => {
    const activity = await createActivity(app);
    await createSchedule(app, activity.id, {
      start_time: '10:00:30',
      end_time: '11:00:30',
    });

    const response = await book(activity, { start_time: '10:00:30' });
    expect(response.statusCode).toBe(201);
    expect(createdBooking(response).booking).toMatchObject({
      start_time: '10:00:30',
      end_time: '10:30:30',
    });
  });

  it('не бронирует несуществующую активность', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { activity_id: 999 });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('activity_not_found');
  });

  it('отклоняет неверный адрес почты', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { guest_email: 'просто текст' });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
  });

  it('отклоняет пустое имя гостя', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { guest_name: '  ' });
    expect(response.statusCode).toBe(422);
  });
});

describe('защита от двойного бронирования', () => {
  it('вторая бронь на тот же слот получает код 409', async () => {
    const activity = await createActivityWithSchedule(app);
    expect((await book(activity)).statusCode).toBe(201);

    const second = await book(activity, { guest_email: 'other@example.com' });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('slot_taken');
    expect(second.json().message).toBe('Этот слот уже забронирован');
  });

  it('соседний слот остаётся свободным', async () => {
    const activity = await createActivityWithSchedule(app);
    await book(activity);
    const neighbour = await book(activity, { start_time: '10:30:00' });
    expect(neighbour.statusCode).toBe(201);
  });

  it('уникальный индекс в базе не даёт записать вторую действующую бронь', async () => {
    // Этот тест обходит проверку в коде и обращается прямо к базе: так видно,
    // что второй рубеж защиты действительно работает. Смотри docs/adr/0003.
    const db = openDatabase(':memory:');
    const repository = createRepository(db);
    const activity = repository.createActivity({
      name: 'Консультация',
      duration_minutes: 30,
      description: '',
      color: '#3b5bdb',
    });
    const booking = {
      activity_id: activity.id,
      date: MONDAY,
      start_time: '10:00:00',
      end_time: '10:30:00',
      guest_name: 'Иван Петров',
      guest_email: 'ivan@example.com',
    };

    repository.createBooking(booking, hashAccessToken(createAccessToken()));
    expect(() => repository.createBooking(booking, hashAccessToken(createAccessToken()))).toThrowError(/UNIQUE/i);
    db.close();
  });
});

describe('отмена брони', () => {
  it('переводит бронь в статус cancelled', async () => {
    const activity = await createActivityWithSchedule(app);
    const { booking, access_token: token } = createdBooking(await book(activity));

    const response = await app.inject({
      method: 'POST',
      url: `/api/bookings/${booking.id}/cancel`,
      headers: authorization(token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('cancelled');
  });

  it('освобождает слот: после отмены его снова можно забронировать', async () => {
    const activity = await createActivityWithSchedule(app);
    const { booking, access_token: token } = createdBooking(await book(activity));
    await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel`, headers: authorization(token) });

    const again = await book(activity, { guest_email: 'other@example.com' });
    expect(again.statusCode).toBe(201);
  });

  it('не даёт отменить бронь дважды', async () => {
    const activity = await createActivityWithSchedule(app);
    const { booking, access_token: token } = createdBooking(await book(activity));
    await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel`, headers: authorization(token) });

    const second = await app.inject({
      method: 'POST',
      url: `/api/bookings/${booking.id}/cancel`,
      headers: authorization(token),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('booking_already_cancelled');
  });

  it('не находит несуществующую бронь', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/bookings/999/cancel', headers: authorization(createAccessToken()) });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('booking_not_found');
  });

  it('не отменяет чужую бронь без её секрета', async () => {
    const activity = await createActivityWithSchedule(app);
    const { booking, access_token: token } = createdBooking(await book(activity));
    const missing = await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel` });
    const wrong = await app.inject({
      method: 'POST',
      url: `/api/bookings/${booking.id}/cancel`,
      headers: authorization(createAccessToken()),
    });
    expect(missing.statusCode).toBe(404);
    expect(wrong.statusCode).toBe(404);
    const own = await app.inject({
      method: 'GET',
      url: `/api/bookings/${booking.id}`,
      headers: authorization(token),
    });
    expect(own.json<Booking>().status).toBe('active');
  });
});

describe('доступ к броням по секрету', () => {
  it('не отдаёт общий список броней', async () => {
    const activity = await createActivityWithSchedule(app);
    await book(activity);
    const response = await app.inject({ method: 'GET', url: '/api/bookings' });
    expect(response.statusCode).toBe(404);
  });

  it('отдаёт бронь только с её ключом, а не по почте или чужому ключу', async () => {
    const activity = await createActivityWithSchedule(app);
    const first = createdBooking(await book(activity, { start_time: '10:00:00' }));
    const second = createdBooking(await book(activity, { start_time: '10:30:00', guest_email: 'ivan@example.com' }));

    const own = await app.inject({
      method: 'GET',
      url: `/api/bookings/${first.booking.id}`,
      headers: authorization(first.access_token),
    });
    const wrong = await app.inject({
      method: 'GET',
      url: `/api/bookings/${first.booking.id}`,
      headers: authorization(second.access_token),
    });
    const missing = await app.inject({ method: 'GET', url: `/api/bookings/${first.booking.id}` });
    expect(own.statusCode).toBe(200);
    expect(own.headers['cache-control']).toBe('no-store');
    expect(own.json<Booking>().guest_email).toBe('ivan@example.com');
    expect(JSON.stringify(own.json())).not.toContain(first.access_token);
    expect(wrong.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
  });

  it('отменённая бронь остаётся доступной по своему ключу', async () => {
    const activity = await createActivityWithSchedule(app);
    const { booking, access_token: token } = createdBooking(await book(activity));
    await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel`, headers: authorization(token) });

    const response = await app.inject({ method: 'GET', url: `/api/bookings/${booking.id}`, headers: authorization(token) });
    expect(response.json<Booking>().status).toBe('cancelled');
  });
});
