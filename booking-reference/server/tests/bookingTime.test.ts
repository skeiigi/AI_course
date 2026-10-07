import { describe, expect, it } from 'vitest';

import { currentBookingDateTime, isUpcomingSlot } from '../src/bookingTime.js';

describe('время бронирования', () => {
  it('определяет дату по Красноярску на границе суток UTC', () => {
    expect(currentBookingDateTime(new Date('2026-10-05T16:59:59Z'))).toEqual({
      date: '2026-10-05', time: '23:59:59',
    });
    expect(currentBookingDateTime(new Date('2026-10-05T17:00:00Z'))).toEqual({
      date: '2026-10-06', time: '00:00:00',
    });
  });

  it('учитывает секунды и не считает начавшийся слот предстоящим', () => {
    const now = { date: '2026-10-06', time: '10:00:30' };
    expect(isUpcomingSlot('2026-10-05', '23:00:00', now)).toBe(false);
    expect(isUpcomingSlot('2026-10-06', '10:00:00', now)).toBe(false);
    expect(isUpcomingSlot('2026-10-06', '10:00:30', now)).toBe(false);
    expect(isUpcomingSlot('2026-10-06', '10:30:00', now)).toBe(true);
    expect(isUpcomingSlot('2026-10-07', '00:00:00', now)).toBe(true);
  });
});
