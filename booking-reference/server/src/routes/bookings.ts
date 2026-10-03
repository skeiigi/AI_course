/**
 * Эндпоинты броней.
 *
 * Самое важное здесь: защита от двойного бронирования одного слота.
 * Она сделана в два рубежа, подробности в docs/adr/0003.
 */

import type { FastifyInstance } from 'fastify';

import { isUniqueViolation } from '../db.js';
import { errors } from '../errors.js';
import type { Repository } from '../repository.js';
import { bookingCreateSchema, bookingParamsSchema, bookingQuerySchema } from '../schemas.js';
import { findSlot } from '../slotEngine.js';

export function bookingRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/api/bookings', async (request) => {
    const query = bookingQuerySchema.parse(request.query);
    return repository.listBookings(query.guest_email);
  });

  app.post('/api/bookings', async (request, reply) => {
    const input = bookingCreateSchema.parse(request.body);

    const activity = repository.getActivity(input.activity_id);
    if (activity === null) {
      throw errors.activityNotFound();
    }

    // Бронировать можно только время, которое действительно есть в сетке.
    const schedules = repository.listSchedules(activity.id);
    const slot = findSlot(activity, schedules, input.date, input.start_time);
    if (slot === null) {
      throw errors.slotNotFound();
    }

    // Первый рубеж защиты: смотрим, нет ли уже действующей брони на этот слот.
    // Он отсекает обычные повторные нажатия и даёт понятный ответ без записи в базу.
    if (repository.findActiveBooking(activity.id, input.date, input.start_time) !== null) {
      throw errors.slotTaken();
    }

    // Второй рубеж защиты: уникальный индекс в базе. Он спасает, если два
    // запроса пришли одновременно и оба прошли первую проверку.
    try {
      reply.code(201);
      return repository.createBooking({
        activity_id: activity.id,
        date: input.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        guest_name: input.guest_name,
        guest_email: input.guest_email,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw errors.slotTaken();
      }
      throw error;
    }
  });

  app.post('/api/bookings/:booking_id/cancel', async (request) => {
    const params = bookingParamsSchema.parse(request.params);

    const booking = repository.getBooking(params.booking_id);
    if (booking === null) {
      throw errors.bookingNotFound();
    }
    if (booking.status === 'cancelled') {
      throw errors.bookingAlreadyCancelled();
    }

    return repository.cancelBooking(booking.id);
  });
}
