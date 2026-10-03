/** Интеграционные тесты эндпоинтов расписаний. */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActivity, createSchedule, createTestApp } from './helpers.js';

let app: FastifyInstance;

beforeEach(() => {
  app = createTestApp();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/schedules', () => {
  it('на пустой базе отдаёт пустой список', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/schedules' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('фильтрует расписания по активности', async () => {
    const first = await createActivity(app, { name: 'Первая' });
    const second = await createActivity(app, { name: 'Вторая' });
    await createSchedule(app, first.id);
    await createSchedule(app, second.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/schedules?activity_id=${second.id}`,
    });
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].activity_id).toBe(second.id);
  });

  it('отклоняет нечисловой фильтр', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/schedules?activity_id=abc' });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
  });
});

describe('POST /api/schedules', () => {
  it('создаёт расписание и отдаёт дни недели массивом чисел', async () => {
    const activity = await createActivity(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        activity_id: activity.id,
        weekdays: [3, 1, 1, 5],
        start_time: '10:00:00',
        end_time: '13:00:00',
        step_minutes: 30,
      },
    });

    expect(response.statusCode).toBe(201);
    // Повторы убраны, дни отсортированы: в базе они лежат строкой «1,3,5».
    expect(response.json().weekdays).toEqual([1, 3, 5]);
  });

  it('не даёт создать расписание для несуществующей активности', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        activity_id: 999,
        weekdays: [1],
        start_time: '10:00:00',
        end_time: '12:00:00',
        step_minutes: 30,
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('activity_not_found');
  });

  it('не принимает перевёрнутое рабочее окно', async () => {
    const activity = await createActivity(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        activity_id: activity.id,
        weekdays: [1],
        start_time: '18:00:00',
        end_time: '10:00:00',
        step_minutes: 30,
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('invalid_time_window');
  });

  it('не принимает пустой список дней недели', async () => {
    const activity = await createActivity(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        activity_id: activity.id,
        weekdays: [],
        start_time: '10:00:00',
        end_time: '12:00:00',
        step_minutes: 30,
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
  });

  it('не принимает день недели вне диапазона от 1 до 7', async () => {
    const activity = await createActivity(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        activity_id: activity.id,
        weekdays: [0, 8],
        start_time: '10:00:00',
        end_time: '12:00:00',
        step_minutes: 30,
      },
    });
    expect(response.statusCode).toBe(422);
  });

  it('не принимает время в формате без секунд', async () => {
    const activity = await createActivity(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        activity_id: activity.id,
        weekdays: [1],
        start_time: '10:00',
        end_time: '12:00',
        step_minutes: 30,
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain('ЧЧ:ММ:СС');
  });
});
