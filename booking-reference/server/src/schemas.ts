/**
 * Схемы Zod для данных, приходящих снаружи, и типы, выведенные из них.
 *
 * Схемы повторяют модели контракта contract/main.tsp. Контракт первичен:
 * сначала правим его, потом этот файл. Порядок описан в AGENTS.md, раздел 6.
 *
 * Zod проверяет данные во время выполнения, а TypeScript выводит из тех же
 * схем статические типы через z.infer. Одно описание, две гарантии.
 */

import { z } from 'zod';

/** «ГГГГ-ММ-ДД», например 2026-10-05. */
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** «ЧЧ:ММ:СС», например 10:30:00. Такой формат даёт plainTime в контракте. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

/** Шестнадцатеричный цвет вида #3b5bdb. */
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const dateString = z.string().regex(DATE_PATTERN, 'Дата указывается в формате ГГГГ-ММ-ДД');
export const timeString = z.string().regex(TIME_PATTERN, 'Время указывается в формате ЧЧ:ММ:СС');

/**
 * Число из строки запроса. Query-параметры всегда приходят строками,
 * поэтому целое число из них приходится доставать отдельно.
 */
const integerFromQuery = z
  .string()
  .regex(/^-?\d+$/, 'Ожидается целое число')
  .transform((value) => Number.parseInt(value, 10));

// ---------------------------------------------------------------------------
// Вид активности
// ---------------------------------------------------------------------------

export const activitySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  duration_minutes: z.number().int(),
  description: z.string(),
  color: z.string(),
});

export const activityCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Название активности не может быть пустым')
    .max(100, 'Название активности длиннее 100 символов'),
  duration_minutes: z
    .number()
    .int('Длительность указывается целым числом минут')
    .min(5, 'Длительность меньше 5 минут')
    .max(480, 'Длительность больше 480 минут'),
  description: z.string().max(500, 'Описание длиннее 500 символов').default(''),
  color: z.string().regex(COLOR_PATTERN, 'Цвет задаётся кодом вида #3b5bdb').default('#3b5bdb'),
});

// ---------------------------------------------------------------------------
// Расписание
// ---------------------------------------------------------------------------

export const scheduleSchema = z.object({
  id: z.number().int(),
  activity_id: z.number().int(),
  weekdays: z.array(z.number().int()),
  start_time: timeString,
  end_time: timeString,
  step_minutes: z.number().int(),
});

export const scheduleCreateSchema = z.object({
  activity_id: z.number().int('Идентификатор активности должен быть целым числом'),
  weekdays: z
    .array(z.number().int().min(1, 'День недели меньше 1').max(7, 'День недели больше 7'))
    .min(1, 'Нужен хотя бы один день недели')
    .max(7, 'Дней недели не может быть больше семи'),
  start_time: timeString,
  end_time: timeString,
  step_minutes: z
    .number()
    .int('Шаг сетки указывается целым числом минут')
    .min(5, 'Шаг сетки меньше 5 минут')
    .max(480, 'Шаг сетки больше 480 минут'),
});

export const scheduleQuerySchema = z.object({
  activity_id: integerFromQuery.optional(),
});

// ---------------------------------------------------------------------------
// Тайм-слот
// ---------------------------------------------------------------------------

export const slotSchema = z.object({
  activity_id: z.number().int(),
  schedule_id: z.number().int(),
  date: dateString,
  start_time: timeString,
  end_time: timeString,
  is_free: z.boolean(),
});

export const slotQuerySchema = z.object({
  activity_id: integerFromQuery,
  date_from: dateString,
  date_to: dateString,
});

// ---------------------------------------------------------------------------
// Бронь
// ---------------------------------------------------------------------------

export const bookingStatusSchema = z.enum(['active', 'cancelled']);

export const bookingSchema = z.object({
  id: z.number().int(),
  activity_id: z.number().int(),
  activity_name: z.string(),
  date: dateString,
  start_time: timeString,
  end_time: timeString,
  guest_name: z.string(),
  guest_email: z.string(),
  status: bookingStatusSchema,
  created_at: z.string(),
});

export const bookingCreateSchema = z.object({
  activity_id: z.number().int('Идентификатор активности должен быть целым числом'),
  date: dateString,
  start_time: timeString,
  guest_name: z
    .string()
    .trim()
    .min(1, 'Имя гостя не может быть пустым')
    .max(100, 'Имя гостя длиннее 100 символов'),
  guest_email: z.email('Почта указана неверно'),
});

export const bookingQuerySchema = z.object({
  guest_email: z.string().optional(),
});

export const bookingParamsSchema = z.object({
  booking_id: integerFromQuery,
});

// ---------------------------------------------------------------------------
// Типы, выведенные из схем
// ---------------------------------------------------------------------------

export type Activity = z.infer<typeof activitySchema>;
export type ActivityCreate = z.infer<typeof activityCreateSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleCreate = z.infer<typeof scheduleCreateSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type Booking = z.infer<typeof bookingSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
