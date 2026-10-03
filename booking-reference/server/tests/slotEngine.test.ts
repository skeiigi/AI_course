/** Модульные тесты движка слотов. Базы данных здесь нет, только чистые функции. */

import { describe, expect, it } from 'vitest';

import type { Activity, Schedule } from '../src/schemas.js';
import {
  MAX_RANGE_DAYS,
  addDays,
  buildSlots,
  daysInRange,
  eachDay,
  findSlot,
  isoWeekday,
  minutesToTime,
  timeToMinutes,
  timesForSchedule,
} from '../src/slotEngine.js';

const activity = (duration: number): Activity => ({
  id: 1,
  name: 'Консультация',
  duration_minutes: duration,
  description: '',
  color: '#3b5bdb',
});

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 10,
  activity_id: 1,
  weekdays: [1, 2, 3, 4, 5],
  start_time: '10:00:00',
  end_time: '12:00:00',
  step_minutes: 30,
  ...overrides,
});

describe('перевод времени', () => {
  it('переводит время в минуты от полуночи', () => {
    expect(timeToMinutes('00:00:00')).toBe(0);
    expect(timeToMinutes('09:30:00')).toBe(570);
    expect(timeToMinutes('23:59:00')).toBe(1439);
  });

  it('переводит минуты обратно во время', () => {
    expect(minutesToTime(0)).toBe('00:00:00');
    expect(minutesToTime(570)).toBe('09:30:00');
    expect(minutesToTime(1439)).toBe('23:59:00');
  });
});

describe('работа с датами', () => {
  it('считает день недели по ISO: понедельник это 1, воскресенье это 7', () => {
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-10')).toBe(6);
    expect(isoWeekday('2026-10-11')).toBe(7);
  });

  it('сдвигает дату на нужное число дней и переходит через границу месяца', () => {
    expect(addDays('2026-10-05', 3)).toBe('2026-10-08');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('считает длину диапазона вместе с обеими границами', () => {
    expect(daysInRange('2026-10-05', '2026-10-05')).toBe(1);
    expect(daysInRange('2026-10-05', '2026-10-11')).toBe(7);
  });

  it('перечисляет все дни диапазона', () => {
    expect(eachDay('2026-10-05', '2026-10-07')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
  });
});

describe('сетка слотов внутри рабочего окна', () => {
  it('строит слоты с шагом, равным длительности', () => {
    const times = timesForSchedule(schedule(), 30);
    expect(times).toHaveLength(4);
    expect(times[0]).toEqual({ start_time: '10:00:00', end_time: '10:30:00' });
    expect(times[3]).toEqual({ start_time: '11:30:00', end_time: '12:00:00' });
  });

  it('не выпускает слот за пределы рабочего окна', () => {
    // Длительность 45 минут при шаге 30: слот с началом 11:30 кончился бы
    // в 12:15 и вышел бы за окно, поэтому в сетку он не попадает.
    const times = timesForSchedule(schedule(), 45);
    expect(times.map((time) => time.start_time)).toEqual(['10:00:00', '10:30:00', '11:00:00']);
    expect(times.at(-1)?.end_time).toBe('11:45:00');
  });

  it('допускает слоты внахлёст, если шаг меньше длительности', () => {
    const times = timesForSchedule(schedule({ step_minutes: 15 }), 30);
    expect(times.map((time) => time.start_time)).toEqual([
      '10:00:00',
      '10:15:00',
      '10:30:00',
      '10:45:00',
      '11:00:00',
      '11:15:00',
      '11:30:00',
    ]);
  });

  it('возвращает пустую сетку, если слот длиннее рабочего окна', () => {
    expect(timesForSchedule(schedule(), 180)).toEqual([]);
  });
});

describe('построение слотов на диапазон дат', () => {
  it('пропускает дни недели, которых нет в расписании', () => {
    // 10 и 11 октября 2026 это суббота и воскресенье.
    const slots = buildSlots(activity(30), [schedule()], [], '2026-10-09', '2026-10-11');
    expect(new Set(slots.map((slot) => slot.date))).toEqual(new Set(['2026-10-09']));
  });

  it('помечает занятыми слоты, на которые есть бронь', () => {
    const busy = [{ date: '2026-10-05', start_time: '10:30:00' }];
    const slots = buildSlots(activity(30), [schedule()], busy, '2026-10-05', '2026-10-05');
    const taken = slots.filter((slot) => !slot.is_free);
    expect(taken).toHaveLength(1);
    expect(taken[0].start_time).toBe('10:30:00');
  });

  it('объединяет слоты нескольких расписаний одной активности', () => {
    const morning = schedule({ id: 1, weekdays: [1] });
    const evening = schedule({ id: 2, weekdays: [1], start_time: '18:00:00', end_time: '19:00:00' });
    const slots = buildSlots(activity(30), [morning, evening], [], '2026-10-05', '2026-10-05');
    expect(slots).toHaveLength(6);
    expect(slots.map((slot) => slot.schedule_id)).toEqual([1, 1, 1, 1, 2, 2]);
  });

  it('сортирует слоты по дате и времени начала', () => {
    const slots = buildSlots(activity(30), [schedule()], [], '2026-10-05', '2026-10-06');
    const keys = slots.map((slot) => `${slot.date} ${slot.start_time}`);
    expect(keys).toEqual([...keys].sort());
  });

  it('отдаёт пустой список, если расписаний нет', () => {
    expect(buildSlots(activity(30), [], [], '2026-10-05', '2026-10-09')).toEqual([]);
  });

  it('ограничение диапазона задано и равно 60 дням', () => {
    expect(MAX_RANGE_DAYS).toBe(60);
  });
});

describe('поиск слота по времени начала', () => {
  it('находит слот, который есть в сетке', () => {
    const slot = findSlot(activity(30), [schedule()], '2026-10-05', '11:00:00');
    expect(slot?.end_time).toBe('11:30:00');
  });

  it('не находит время между узлами сетки', () => {
    expect(findSlot(activity(30), [schedule()], '2026-10-05', '10:07:00')).toBeNull();
  });

  it('не находит слот в день, которого нет в расписании', () => {
    expect(findSlot(activity(30), [schedule()], '2026-10-10', '10:00:00')).toBeNull();
  });
});
