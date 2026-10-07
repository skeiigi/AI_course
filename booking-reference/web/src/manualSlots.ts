/** Подбор существующих слотов для введённого вручную интервала. */

import type { Slot } from './api';

function normalizeTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new Error('Укажите корректное время начала и окончания');
  }
  return value.length === 5 ? `${value}:00` : value;
}

export function selectSlotsInInterval(
  slots: Slot[],
  date: string,
  startInput: string,
  endInput: string,
): Slot[] {
  const start = normalizeTime(startInput);
  const end = normalizeTime(endInput);
  if (start >= end) {
    throw new Error('Время окончания должно быть позже начала');
  }

  const matching = slots
    .filter((slot) => slot.date === date && slot.start_time >= start && slot.end_time <= end)
    .sort((left, right) => left.start_time.localeCompare(right.start_time))
    .filter((slot, index, ordered) => index === 0 || slot.start_time !== ordered[index - 1].start_time);

  if (matching.length === 0 || matching[0].start_time !== start || matching.at(-1)?.end_time !== end) {
    throw new Error('Начало и конец должны совпадать с границами слотов расписания');
  }

  let coveredUntil = start;
  for (const slot of matching) {
    if (slot.start_time > coveredUntil) {
      throw new Error('В выбранном интервале есть промежуток без слотов');
    }
    if (!slot.is_free) {
      throw new Error('В выбранном интервале есть занятый слот');
    }
    if (slot.end_time > coveredUntil) {
      coveredUntil = slot.end_time;
    }
  }

  return matching;
}
