/** Интеграционные тесты эндпоинта слотов. */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Slot } from '../src/schemas.js';
import { MONDAY, SATURDAY, TUESDAY, createActivityWithSchedule, createTestApp } from './helpers.js';

let app: FastifyInstance;

beforeEach(() => {
  app = createTestApp();
});

afterEach(async () => {
  await app.close();
});

async function getSlots(activityId: number, from: string, to: string) {
  return app.inject({
    method: 'GET',
    url: `/api/slots?activity_id=${activityId}&date_from=${from}&date_to=${to}`,
  });
}

describe('GET /api/slots', () => {
  it('отдаёт сетку слотов на один будний день', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await getSlots(activity.id, MONDAY, MONDAY);

    expect(response.statusCode).toBe(200);
    const slots = response.json<Slot[]>();
    expect(slots.map((slot) => slot.start_time)).toEqual([
      '10:00:00',
      '10:30:00',
      '11:00:00',
      '11:30:00',
    ]);
    expect(slots.every((slot) => slot.is_free)).toBe(true);
    expect(slots[0].activity_id).toBe(activity.id);
  });

  it('в выходной день слотов нет', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await getSlots(activity.id, SATURDAY, SATURDAY);
    expect(response.json()).toEqual([]);
  });

  it('помечает занятым слот, на который есть бронь', async () => {
    const activity = await createActivityWithSchedule(app);
    await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        activity_id: activity.id,
        date: TUESDAY,
        start_time: '10:00:00',
        guest_name: 'Иван Петров',
        guest_email: 'ivan@example.com',
      },
    });

    const slots = (await getSlots(activity.id, TUESDAY, TUESDAY)).json<Slot[]>();
    expect(slots.find((slot) => slot.start_time === '10:00:00')?.is_free).toBe(false);
    expect(slots.find((slot) => slot.start_time === '10:30:00')?.is_free).toBe(true);
  });

  it('не находит слоты несуществующей активности', async () => {
    const response = await getSlots(999, MONDAY, MONDAY);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('activity_not_found');
  });

  it('отклоняет перевёрнутый диапазон дат', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await getSlots(activity.id, '2026-10-09', MONDAY);
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('invalid_date_range');
  });

  it('отклоняет диапазон длиннее 60 дней', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await getSlots(activity.id, '2026-01-01', '2026-12-31');
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('invalid_date_range');
    expect(response.json().message).toContain('60');
  });

  it('требует все три параметра запроса', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await app.inject({
      method: 'GET',
      url: `/api/slots?activity_id=${activity.id}`,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
  });

  it('отклоняет дату в неверном формате', async () => {
    const activity = await createActivityWithSchedule(app);
    const response = await getSlots(activity.id, '05.10.2026', '09.10.2026');
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain('ГГГГ-ММ-ДД');
  });
});
