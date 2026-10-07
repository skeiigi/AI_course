/**
 * Эндпоинты броней.
 *
 * Самое важное здесь: защита от двойного бронирования одного слота.
 * Она сделана в два рубежа, подробности в docs/adr/0003.
 */

import type { FastifyInstance } from 'fastify';

import { createBookingWithAccess, createBookingsWithAccess, getAuthorizedBooking } from '../bookingAccess.js';
import { createBookingMessage, getBookingChat } from '../bookingChat.js';
import { prepareBookings } from '../booking.js';
import { isUniqueViolation } from '../db.js';
import { errors } from '../errors.js';
import type { Repository } from '../repository.js';
import { bookingBatchCreateSchema, bookingCreateSchema, bookingMessageCreateSchema, bookingParamsSchema } from '../schemas.js';

export function bookingRoutes(app: FastifyInstance, repository: Repository): void {
  app.post('/api/bookings', async (request, reply) => {
    const input = bookingCreateSchema.parse(request.body);

    const [booking] = prepareBookings(repository, {
      activity_id: input.activity_id,
      slots: [{ date: input.date, start_time: input.start_time }],
      guest_name: input.guest_name,
      guest_email: input.guest_email,
    });

    // Второй рубеж защиты: уникальный индекс в базе. Он спасает, если два
    // запроса пришли одновременно и оба прошли первую проверку.
    try {
      reply.code(201);
      reply.header('Cache-Control', 'no-store');
      return createBookingWithAccess(repository, booking);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw errors.slotTaken();
      }
      throw error;
    }
  });

  app.post('/api/bookings/batch', async (request, reply) => {
    const input = bookingBatchCreateSchema.parse(request.body);
    const bookings = prepareBookings(repository, input);

    try {
      const created = createBookingsWithAccess(repository, bookings);
      reply.code(201);
      reply.header('Cache-Control', 'no-store');
      return { bookings: created };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw errors.slotTaken();
      }
      throw error;
    }
  });

  app.get('/api/bookings/:booking_id', async (request, reply) => {
    const params = bookingParamsSchema.parse(request.params);
    reply.header('Cache-Control', 'no-store');
    return getAuthorizedBooking(repository, params.booking_id, request.headers.authorization);
  });

  app.post('/api/bookings/:booking_id/cancel', async (request, reply) => {
    const params = bookingParamsSchema.parse(request.params);

    const booking = getAuthorizedBooking(repository, params.booking_id, request.headers.authorization);
    if (booking.status === 'cancelled') {
      throw errors.bookingAlreadyCancelled();
    }

    reply.header('Cache-Control', 'no-store');
    return repository.cancelBooking(booking.id);
  });

  app.get('/api/bookings/:booking_id/messages', async (request, reply) => {
    const params = bookingParamsSchema.parse(request.params);
    reply.header('Cache-Control', 'no-store');
    return getBookingChat(repository, params.booking_id, request.headers.authorization);
  });

  app.post('/api/bookings/:booking_id/messages', async (request, reply) => {
    const params = bookingParamsSchema.parse(request.params);
    const input = bookingMessageCreateSchema.parse(request.body);
    const message = createBookingMessage(repository, params.booking_id, request.headers.authorization, input);
    reply.code(201);
    reply.header('Cache-Control', 'no-store');
    return message;
  });
}
