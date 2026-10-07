/**
 * Ошибки API: код для программы, сообщение для человека.
 *
 * Клиент опирается на поле code, а поле message показывает пользователю.
 * Набор кодов описан в контракте contract/main.tsp, союз ErrorCode.
 */

import { ZodError } from 'zod';

export type ErrorCode =
  | 'validation_failed'
  | 'activity_not_found'
  | 'booking_not_found'
  | 'slot_not_found'
  | 'slot_taken'
  | 'slot_in_past'
  | 'booking_already_cancelled'
  | 'invalid_time_window'
  | 'invalid_date_range'
  | 'chat_closed'
  | 'route_not_found'
  | 'internal_error';

/** Тело ответа при ошибке. Совпадает с моделью ErrorBody из контракта. */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
}

/**
 * Ошибка, которую сервис возвращает клиенту осознанно.
 * Всё остальное, что вылетело из обработчика, считается сбоем и даёт код 500.
 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get body(): ErrorBody {
    return { code: this.code, message: this.message };
  }
}

export const notFound = (code: ErrorCode, message: string): ApiError =>
  new ApiError(404, code, message);

export const conflict = (code: ErrorCode, message: string): ApiError =>
  new ApiError(409, code, message);

export const unprocessable = (code: ErrorCode, message: string): ApiError =>
  new ApiError(422, code, message);

// Готовые ошибки предметной области. Тексты собраны здесь, а не разбросаны
// по обработчикам, чтобы одна и та же ситуация всегда описывалась одинаково.
export const errors = {
  activityNotFound: () => notFound('activity_not_found', 'Вид активности не найден'),
  bookingNotFound: () => notFound('booking_not_found', 'Бронь не найдена'),
  slotNotFound: () =>
    unprocessable('slot_not_found', 'В расписании нет слота, который начинается в это время'),
  slotTaken: () => conflict('slot_taken', 'Этот слот уже забронирован'),
  slotInPast: () =>
    unprocessable('slot_in_past', 'Нельзя забронировать время, которое уже прошло'),
  bookingAlreadyCancelled: () =>
    conflict('booking_already_cancelled', 'Эта бронь уже отменена'),
  invalidTimeWindow: () =>
    unprocessable('invalid_time_window', 'Начало рабочего окна должно быть раньше его конца'),
  invalidDateRange: (message: string) => unprocessable('invalid_date_range', message),
  chatClosed: () => conflict('chat_closed', 'Переписка закрыта: бронь отменена или встреча уже началась'),
};

/**
 * Превращает разбор Zod в одно понятное сообщение.
 * Пример: «guest_email: Почта указана неверно; duration_minutes: Длительность меньше 5 минут».
 */
export function describeZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
