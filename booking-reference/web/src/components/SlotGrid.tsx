/**
 * Сетка слотов на неделю.
 *
 * На широком экране это семь колонок календаря, на узком тот же самый разметочный
 * код превращается в список дней. Перестроение делает только CSS, смотри
 * медиазапрос для .calendar в styles.css.
 */

import type { Slot } from '../api';
import { dayNumber, fullWeekdayName, isoWeekday, shortTime, shortWeekdayName, slotsLabel } from '../dates';
import { LockIcon } from './Icons';

interface Props {
  days: string[];
  slots: Slot[];
  today: string;
  selected: Slot | null;
  onPick: (slot: Slot) => void;
  onBusyPick: (slot: Slot) => void;
}

/** Раскладывает слоты по дням: ключ это дата, значение это слоты этого дня. */
function groupByDay(slots: Slot[]): Map<string, Slot[]> {
  const grouped = new Map<string, Slot[]>();
  for (const slot of slots) {
    const daySlots = grouped.get(slot.date) ?? [];
    daySlots.push(slot);
    grouped.set(slot.date, daySlots);
  }
  return grouped;
}

export function SlotGrid({ days, slots, today, selected, onPick, onBusyPick }: Props) {
  const byDay = groupByDay(slots);

  return (
    <div className="calendar">
      {days.map((day) => {
        const daySlots = byDay.get(day) ?? [];
        const isToday = day === today;
        const isPast = day < today;
        const isWeekend = isoWeekday(day) >= 6;

        const modifiers = [
          isToday ? 'day--today' : '',
          isPast ? 'day--past' : '',
          isWeekend ? 'day--weekend' : '',
        ].join(' ');

        return (
          <section
            key={day}
            className={`day ${modifiers}`.trimEnd()}
            aria-label={`${fullWeekdayName(day)}, ${dayNumber(day)} число, ${slotsLabel(daySlots.length)}`}
          >
            <header className="day__header">
              <span className="day__weekday">{shortWeekdayName(day)}</span>
              <span className="day__number">{dayNumber(day)}</span>
              {isToday && <span className="day__badge">сегодня</span>}
            </header>

            <div className="day__slots">
              {daySlots.length === 0 ? (
                <p className="day__empty">нет приёма</p>
              ) : (
                daySlots.map((slot) => (
                  <SlotButton
                    key={`${slot.schedule_id}-${slot.start_time}`}
                    slot={slot}
                    day={day}
                    isSelected={
                      selected !== null &&
                      selected.date === slot.date &&
                      selected.start_time === slot.start_time
                    }
                    onPick={onPick}
                    onBusyPick={onBusyPick}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface SlotButtonProps {
  slot: Slot;
  day: string;
  isSelected: boolean;
  onPick: (slot: Slot) => void;
  onBusyPick: (slot: Slot) => void;
}

function SlotButton({ slot, day, isSelected, onPick, onBusyPick }: SlotButtonProps) {
  const range = `${shortTime(slot.start_time)} – ${shortTime(slot.end_time)}`;
  const state = slot.is_free ? (isSelected ? 'выбрано' : 'свободно') : 'занято';

  return (
    <button
      type="button"
      className={`slot${slot.is_free ? '' : ' slot--busy'}${isSelected ? ' slot--picked' : ''}`}
      // Занятый слот остаётся обычной кнопкой, а не выключенной: нажатие
      // объясняет причину отказа. Выключенная кнопка молчала бы, а атрибут
      // aria-disabled обещал бы, что нажатие ничего не делает.
      // Состояние «занято» названо прямо в aria-label.
      aria-pressed={slot.is_free ? isSelected : undefined}
      aria-label={`${range}, ${fullWeekdayName(day)} ${dayNumber(day)}, ${state}`}
      // В плашке помещается только начало слота: колонка календаря узкая.
      // Полный промежуток лежит в подсказке и в aria-label, а ещё он виден
      // в правой колонке, когда слот выбран.
      title={`${range}, ${state}`}
      onClick={() => (slot.is_free ? onPick(slot) : onBusyPick(slot))}
    >
      <span className="slot__start">{shortTime(slot.start_time)}</span>
      {!slot.is_free && <LockIcon className="slot__lock" />}
    </button>
  );
}
