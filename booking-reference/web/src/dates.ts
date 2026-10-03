/**
 * Работа с датами для календаря.
 *
 * Даты везде представлены строками «ГГГГ-ММ-ДД», как в API. Объект Date
 * используется только для вычислений и всегда в UTC, чтобы результат
 * не зависел от часового пояса браузера.
 */

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

const WEEKDAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function toDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** Сегодняшняя дата в виде «ГГГГ-ММ-ДД» по местному календарю пользователя. */
export function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(toDate(date).getTime() + days * MILLISECONDS_IN_DAY).toISOString().slice(0, 10);
}

/** День недели по ISO: 1 это понедельник, 7 это воскресенье. */
export function isoWeekday(date: string): number {
  const day = toDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Понедельник той недели, в которую попадает дата. */
export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Семь дат недели, начиная с понедельника. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export const shortWeekdayName = (date: string): string => WEEKDAY_SHORT[isoWeekday(date) - 1];
export const fullWeekdayName = (date: string): string => WEEKDAY_NAMES[isoWeekday(date) - 1];

/** Номер дня месяца без ведущего нуля: «5». */
export const dayNumber = (date: string): string => String(toDate(date).getUTCDate());

/** «5 октября». */
export function dayAndMonth(date: string): string {
  return `${dayNumber(date)} ${MONTHS_GENITIVE[toDate(date).getUTCMonth()]}`;
}

/** Заголовок недели: «5–11 октября 2026» или «29 сентября – 5 октября 2026». */
export function weekTitle(weekStart: string): string {
  const weekEnd = addDays(weekStart, 6);
  const year = toDate(weekEnd).getUTCFullYear();
  const sameMonth = toDate(weekStart).getUTCMonth() === toDate(weekEnd).getUTCMonth();
  if (sameMonth) {
    return `${dayNumber(weekStart)}–${dayAndMonth(weekEnd)} ${year}`;
  }
  return `${dayAndMonth(weekStart)} – ${dayAndMonth(weekEnd)} ${year}`;
}

/** «10:00:00» в «10:00». Секунды в интерфейсе не нужны. */
export const shortTime = (time: string): string => time.slice(0, 5);

/** Склонение слова «минута»: 30 минут, 45 минут, 1 минута. */
export function minutesLabel(minutes: number): string {
  const lastTwo = minutes % 100;
  const last = minutes % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${minutes} минут`;
  if (last === 1) return `${minutes} минута`;
  if (last >= 2 && last <= 4) return `${minutes} минуты`;
  return `${minutes} минут`;
}

/** Склонение слова «слот»: 1 слот, 3 слота, 8 слотов. */
export function slotsLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} слотов`;
  if (last === 1) return `${count} слот`;
  if (last >= 2 && last <= 4) return `${count} слота`;
  return `${count} слотов`;
}
