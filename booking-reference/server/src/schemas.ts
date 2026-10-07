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

export const dateString = z
  .string()
  .regex(DATE_PATTERN, 'Дата указывается в формате ГГГГ-ММ-ДД')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Такой даты в календаре нет');
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

export const bookingCreatedSchema = z.object({
  booking: bookingSchema,
  access_token: z.string().regex(/^[0-9a-f]{64}$/),
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

export const bookingBatchCreateSchema = z.object({
  activity_id: bookingCreateSchema.shape.activity_id,
  slots: z.array(z.object({
    date: dateString,
    start_time: timeString,
  })).min(1, 'Выберите хотя бы один слот').max(20, 'За один раз можно выбрать не более 20 слотов')
    .superRefine((slots, context) => {
      const seen = new Set<string>();
      for (const [index, slot] of slots.entries()) {
        const key = `${slot.date} ${slot.start_time}`;
        if (seen.has(key)) {
          context.addIssue({
            code: 'custom',
            path: [index],
            message: 'Один и тот же слот указан несколько раз',
          });
        }
        seen.add(key);
      }
    }),
  guest_name: bookingCreateSchema.shape.guest_name,
  guest_email: bookingCreateSchema.shape.guest_email,
});

export const bookingParamsSchema = z.object({
  booking_id: integerFromQuery,
});

export const bookingAuthorizationSchema = z
  .string()
  .regex(/^Bearer [0-9a-f]{64}$/)
  .transform((value) => value.slice(7));

export const bookingMessageSchema = z.object({
  id: z.number().int(),
  booking_id: z.number().int(),
  sender_name: z.string(),
  body: z.string(),
  created_at: z.string(),
});

export const bookingChatSchema = z.object({
  messages: z.array(bookingMessageSchema),
  can_post: z.boolean(),
});

export const bookingMessageCreateSchema = z.object({
  sender_name: z.string().trim()
    .min(1, 'Укажите имя отправителя')
    .max(60, 'Имя отправителя длиннее 60 символов'),
  body: z.string().trim()
    .min(1, 'Сообщение не может быть пустым')
    .max(2000, 'Сообщение длиннее 2000 символов'),
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
export type BookingCreated = z.infer<typeof bookingCreatedSchema>;
export type BookingBatchCreate = z.infer<typeof bookingBatchCreateSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type BookingMessage = z.infer<typeof bookingMessageSchema>;
export type BookingChat = z.infer<typeof bookingChatSchema>;
export type BookingMessageCreate = z.infer<typeof bookingMessageCreateSchema>;
