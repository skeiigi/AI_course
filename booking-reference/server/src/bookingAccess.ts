/** Секрет одной брони. В базе хранится только его SHA-256 хеш. */

import { createHash, randomBytes } from 'node:crypto';

import { errors } from './errors.js';
import type { NewBooking, Repository } from './repository.js';
import { bookingAuthorizationSchema } from './schemas.js';
import type { Booking, BookingCreated } from './schemas.js';

export function createAccessToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createBookingWithAccess(repository: Repository, input: NewBooking): BookingCreated {
  const accessToken = createAccessToken();
  const booking = repository.createBooking(input, hashAccessToken(accessToken));
  return { booking, access_token: accessToken };
}

export function createBookingsWithAccess(repository: Repository, inputs: NewBooking[]): BookingCreated[] {
  const items = inputs.map((input) => {
    const accessToken = createAccessToken();
    return { input, accessToken, tokenHash: hashAccessToken(accessToken) };
  });
  const bookings = repository.createBookings(items);
  return bookings.map((booking, index) => ({ booking, access_token: items[index].accessToken }));
}

export function getAuthorizedBooking(
  repository: Repository,
  bookingId: number,
  authorization: string | undefined,
): Booking {
  const token = bookingAuthorizationSchema.safeParse(authorization);
  if (!token.success) {
    throw errors.bookingNotFound();
  }

  const booking = repository.getAuthorizedBooking(bookingId, hashAccessToken(token.data));
  if (booking === null) {
    throw errors.bookingNotFound();
  }
  return booking;
}
