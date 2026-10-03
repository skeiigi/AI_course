/**
 * Вычисление тайм-слотов из расписаний.
 *
 * Слоты нигде не хранятся: каждый раз, когда их просят, мы считаем их заново.
 * Почему так, написано в docs/adr/0002.
 *
 * Все функции этого файла чистые: принимают данные и возвращают данные,
 * в базу не ходят. Поэтому их легко проверять модульными тестами.
 *
 * Даты и время везде представлены строками «ГГГГ-ММ-ДД» и «ЧЧ:ММ:СС».
 * Объект Date используется только там, где нужен день недели, и всегда в UTC:
 * иначе результат зависел бы от часового пояса машины, на которой запущен код.
 */

import type { Activity, Schedule, Slot } from './schemas.js';

/** Ограничение на длину запрашиваемого диапазона дат. */
export const MAX_RANGE_DAYS = 60;

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

/** Переводит время в число минут от полуночи: «09:30:00» в 570. */
export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Обратный перевод: 570 в «09:30:00». */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${pad(hours)}:${pad(rest)}:00`;
}

/** День недели по ISO: 1 это понедельник, 7 это воскресенье. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Дата, сдвинутая на несколько дней: addDays('2026-10-05', 2) даёт '2026-10-07'. */
export function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`).getTime() + days * MILLISECONDS_IN_DAY;
  return new Date(shifted).toISOString().slice(0, 10);
}

/** Сколько дней в диапазоне, включая обе границы. */
export function daysInRange(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00Z`).getTime();
  const to = new Date(`${dateTo}T00:00:00Z`).getTime();
  return Math.round((to - from) / MILLISECONDS_IN_DAY) + 1;
}

/** Список дат от первой до последней включительно. */
export function eachDay(dateFrom: string, dateTo: string): string[] {
  const days: string[] = [];
  for (let day = dateFrom; day <= dateTo; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * Строит сетку начал и концов слотов внутри рабочего окна расписания.
 *
 * Шаг сетки берётся из расписания, длина слота из активности. Это разные числа:
 * шаг 30 минут при длительности 45 минут даёт слоты, которые накладываются
 * друг на друга. Так задумано, смотри docs/ontology.md, раздел 7.
 *
 * Слот попадает в результат, только если целиком помещается в рабочее окно.
 */
export function timesForSchedule(
  schedule: Schedule,
  durationMinutes: number,
): Array<{ start_time: string; end_time: string }> {
  const windowStart = timeToMinutes(schedule.start_time);
  const windowEnd = timeToMinutes(schedule.end_time);

  const times: Array<{ start_time: string; end_time: string }> = [];
  for (let start = windowStart; start + durationMinutes <= windowEnd; start += schedule.step_minutes) {
    times.push({
      start_time: minutesToTime(start),
      end_time: minutesToTime(start + durationMinutes),
    });
  }
  return times;
}

/** Ключ занятости: дата и время начала одной действующей брони. */
export interface BusySlot {
  date: string;
  start_time: string;
}

/**
 * Собирает все слоты активности на диапазон дат.
 * Слот считается занятым, если на эту дату и это время есть действующая бронь.
 */
export function buildSlots(
  activity: Activity,
  schedules: Schedule[],
  busy: BusySlot[],
  dateFrom: string,
  dateTo: string,
): Slot[] {
  // Множество занятых пар «дата и время начала»: проверка занятости
  // получается за одно обращение вместо перебора всех броней.
  const busyKeys = new Set(busy.map((booking) => `${booking.date} ${booking.start_time}`));

  const slots: Slot[] = [];
  for (const day of eachDay(dateFrom, dateTo)) {
    const weekday = isoWeekday(day);
    for (const schedule of schedules) {
      if (!schedule.weekdays.includes(weekday)) {
        continue;
      }
      for (const time of timesForSchedule(schedule, activity.duration_minutes)) {
        slots.push({
          activity_id: activity.id,
          schedule_id: schedule.id,
          date: day,
          start_time: time.start_time,
          end_time: time.end_time,
          is_free: !busyKeys.has(`${day} ${time.start_time}`),
        });
      }
    }
  }

  slots.sort(compareSlots);
  return slots;
}

/**
 * Ищет в сетке слот с нужным началом. Возвращает null, если такого слота нет.
 *
 * Это защита от брони на произвольное время: гость не сможет записаться
 * на 09:07, если сетка идёт с шагом 30 минут от 09:00.
 */
export function findSlot(
  activity: Activity,
  schedules: Schedule[],
  date: string,
  startTime: string,
): Slot | null {
  const slots = buildSlots(activity, schedules, [], date, date);
  return slots.find((slot) => slot.start_time === startTime) ?? null;
}

/** Порядок слотов: по дате, внутри дня по времени начала, затем по расписанию. */
function compareSlots(left: Slot, right: Slot): number {
  if (left.date !== right.date) {
    return left.date < right.date ? -1 : 1;
  }
  if (left.start_time !== right.start_time) {
    return left.start_time < right.start_time ? -1 : 1;
  }
  return left.schedule_id - right.schedule_id;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
