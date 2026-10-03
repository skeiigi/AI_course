/** Список броней гостя. Гость опознаётся по почте, учётной записи у него нет. */

import type { Booking } from '../api';
import { dayAndMonth, fullWeekdayName, shortTime } from '../dates';
import type { Loadable } from '../hooks';

interface Props {
  guestEmail: string;
  bookings: Loadable<Booking[]>;
  cancellingId: number | null;
  onCancel: (booking: Booking) => void;
}

export function MyBookings({ guestEmail, bookings, cancellingId, onCancel }: Props) {
  return (
    <section className="bookings" aria-labelledby="bookings-title">
      <h2 className="bookings__title" id="bookings-title">
        Мои брони
      </h2>

      {guestEmail === '' ? (
        <p className="bookings__hint">
          Введите почту в форме записи, и здесь появятся ваши брони.
        </p>
      ) : bookings.status === 'loading' ? (
        <p className="bookings__hint">Загружаем брони для {guestEmail}…</p>
      ) : bookings.status === 'error' ? (
        <p className="bookings__hint bookings__hint--error" role="alert">
          {bookings.message}
        </p>
      ) : bookings.data.length === 0 ? (
        <p className="bookings__hint">Броней на {guestEmail} пока нет.</p>
      ) : (
        <ul className="bookings__list">
          {bookings.data.map((booking) => (
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

              {booking.status === 'active' ? (
                <button
                  type="button"
                  className="button button--danger button--small"
                  onClick={() => onCancel(booking)}
                  disabled={cancellingId === booking.id}
                >
                  {cancellingId === booking.id ? 'Отменяем…' : 'Отменить'}
                </button>
              ) : (
                <span className="tag">отменена</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
