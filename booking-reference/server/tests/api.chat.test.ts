import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookingChat, BookingCreated, BookingMessage } from '../src/schemas.js';
import { MONDAY, createActivityWithSchedule, createTestApp } from './helpers.js';

let app: FastifyInstance;

beforeEach(() => {
  app = createTestApp();
});

afterEach(async () => {
  await app.close();
});

async function createBooking(startTime = '10:00:00'): Promise<BookingCreated> {
  const activity = await createActivityWithSchedule(app);
  const response = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      activity_id: activity.id,
      date: MONDAY,
      start_time: startTime,
      guest_name: 'Иван Петров',
      guest_email: 'ivan@example.com',
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<BookingCreated>();
}

describe('переписка по секретной ссылке', () => {
  it('сохраняет сообщения и показывает их обоим обладателям ссылки в порядке отправки', async () => {
    const { booking, access_token: token } = await createBooking();
    const url = `/api/bookings/${booking.id}/messages`;
    const headers = { Authorization: `Bearer ${token}` };

    const empty = await app.inject({ method: 'GET', url, headers });
    expect(empty.statusCode).toBe(200);
    expect(empty.headers['cache-control']).toBe('no-store');
    expect(empty.json<BookingChat>()).toEqual({ messages: [], can_post: true });

    const first = await app.inject({
      method: 'POST', url, headers, payload: { sender_name: '  Иван  ', body: '  Где встречаемся?  ' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json<BookingMessage>()).toMatchObject({
      booking_id: booking.id, sender_name: 'Иван', body: 'Где встречаемся?',
    });

    const second = await app.inject({
      method: 'POST', url, headers, payload: { sender_name: 'Организатор', body: 'В переговорной 2' },
    });
    expect(second.statusCode).toBe(201);
    const room = await app.inject({ method: 'GET', url, headers });
    expect(room.json<BookingChat>().messages.map((item) => item.body)).toEqual([
      'Где встречаемся?', 'В переговорной 2',
    ]);
  });

  it('скрывает переписку без секрета и не смешивает разные брони', async () => {
    const first = await createBooking();
    const secondActivity = await createActivityWithSchedule(app);
    const secondResponse = await app.inject({
      method: 'POST', url: '/api/bookings',
      payload: {
        activity_id: secondActivity.id,
        date: MONDAY,
        start_time: '10:30:00',
        guest_name: 'Мария',
        guest_email: 'maria@example.com',
      },
    });
    const second = secondResponse.json<BookingCreated>();
    const firstUrl = `/api/bookings/${first.booking.id}/messages`;
    const firstHeaders = { Authorization: `Bearer ${first.access_token}` };
    const secondHeaders = { Authorization: `Bearer ${second.access_token}` };

    expect((await app.inject({ method: 'GET', url: firstUrl })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: firstUrl, headers: secondHeaders })).statusCode).toBe(404);
    expect((await app.inject({
      method: 'POST', url: firstUrl, headers: secondHeaders,
      payload: { sender_name: 'Мария', body: 'Чужое сообщение' },
    })).statusCode).toBe(404);

    await app.inject({
      method: 'POST', url: firstUrl, headers: firstHeaders,
      payload: { sender_name: 'Иван', body: 'Только в первой брони' },
    });
    const secondRoom = await app.inject({
      method: 'GET', url: `/api/bookings/${second.booking.id}/messages`, headers: secondHeaders,
    });
    expect(secondRoom.json<BookingChat>().messages).toEqual([]);
  });

  it('проверяет длину и закрывает отправку после отмены, сохраняя историю', async () => {
    const { booking, access_token: token } = await createBooking();
    const url = `/api/bookings/${booking.id}/messages`;
    const headers = { Authorization: `Bearer ${token}` };
    const invalid = await app.inject({
      method: 'POST', url, headers, payload: { sender_name: ' ', body: ' '.repeat(3) },
    });
    expect(invalid.statusCode).toBe(422);
    const tooLong = await app.inject({
      method: 'POST', url, headers, payload: { sender_name: 'Иван', body: 'а'.repeat(2001) },
    });
    expect(tooLong.statusCode).toBe(422);
    await app.inject({
      method: 'POST', url, headers, payload: { sender_name: 'Иван', body: 'Сохранить в истории' },
    });
    await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel`, headers });

    const closed = await app.inject({
      method: 'POST', url, headers, payload: { sender_name: 'Иван', body: 'Поздно' },
    });
    expect(closed.statusCode).toBe(409);
    expect(closed.json()).toMatchObject({ code: 'chat_closed' });
    const room = (await app.inject({ method: 'GET', url, headers })).json<BookingChat>();
    expect(room.can_post).toBe(false);
    expect(room.messages.map((item) => item.body)).toEqual(['Сохранить в истории']);
  });
});
