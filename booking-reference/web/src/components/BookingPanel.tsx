/**
 * Правая колонка: подсказка, форма брони или подтверждение.
 *
 * Три состояния сменяют друг друга в одном и том же месте экрана, поэтому
 * пользователю не приходится искать, куда переместился результат действия.
 */

import { useState, type CSSProperties, type FormEvent } from 'react';

import type { Activity, Booking, Slot } from '../api';
import { dayAndMonth, fullWeekdayName, minutesLabel, shortTime } from '../dates';
import { CalendarIcon, CheckIcon } from './Icons';

interface Props {
  activity: Activity | null;
  slot: Slot | null;
  confirmed: Booking | null;
  isSending: boolean;
  guestName: string;
  guestEmail: string;
  onGuestNameChange: (value: string) => void;
  onGuestEmailChange: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}

export function BookingPanel(props: Props) {
  const { activity, slot, confirmed, isSending } = props;
  const [wasSubmitted, setWasSubmitted] = useState(false);

  if (confirmed !== null) {
    return <Confirmation booking={confirmed} onReset={props.onReset} />;
  }

  if (slot === null || activity === null) {
    return (
      <div className="panel panel--hint" data-testid="booking-hint">
        <CalendarIcon className="panel__icon" />
        <h2 className="panel__title">Выберите время</h2>
        <p className="panel__text">
          Нажмите на свободный слот в календаре. Здесь появится форма записи.
        </p>
      </div>
    );
  }

  const nameIsEmpty = props.guestName.trim() === '';
  const emailIsWrong = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(props.guestEmail);

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setWasSubmitted(true);
    if (!nameIsEmpty && !emailIsWrong) {
      props.onSubmit();
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate data-testid="booking-form">
      <h2 className="panel__title">Запись на встречу</h2>

      <dl className="summary" style={{ '--activity-color': activity.color } as CSSProperties}>
        <div className="summary__row">
          <dt>Активность</dt>
          <dd>{activity.name}</dd>
        </div>
        <div className="summary__row">
          <dt>День</dt>
          <dd>
            {fullWeekdayName(slot.date)}, {dayAndMonth(slot.date)}
          </dd>
        </div>
        <div className="summary__row">
          <dt>Время</dt>
          <dd className="summary__time">
            {shortTime(slot.start_time)} – {shortTime(slot.end_time)}
            <span className="summary__duration">{minutesLabel(activity.duration_minutes)}</span>
          </dd>
        </div>
      </dl>

      <div className="field">
        <label className="field__label" htmlFor="guest-name">
          Как вас зовут
        </label>
        <input
          id="guest-name"
          className="field__input"
          type="text"
          autoComplete="name"
          placeholder="Иван Петров"
          value={props.guestName}
          onChange={(event) => props.onGuestNameChange(event.target.value)}
          aria-invalid={wasSubmitted && nameIsEmpty}
          aria-describedby={wasSubmitted && nameIsEmpty ? 'guest-name-error' : undefined}
        />
        {wasSubmitted && nameIsEmpty && (
          <p className="field__error" id="guest-name-error">
            Укажите имя, организатор увидит его в календаре
          </p>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="guest-email">
          Почта
        </label>
        <input
          id="guest-email"
          className="field__input"
          type="email"
          autoComplete="email"
          placeholder="ivan@example.com"
          value={props.guestEmail}
          onChange={(event) => props.onGuestEmailChange(event.target.value)}
          aria-invalid={wasSubmitted && emailIsWrong}
          aria-describedby="guest-email-hint"
        />
        <p className="field__hint" id="guest-email-hint">
          {wasSubmitted && emailIsWrong
            ? 'Проверьте адрес: он должен быть вида ivan@example.com'
            : 'По этому адресу вы найдёте свои брони. Регистрация не нужна.'}
        </p>
      </div>

      <button type="submit" className="button button--primary" disabled={isSending}>
        {isSending ? 'Отправляем…' : 'Забронировать'}
      </button>
    </form>
  );
}

function Confirmation({ booking, onReset }: { booking: Booking; onReset: () => void }) {
  return (
    <div className="panel panel--done" data-testid="booking-confirmation">
      <span className="panel__badge" aria-hidden="true">
        <CheckIcon />
      </span>
      <h2 className="panel__title">Вы записаны</h2>
      <p className="panel__text">
        {booking.activity_name}, {fullWeekdayName(booking.date).toLowerCase()}{' '}
        {dayAndMonth(booking.date)}, {shortTime(booking.start_time)} –{' '}
        {shortTime(booking.end_time)}.
      </p>
      <p className="panel__text panel__text--muted">
        Подтверждение на почту мы не отправляем: бронь видна в списке ниже.
      </p>
      <button type="button" className="button" onClick={onReset}>
        Записаться ещё раз
      </button>
    </div>
  );
}
