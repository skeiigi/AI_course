/**
 * Заготовка интеграционного теста эндпоинта.
 *
 * Копируется в server/tests/ под именем api.<сущность>.test.ts:
 * импорт './helpers.js' рассчитан именно на эту папку.
 * Каждый тест поднимает своё приложение с базой в оперативной памяти,
 * поэтому тесты не мешают друг другу и не оставляют файлов на диске.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActivity, createTestApp, MONDAY } from './helpers.js';

let app: FastifyInstance;

beforeEach(() => {
  app = createTestApp();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/<сущность>', () => {
  it('на пустой базе отдаёт пустой список', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/<сущность>' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});

describe('POST /api/<сущность>', () => {
  it('создаёт запись и отвечает кодом 201', async () => {
    const activity = await createActivity(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/<сущность>',
      payload: { activity_id: activity.id, date: MONDAY },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ activity_id: activity.id });
  });

  // Негативные случаи обязательны: без них тест ничего не доказывает.

  it('отклоняет кривой вход кодом 422', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/<сущность>',
      payload: { activity_id: 1, date: '05-10-2026' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
  });

  it('на конфликт отвечает кодом 409 и понятным кодом ошибки', async () => {
    // Здесь повторяется действие, которое уже выполнено выше,
    // и проверяется, что второй раз оно не проходит.
  });
});
