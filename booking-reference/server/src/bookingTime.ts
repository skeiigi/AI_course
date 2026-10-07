/** Единый часовой пояс для дат и времени бронирования. */
export const BOOKING_TIME_ZONE = 'Asia/Krasnoyarsk';

export interface BookingDateTime {
  date: string;
  time: string;
}

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BOOKING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Форматирует текущий момент без зависимости от часового пояса машины. */
export function currentBookingDateTime(now = new Date(Date.now())): BookingDateTime {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

/** Слот можно начать только строго после текущего момента. */
export function isUpcomingSlot(date: string, startTime: string, now: BookingDateTime): boolean {
  return date > now.date || (date === now.date && startTime > now.time);
}
