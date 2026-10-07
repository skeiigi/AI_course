/**
 * Общие вспомогательные функции для интеграционных тестов.
 *
 * Каждый тест поднимает своё приложение с базой в оперативной памяти,
 * поэтому тесты не мешают друг другу и не оставляют файлов на диске.
 */

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { currentBookingDateTime } from '../src/bookingTime.js';
import type { Activity, Schedule } from '../src/schemas.js';
import { addDays, isoWeekday } from '../src/slotEngine.js';

/** Следующий понедельник: тесты бронирования не устаревают после текущей недели. */
const currentDate = currentBookingDateTime().date;
export const MONDAY = addDays(currentDate, 8 - isoWeekday(currentDate));
export const TUESDAY = addDays(MONDAY, 1);
export const SATURDAY = addDays(MONDAY, 5);

export function createTestApp(): FastifyInstance {
  return buildApp({ dbFile: ':memory:', webDir: null, logger: false });
}

/** Создаёт активность через API и возвращает её. */
export async function createActivity(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): Promise<Activity> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/activities',
    payload: { name: 'Консультация', duration_minutes: 30, ...overrides },
  });
  return response.json<Activity>();
}

/** Создаёт расписание через API и возвращает его. */
export async function createSchedule(
  app: FastifyInstance,
  activityId: number,
  overrides: Record<string, unknown> = {},
): Promise<Schedule> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/schedules',
    payload: {
      activity_id: activityId,
      weekdays: [1, 2, 3, 4, 5],
      start_time: '10:00:00',
      end_time: '12:00:00',
      step_minutes: 30,
      ...overrides,
    },
  });
  return response.json<Schedule>();
}

/** Активность с будним расписанием 10:00–12:00, шаг и длительность 30 минут. */
export async function createActivityWithSchedule(app: FastifyInstance): Promise<Activity> {
  const activity = await createActivity(app);
  await createSchedule(app, activity.id);
  return activity;
}
