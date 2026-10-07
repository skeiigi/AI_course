/** Проверка всех слотов перед записью одной или нескольких броней. */

import { currentBookingDateTime, isUpcomingSlot } from './bookingTime.js';
import { errors } from './errors.js';
import type { NewBooking, Repository } from './repository.js';
import type { BookingBatchCreate } from './schemas.js';
import { findSlot } from './slotEngine.js';

export function prepareBookings(repository: Repository, input: BookingBatchCreate): NewBooking[] {
  const activity = repository.getActivity(input.activity_id);
  if (activity === null) {
    throw errors.activityNotFound();
  }

  const schedules = repository.listSchedules(activity.id);
  const now = currentBookingDateTime();
  return input.slots.map(({ date, start_time }) => {
    const slot = findSlot(activity, schedules, date, start_time);
    if (slot === null) {
      throw errors.slotNotFound();
    }
    if (!isUpcomingSlot(date, start_time, now)) {
      throw errors.slotInPast();
    }
    if (repository.findActiveBooking(activity.id, date, start_time) !== null) {
      throw errors.slotTaken();
    }
    return {
      activity_id: activity.id,
      date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      guest_name: input.guest_name,
      guest_email: input.guest_email,
    };
  });
}
