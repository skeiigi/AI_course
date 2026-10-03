/**
 * Три состояния экрана, которые встречаются чаще всего: загрузка, пусто, ошибка.
 * Вынесены отдельно, чтобы выглядели одинаково во всех местах интерфейса.
 */

import { AlertIcon, CalendarIcon } from './Icons';

/** Заглушка на время загрузки: повторяет форму будущей сетки, поэтому экран не «прыгает». */
export function SlotGridSkeleton() {
  const columns = [4, 0, 3, 5, 2, 4, 0];

  return (
    <div className="calendar calendar--skeleton" aria-busy="true" aria-label="Слоты загружаются">
      {columns.map((count, columnIndex) => (
        <section className="day" key={columnIndex}>
          <header className="day__header">
            <span className="skeleton skeleton--label" />
          </header>
          <div className="day__slots">
            {Array.from({ length: count }, (_, slotIndex) => (
              <span className="skeleton skeleton--slot" key={slotIndex} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="state state--empty">
      <CalendarIcon className="state__icon" />
      <p className="state__title">{title}</p>
      <p className="state__hint">{hint}</p>
      {action !== undefined && (
        <button type="button" className="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="state state--error" role="alert">
      <AlertIcon className="state__icon" />
      <p className="state__title">Не удалось загрузить данные</p>
      <p className="state__hint">{message}</p>
      {onRetry !== undefined && (
        <button type="button" className="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}
