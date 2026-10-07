/** Правила переписки по брони, отдельно от HTTP и SQL. */

import { getAuthorizedBooking } from './bookingAccess.js';
import { currentBookingDateTime, isUpcomingSlot } from './bookingTime.js';
import { errors } from './errors.js';
import type { Repository } from './repository.js';
import type { Booking, BookingMessage, BookingMessageCreate } from './schemas.js';

function canPost(booking: Booking): boolean {
  return booking.status === 'active' &&
    isUpcomingSlot(booking.date, booking.start_time, currentBookingDateTime());
}

export function getBookingChat(
  repository: Repository,
  bookingId: number,
  authorization: string | undefined,
): { messages: BookingMessage[]; can_post: boolean } {
  const booking = getAuthorizedBooking(repository, bookingId, authorization);
  return {
    messages: repository.listBookingMessages(booking.id),
    can_post: canPost(booking),
  };
}

export function createBookingMessage(
  repository: Repository,
  bookingId: number,
  authorization: string | undefined,
  input: BookingMessageCreate,
): BookingMessage {
  const booking = getAuthorizedBooking(repository, bookingId, authorization);
  if (!canPost(booking)) {
    throw errors.chatClosed();
  }
  return repository.createBookingMessage(booking.id, input.sender_name, input.body);
}
