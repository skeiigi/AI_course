/** Интеграционные тесты эндпоинтов видов активности. */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActivity, createTestApp } from './helpers.js';

let app: FastifyInstance;

beforeEach(() => {
  app = createTestApp();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/activities', () => {
  it('на пустой базе отдаёт пустой список', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/activities' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('отдаёт созданные активности по возрастанию идентификатора', async () => {
    await createActivity(app, { name: 'Первая' });
    await createActivity(app, { name: 'Вторая' });

    const response = await app.inject({ method: 'GET', url: '/api/activities' });
    expect(response.json().map((item: { name: string }) => item.name)).toEqual([
      'Первая',
      'Вторая',
    ]);
  });
});

describe('POST /api/activities', () => {
  it('создаёт активность и отвечает кодом 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/activities',
      payload: { name: 'Код-ревью', duration_minutes: 45 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Код-ревью',
      duration_minutes: 45,
      description: '',
      color: '#3b5bdb',
    });
    expect(response.json().id).toBeGreaterThan(0);
  });

  it('сохраняет описание и цвет, если они переданы', async () => {
    const activity = await createActivity(app, {
      description: 'Разбираем код вместе',
      color: '#0f766e',
    });
    expect(activity.description).toBe('Разбираем код вместе');
    expect(activity.color).toBe('#0f766e');
  });

  it('отклоняет пустое название', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/activities',
      payload: { name: '   ', duration_minutes: 30 },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
    expect(response.json().message).toContain('Название активности не может быть пустым');
  });

  it('отклоняет слишком короткую и слишком длинную встречу', async () => {
    for (const duration of [1, 600]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities',
        payload: { name: 'Встреча', duration_minutes: duration },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('validation_failed');
    }
  });

  it('отклоняет цвет, записанный не шестнадцатеричным кодом', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/activities',
      payload: { name: 'Встреча', duration_minutes: 30, color: 'красный' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain('#3b5bdb');
  });

  it('отклоняет тело запроса, которое не является корректным JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/activities',
      headers: { 'content-type': 'application/json' },
      payload: '{ это не json',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation_failed');
  });
});

describe('неизвестный эндпоинт', () => {
  it('отдаёт 404 с кодом route_not_found', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nonexistent' });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('route_not_found');
  });
});
