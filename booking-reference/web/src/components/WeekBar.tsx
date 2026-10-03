/** Строка управления неделей: перелистывание, заголовок и условные обозначения. */

import { weekTitle } from '../dates';
import { ChevronLeft, ChevronRight } from './Icons';

interface Props {
  weekStart: string;
  isCurrentWeek: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function WeekBar({ weekStart, isCurrentWeek, onPrevious, onNext, onToday }: Props) {
  return (
    <div className="weekbar">
      <div className="weekbar__nav">
        <button type="button" className="icon-button" onClick={onPrevious} aria-label="Предыдущая неделя">
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={onToday}
          disabled={isCurrentWeek}
        >
          Текущая неделя
        </button>
        <button type="button" className="icon-button" onClick={onNext} aria-label="Следующая неделя">
          <ChevronRight />
        </button>
      </div>

      {/* aria-live сообщает программам чтения с экрана, что заголовок сменился. */}
      <p className="weekbar__title" aria-live="polite">
        {weekTitle(weekStart)}
      </p>

      <ul className="legend">
        <li className="legend__item">
          <span className="legend__swatch legend__swatch--free" aria-hidden="true" />
          свободно
        </li>
        <li className="legend__item">
          <span className="legend__swatch legend__swatch--busy" aria-hidden="true" />
          занято
        </li>
        <li className="legend__item">
          <span className="legend__swatch legend__swatch--picked" aria-hidden="true" />
          выбрано
        </li>
      </ul>
    </div>
  );
}
