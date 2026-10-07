/** Страница одной брони. Фрагмент ссылки остаётся в браузере, API получает секрет в заголовке. */

import { useEffect, useState, type FormEvent } from 'react';

import { ApiError, api, type Booking, type BookingChat } from '../api';
import { bookingLinkUrl, saveBookingLink, type BookingLink } from '../bookingLinks';
import { dayAndMonth, fullWeekdayName, messageDateTime, shortTime } from '../dates';
import { useAsyncData } from '../hooks';
import { CalendarIcon } from './Icons';
import { ErrorState } from './States';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  link: BookingLink;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function BookingPage({ link, theme, onToggleTheme }: Props) {
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const booking = useAsyncData<Booking>(
    (signal) => api.getBooking(link.id, link.token, signal),
    [link.id, link.token, reload],
  );

  useEffect(() => {
    if (booking.status === 'ready') {
      try {
        saveBookingLink(link);
      } catch {
        // Ссылка остаётся в адресной строке, даже если хранилище браузера недоступно.
      }
    }
  }, [booking, link]);

  async function cancel(): Promise<void> {
    setIsCancelling(true);
    setActionError(null);
    try {
      await api.cancelBooking(link.id, link.token);
      setConfirming(false);
      setReload((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Не удалось отменить бронь');
    } finally {
      setIsCancelling(false);
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(bookingLinkUrl(link));
      setCopyStatus('Ссылка скопирована');
    } catch {
      setCopyStatus('Выделите и скопируйте ссылку из поля');
    }
  }

  return (
    <div className="app booking-page">
      <header className="topbar booking-page__topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true"><CalendarIcon /></span>
          <div>
            <p className="topbar__title">Тайм-слоты</p>
            <p className="topbar__subtitle">Страница брони</p>
          </div>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <main className="booking-page__main">
        <a className="booking-page__back" href={window.location.pathname}>← К расписанию</a>
        {booking.status === 'loading' && <p className="loading-line">Загружаем бронь…</p>}
        {booking.status === 'error' && (
          <ErrorState message={booking.message} onRetry={() => setReload((value) => value + 1)} />
        )}
        {booking.status === 'ready' && (
          <>
            <section className="booking-page__details" aria-labelledby="booking-page-title">
              <div className="booking-page__heading">
                <div>
                  <p className="booking-page__eyebrow">Встреча · время Красноярска</p>
                  <h1 id="booking-page-title">{booking.data.activity_name}</h1>
                </div>
                <span className={`booking-page__status${booking.data.status === 'cancelled' ? ' booking-page__status--cancelled' : ''}`}>
                  {booking.data.status === 'active' ? 'Бронь действует' : 'Бронь отменена'}
                </span>
              </div>
              <p className="booking-page__when">
                {fullWeekdayName(booking.data.date)}, {dayAndMonth(booking.data.date)} ·{' '}
                {shortTime(booking.data.start_time)}–{shortTime(booking.data.end_time)}
              </p>
              <p className="booking-page__guest">Гость: {booking.data.guest_name}</p>

              <div className="booking-page__share">
                <label className="field__label" htmlFor="booking-page-link">Секретная ссылка для участников</label>
                <div className="booking-page__share-row">
                  <input
                    id="booking-page-link"
                    className="field__input"
                    value={bookingLinkUrl(link)}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button className="button" type="button" onClick={() => void copyLink()}>
                    Скопировать
                  </button>
                </div>
                <p className="field__hint">Передайте ссылку только участнику встречи. Она также позволяет отменить бронь.</p>
                {copyStatus && <p className="field__hint" role="status">{copyStatus}</p>}
              </div>

              {booking.data.status === 'active' && !confirming && (
                <button className="button button--danger" type="button" onClick={() => setConfirming(true)}>
                  Отменить
                </button>
              )}
              {booking.data.status === 'active' && confirming && (
                <div className="booking-page__confirm" role="group" aria-label="Подтверждение отмены брони">
                  <p>Отменить бронь на {dayAndMonth(booking.data.date)}, {shortTime(booking.data.start_time)}?</p>
                  <div className="booking-page__confirm-actions">
                    <button className="button button--danger" type="button" disabled={isCancelling} onClick={() => void cancel()}>
                      {isCancelling ? 'Отменяем…' : 'Да, отменить'}
                    </button>
                    <button className="button" type="button" onClick={() => setConfirming(false)}>
                      Оставить бронь
                    </button>
                  </div>
                </div>
              )}
              {actionError && <p className="field__error" role="alert">{actionError}</p>}
            </section>

            <BookingMessages key={booking.data.status} link={link} />
          </>
        )}
      </main>
    </div>
  );
}

function BookingMessages({ link }: { link: BookingLink }) {
  const [room, setRoom] = useState<BookingChat | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [senderName, setSenderName] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const load = async (): Promise<void> => {
      if (pending) return;
      pending = true;
      try {
        const next = await api.getBookingChat(link.id, link.token, controller.signal);
        if (!controller.signal.aborted) {
          setRoom(next);
          setLoadError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof ApiError ? error.message : 'Не удалось загрузить переписку');
        }
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 10_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [link.id, link.token, retry]);

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!senderName.trim() || !body.trim() || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      const message = await api.createBookingMessage(link.id, link.token, {
        sender_name: senderName.trim(),
        body: body.trim(),
      });
      setRoom((current) => current === null || current.messages.some((item) => item.id === message.id)
        ? current
        : { ...current, messages: [...current.messages, message] });
      setBody('');
    } catch (error) {
      setSendError(error instanceof ApiError ? error.message : 'Не удалось отправить сообщение');
      if (error instanceof ApiError && error.code === 'chat_closed') {
        setRoom((current) => current === null ? null : { ...current, can_post: false });
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="booking-page__chat" aria-labelledby="booking-chat-title">
      <div className="booking-page__chat-heading">
        <div>
          <p className="booking-page__eyebrow">Обсуждение деталей</p>
          <h2 id="booking-chat-title">Переписка перед встречей</h2>
        </div>
        <span className="booking-page__chat-label">По секретной ссылке</span>
      </div>
      <p className="booking-page__chat-hint">Участники указывают имя сами. Сайт не проверяет, кто отправил сообщение.</p>

      {room === null && loadError === null && <p className="loading-line">Загружаем сообщения…</p>}
      {room === null && loadError !== null && (
        <ErrorState message={loadError} onRetry={() => setRetry((value) => value + 1)} />
      )}
      {room !== null && (
        <>
          {loadError && <p className="field__error" role="alert">Не удалось обновить сообщения: {loadError}</p>}
          {room.messages.length === 0 ? (
            <p className="booking-page__empty">Сообщений пока нет. Начните разговор, если нужно уточнить детали встречи.</p>
          ) : (
            <ol className="booking-page__messages">
              {room.messages.map((message) => (
                <li className="booking-page__message" key={message.id}>
                  <div className="booking-page__message-meta">
                    <strong>{message.sender_name}</strong>
                    <time dateTime={message.created_at}>{messageDateTime(message.created_at)}</time>
                  </div>
                  <p>{message.body}</p>
                </li>
              ))}
            </ol>
          )}
          {room.can_post ? (
            <form className="booking-page__form" onSubmit={(event) => void send(event)}>
              <label className="field" htmlFor="chat-sender-name">
                <span className="field__label">Ваше имя</span>
                <input
                  id="chat-sender-name"
                  className="field__input"
                  value={senderName}
                  onChange={(event) => setSenderName(event.target.value)}
                  maxLength={60}
                  required
                />
              </label>
              <label className="field" htmlFor="chat-message">
                <span className="field__label">Сообщение</span>
                <textarea
                  id="chat-message"
                  className="field__input booking-page__textarea"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={2000}
                  required
                />
              </label>
              {sendError && <p className="field__error" role="alert">{sendError}</p>}
              <button className="button button--primary booking-page__send" type="submit" disabled={isSending}>
                {isSending ? 'Отправляем…' : 'Отправить сообщение'}
              </button>
            </form>
          ) : (
            <p className="booking-page__closed">Переписка закрыта после отмены или начала встречи.</p>
          )}
        </>
      )}
    </section>
  );
}
