/**
 * Правая колонка: подсказка, форма брони или подтверждение.
 *
 * Три состояния сменяют друг друга в одном и том же месте экрана, поэтому
 * пользователю не приходится искать, куда переместился результат действия.
 */

import { useState, type CSSProperties, type FormEvent } from 'react';

import type { Activity, BookingCreated, Slot } from '../api';
import { bookingLinkUrl } from '../bookingLinks';
import type { BookingLink } from '../bookingLinks';
import { dayAndMonth, fullWeekdayName, minutesLabel, shortTime, slotsLabel } from '../dates';
import { CalendarIcon, CheckIcon } from './Icons';

interface Props {
  activity: Activity | null;
  slots: Slot[];
  confirmed: BookingCreated[] | null;
  isSending: boolean;
  guestName: string;
  guestEmail: string;
  onGuestNameChange: (value: string) => void;
  onGuestEmailChange: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onCopyLink: (link: BookingLink) => void;
}

export function BookingPanel(props: Props) {
  const { activity, slots, confirmed, isSending } = props;
  const [wasSubmitted, setWasSubmitted] = useState(false);

  if (confirmed !== null) {
    return <Confirmation bookings={confirmed} onReset={props.onReset} onCopyLink={props.onCopyLink} />;
  }

  if (slots.length === 0 || activity === null) {
    return (
      <div className="panel panel--hint" data-testid="booking-hint">
        <CalendarIcon className="panel__icon" />
        <h2 className="panel__title">Выберите время</h2>
        <p className="panel__text">
          Выберите один или несколько свободных слотов в календаре. Здесь появится форма записи.
        </p>
      </div>
    );
  }

  const nameIsEmpty = props.guestName.trim() === '';
  const emailIsWrong = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(props.guestEmail);
  const slot = slots[0];

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setWasSubmitted(true);
    if (!nameIsEmpty && !emailIsWrong) {
      props.onSubmit();
    }
  };

  return (
    <form className="panel" id="booking" onSubmit={handleSubmit} noValidate data-testid="booking-form">
      <h2 className="panel__title">{slots.length === 1 ? 'Запись на встречу' : `Запись на ${slotsLabel(slots.length)}`}</h2>

      <dl className="summary" style={{ '--activity-color': activity.color } as CSSProperties}>
        <div className="summary__row">
          <dt>Активность</dt>
          <dd>{activity.name}</dd>
        </div>
        {slots.length === 1 ? (
          <>
            <div className="summary__row">
              <dt>День</dt>
              <dd>{fullWeekdayName(slot.date)}, {dayAndMonth(slot.date)}</dd>
            </div>
            <div className="summary__row">
              <dt>Время</dt>
              <dd className="summary__time">
                {shortTime(slot.start_time)} – {shortTime(slot.end_time)}
                <span className="summary__duration">{minutesLabel(activity.duration_minutes)}</span>
              </dd>
            </div>
          </>
        ) : (
          <div className="summary__row">
            <dt>Выбрано</dt>
            <dd>
              <ul className="booking-slots">
                {slots.map((item) => (
                  <li key={`${item.date}-${item.start_time}`}>
                    {dayAndMonth(item.date)}, {shortTime(item.start_time)} – {shortTime(item.end_time)}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
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
            : 'Контактный адрес. Для доступа к брони сохраните секретную ссылку.'}
        </p>
      </div>

      <button type="submit" className="button button--primary" disabled={isSending}>
        {isSending ? 'Отправляем…' : slots.length === 1 ? 'Забронировать' : `Забронировать ${slotsLabel(slots.length)}`}
      </button>
    </form>
  );
}

function Confirmation({
  bookings,
  onReset,
  onCopyLink,
}: {
  bookings: BookingCreated[];
  onReset: () => void;
  onCopyLink: (link: BookingLink) => void;
}) {
  const single = bookings.length === 1;
  return (
    <div className="panel panel--done" data-testid="booking-confirmation">
      <span className="panel__badge" aria-hidden="true">
        <CheckIcon />
      </span>
      <h2 className="panel__title">{single ? 'Вы записаны' : `Вы записаны на ${slotsLabel(bookings.length)}`}</h2>
      {bookings.map(({ booking }) => (
        <p className="panel__text" key={booking.id}>
          {booking.activity_name}, {fullWeekdayName(booking.date).toLowerCase()}{' '}
          {dayAndMonth(booking.date)}, {shortTime(booking.start_time)} –{' '}
          {shortTime(booking.end_time)}.
        </p>
      ))}
      <p className="panel__text panel__text--muted">
        Подтверждение на почту мы не отправляем. Сохраните {single ? 'ссылку ниже' : 'ссылки ниже'}.
      </p>
      {bookings.map(({ booking, access_token: token }, index) => {
        const link = bookingLinkUrl({ id: booking.id, token });
        return (
          <div className="field" key={booking.id}>
            <label className="field__label" htmlFor={`booking-link-${booking.id}`}>
              {single ? 'Секретная ссылка на бронь' : `Секретная ссылка на бронь ${index + 1}`}
            </label>
            <input
              id={`booking-link-${booking.id}`}
              className="field__input"
              type="text"
              value={link}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
            {single && <p className="field__hint">
              Сохраните ссылку: по ней можно открыть и отменить бронь на другом устройстве.
              Любой, у кого есть ссылка, получит доступ к брони.
            </p>}
            <button
              type="button"
              className="button button--small"
              onClick={() => onCopyLink({ id: booking.id, token })}
            >
              Скопировать ссылку{single ? '' : ` ${index + 1}`}
            </button>
            <a className="button button--small" href={link}>
              Открыть страницу брони{single ? '' : ` ${index + 1}`}
            </a>
          </div>
        );
      })}
      {!single && <p className="field__hint">Каждая ссылка даёт доступ к отдельной брони. Сохраните все ссылки.</p>}
      <button type="button" className="button" onClick={onReset}>
        Записаться ещё раз
      </button>
    </div>
  );
}
