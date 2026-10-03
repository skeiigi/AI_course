/**
 * Интеграционные тесты эндпоинтов броней.
 * Главное правило предметной области проверяется здесь: на один слот
 * не может быть двух действующих броней.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/db.js';
import { createRepository } from '../src/repository.js';
import type { Activity, Booking } from '../src/schemas.js';
import { MONDAY, SATURDAY, createActivityWithSchedule, createTestApp } from './helpers.js';

let app: FastifyInstance;

beforeEach(() => {
  app = createTestApp();
});

afterEach(async () => {
  await app.close();
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

describe('POST /api/bookings', () => {
  it('создаёт бронь и сам вычисляет время окончания', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity);

    expect(response.statusCode).toBe(201);
    const booking = response.json<Booking>();
    expect(booking).toMatchObject({
      activity_id: activity.id,
      activity_name: activity.name,
      date: MONDAY,
      start_time: '10:00:00',
      end_time: '10:30:00',
      status: 'active',
    });
    expect(Date.parse(booking.created_at)).not.toBeNaN();
  });

  it('не бронирует время, которого нет в сетке', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { start_time: '10:07:00' });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('slot_not_found');
  });

  it('не бронирует день, которого нет в расписании', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await book(activity, { date: SATURDAY });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('slot_not_found');
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

    repository.createBooking(booking);
    expect(() => repository.createBooking(booking)).toThrowError(/UNIQUE/i);
    db.close();
  });
});

describe('отмена брони', () => {
  it('переводит бронь в статус cancelled', async () => {
    const activity = await createActivityWithSchedule(app);
    const booking = (await book(activity)).json<Booking>();

    const response = await app.inject({
      method: 'POST',
      url: `/api/bookings/${booking.id}/cancel`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('cancelled');
  });

  it('освобождает слот: после отмены его снова можно забронировать', async () => {
    const activity = await createActivityWithSchedule(app);
    const booking = (await book(activity)).json<Booking>();
    await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel` });

    const again = await book(activity, { guest_email: 'other@example.com' });
    expect(again.statusCode).toBe(201);
  });

  it('не даёт отменить бронь дважды', async () => {
    const activity = await createActivityWithSchedule(app);
    const booking = (await book(activity)).json<Booking>();
    await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel` });

    const second = await app.inject({
      method: 'POST',
      url: `/api/bookings/${booking.id}/cancel`,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('booking_already_cancelled');
  });

  it('не находит несуществующую бронь', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/bookings/999/cancel' });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('booking_not_found');
  });
});

describe('GET /api/bookings', () => {
  it('отдаёт брони, новые сверху', async () => {
    const activity = await createActivityWithSchedule(app);
    await book(activity, { start_time: '10:00:00' });
    await book(activity, { start_time: '10:30:00' });

    const response = await app.inject({ method: 'GET', url: '/api/bookings' });
    expect(response.statusCode).toBe(200);
    expect(response.json().map((item: Booking) => item.start_time)).toEqual([
      '10:30:00',
      '10:00:00',
    ]);
  });

  it('фильтрует брони по почте гостя', async () => {
    const activity = await createActivityWithSchedule(app);
    await book(activity, { start_time: '10:00:00', guest_email: 'ivan@example.com' });
    await book(activity, { start_time: '10:30:00', guest_email: 'maria@example.com' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/bookings?guest_email=maria@example.com',
    });
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].guest_email).toBe('maria@example.com');
  });

  it('отменённые брони остаются в списке', async () => {
    const activity = await createActivityWithSchedule(app);
    const booking = (await book(activity)).json<Booking>();
    await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel` });

    const response = await app.inject({ method: 'GET', url: '/api/bookings' });
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].status).toBe('cancelled');
  });
});
