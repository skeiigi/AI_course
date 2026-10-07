/** Брони, для которых в этом браузере сохранены секретные ссылки. */

import { useState } from 'react';

import type { Booking } from '../api';
import { dayAndMonth, fullWeekdayName, shortTime } from '../dates';
import type { Loadable } from '../hooks';
import { bookingLinkUrl, type BookingLink } from '../bookingLinks';

interface Props {
  bookings: Loadable<Booking[]>;
  cancellingId: number | null;
  onCancel: (booking: Booking) => void;
  onCopyLink: (booking: Booking) => void;
  links: BookingLink[];
}

export function MyBookings({ bookings, cancellingId, onCancel, onCopyLink, links }: Props) {
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  return (
    <section className="bookings" aria-labelledby="bookings-title">
      <h2 className="bookings__title" id="bookings-title">
        Мои брони
      </h2>

      {bookings.status === 'loading' ? (
        <p className="bookings__hint">Загружаем сохранённые брони…</p>
      ) : bookings.status === 'error' ? (
        <p className="bookings__hint bookings__hint--error" role="alert">
          {bookings.message}
        </p>
      ) : bookings.data.length === 0 ? (
        <p className="bookings__hint">
          Здесь появятся брони, созданные в этом браузере или открытые по секретной ссылке.
        </p>
      ) : (
        <ul className="bookings__list">
          {bookings.data.map((booking) => {
            const link = links.find((item) => item.id === booking.id);
            return (
            <li
              key={booking.id}
              className={`booking${booking.status === 'cancelled' ? ' booking--cancelled' : ''}`}
            >
              <div className="booking__main">
                <p className="booking__activity">{booking.activity_name}</p>
                <p className="booking__when">
                  {fullWeekdayName(booking.date)}, {dayAndMonth(booking.date)},{' '}
                  <span className="booking__time">
                    {shortTime(booking.start_time)} – {shortTime(booking.end_time)}
                  </span>
                </p>
              </div>

              <div className="booking__actions">
                {link !== undefined && (
                  <a className="button button--small" href={bookingLinkUrl(link)}>
                    Открыть
                  </a>
                )}
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => onCopyLink(booking)}
                  aria-label={`Скопировать ссылку на бронь ${booking.id}`}
                >
                  Скопировать ссылку
                </button>
                {booking.status === 'active' && confirmingId !== booking.id ? (
                  <button
                    type="button"
                    className="button button--danger button--small"
                    onClick={() => setConfirmingId(booking.id)}
                    disabled={cancellingId === booking.id}
                  >
                    {cancellingId === booking.id ? 'Отменяем…' : 'Отменить'}
                  </button>
                ) : booking.status === 'cancelled' ? (
                  <span className="tag">отменена</span>
                ) : null}
              </div>
              {booking.status === 'active' && confirmingId === booking.id && (
                <div className="booking__confirm" role="group" aria-label={`Подтверждение отмены брони ${booking.id}`}>
                  <p>Отменить бронь на {dayAndMonth(booking.date)}, {shortTime(booking.start_time)}?</p>
                  <div className="booking__confirm-actions">
                    <button
                      type="button"
                      className="button button--danger button--small"
                      disabled={cancellingId === booking.id}
                      onClick={() => {
                        setConfirmingId(null);
                        onCancel(booking);
                      }}
                    >
                      Да, отменить
                    </button>
                    <button type="button" className="button button--small" onClick={() => setConfirmingId(null)}>
                      Оставить бронь
                    </button>
                  </div>
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
