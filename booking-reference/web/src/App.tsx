/**
 * Главный компонент: собирает экран из частей и держит состояние.
 *
 * Данные грузятся тремя хуками, каждый со своим состоянием загрузки и ошибки.
 * Счётчик reload нужен, чтобы после брони или отмены сетка и список броней
 * перечитались с сервера, а не показывали устаревшую картину.
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import { ApiError, api, type Activity, type Booking, type Slot } from './api';
import {
  addDays,
  dayAndMonth,
  minutesLabel,
  shortTime,
  slotsLabel,
  startOfWeek,
  today,
  weekDays,
} from './dates';
import { useAsyncData, useRememberedValue } from './hooks';
import { ActivityPicker } from './components/ActivityPicker';
import { BookingPanel } from './components/BookingPanel';
import { HowItWorks } from './components/HowItWorks';
import { CalendarIcon } from './components/Icons';
import { MyBookings } from './components/MyBookings';
import { SlotGrid } from './components/SlotGrid';
import { EmptyState, ErrorState, SlotGridSkeleton } from './components/States';
import { Toast, type ToastMessage } from './components/Toast';
import { WeekBar } from './components/WeekBar';

const DEFAULT_ACCENT = '#3b5bdb';

export function App() {
  const todayDate = today();

  const [activityId, setActivityId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayDate));
  const [reload, setReload] = useState(0);

  const [selected, setSelected] = useState<Slot | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [guestName, setGuestName] = useRememberedValue('booking.guest-name');
  const [guestEmail, setGuestEmail] = useRememberedValue('booking.guest-email');
  const [bookingsEmail, setBookingsEmail] = useState(guestEmail);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const hideToast = useCallback(() => setToast(null), []);

  // --- загрузка данных ------------------------------------------------------

  const activities = useAsyncData<Activity[]>((signal) => api.listActivities(signal), [reload]);

  const weekEnd = addDays(weekStart, 6);
  const slots = useAsyncData<Slot[]>(
    (signal) =>
      activityId === null
        ? Promise.resolve([])
        : api.listSlots(activityId, weekStart, weekEnd, signal),
    [activityId, weekStart, reload],
  );

  const bookings = useAsyncData<Booking[]>(
    (signal) =>
      bookingsEmail.includes('@') ? api.listBookings(bookingsEmail, signal) : Promise.resolve([]),
    [bookingsEmail, reload],
  );

  // --- согласование состояния ----------------------------------------------

  // Первую активность выбираем сами, чтобы экран не был пустым при открытии.
  useEffect(() => {
    if (activities.status !== 'ready' || activities.data.length === 0) {
      return;
    }
    const chosenStillExists = activities.data.some((item) => item.id === activityId);
    if (!chosenStillExists) {
      setActivityId(activities.data[0].id);
    }
  }, [activities, activityId]);

  // Смена активности или недели сбрасывает выбор: старый слот к новой сетке
  // отношения не имеет.
  useEffect(() => {
    setSelected(null);
    setConfirmed(null);
  }, [activityId, weekStart]);

  // Если пока пользователь заполнял форму, слот заняли, снимаем выбор.
  useEffect(() => {
    if (slots.status !== 'ready' || selected === null) {
      return;
    }
    const fresh = slots.data.find(
      (slot) => slot.date === selected.date && slot.start_time === selected.start_time,
    );
    if (fresh === undefined || !fresh.is_free) {
      setSelected(null);
    }
  }, [slots, selected]);

  // Список броней перечитываем не на каждое нажатие клавиши, а когда
  // пользователь перестал печатать.
  useEffect(() => {
    const timer = setTimeout(() => setBookingsEmail(guestEmail.trim()), 400);
    return () => clearTimeout(timer);
  }, [guestEmail]);

  // --- действия -------------------------------------------------------------

  const activity =
    activities.status === 'ready'
      ? (activities.data.find((item) => item.id === activityId) ?? null)
      : null;

  async function submitBooking(): Promise<void> {
    if (activity === null || selected === null) {
      return;
    }
    setIsSending(true);
    try {
      const booking = await api.createBooking({
        activity_id: activity.id,
        date: selected.date,
        start_time: selected.start_time,
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim(),
      });
      setConfirmed(booking);
      setSelected(null);
      setBookingsEmail(guestEmail.trim());
      setToast({
        kind: 'success',
        text: `Записали: ${dayAndMonth(booking.date)}, ${shortTime(booking.start_time)}`,
      });
      refresh();
    } catch (error) {
      setToast({ kind: 'error', text: describe(error, 'Не удалось создать бронь') });
      // Слот заняли, пока была открыта форма: обновляем сетку, чтобы он
      // сразу показался занятым.
      if (error instanceof ApiError && error.code === 'slot_taken') {
        setSelected(null);
        refresh();
      }
    } finally {
      setIsSending(false);
    }
  }

  async function cancelBooking(booking: Booking): Promise<void> {
    setCancellingId(booking.id);
    try {
      await api.cancelBooking(booking.id);
      setToast({ kind: 'success', text: 'Бронь отменена, слот снова свободен' });
      refresh();
    } catch (error) {
      setToast({ kind: 'error', text: describe(error, 'Не удалось отменить бронь') });
    } finally {
      setCancellingId(null);
    }
  }

  // --- разметка -------------------------------------------------------------

  const accent = activity?.color ?? DEFAULT_ACCENT;
  const days = weekDays(weekStart);
  const isCurrentWeek = weekStart === startOfWeek(todayDate);

  return (
    <div className="app" style={{ '--accent': accent } as CSSProperties}>
      <a className="skip-link" href="#calendar">
        Перейти к календарю
      </a>

      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true">
            <CalendarIcon />
          </span>
          <div>
            <h1 className="topbar__title">Тайм-слоты</h1>
            <p className="topbar__subtitle">Запись на встречу без переписки</p>
          </div>
        </div>
        <p className="topbar__note">
          Учебный проект курса «ИИ для разработчиков», Сибирский федеральный университет
        </p>
      </header>

      <main className="layout">
        <div className="layout__main">
          {activities.status === 'loading' && <p className="loading-line">Загружаем активности…</p>}
          {activities.status === 'error' && (
            <ErrorState message={activities.message} onRetry={refresh} />
          )}
          {activities.status === 'ready' && activities.data.length === 0 && (
            <EmptyState
              title="Активностей пока нет"
              hint="Выполните команду npm run seed, чтобы добавить демонстрационные данные."
            />
          )}
          {activities.status === 'ready' && activities.data.length > 0 && (
            <ActivityPicker
              activities={activities.data}
              selectedId={activityId}
              onSelect={setActivityId}
            />
          )}

          <section className="board" id="calendar" aria-label="Календарь свободного времени">
            <WeekBar
              weekStart={weekStart}
              isCurrentWeek={isCurrentWeek}
              onPrevious={() => setWeekStart(addDays(weekStart, -7))}
              onNext={() => setWeekStart(addDays(weekStart, 7))}
              onToday={() => setWeekStart(startOfWeek(todayDate))}
            />

            {slots.status === 'loading' && <SlotGridSkeleton />}
            {slots.status === 'error' && <ErrorState message={slots.message} onRetry={refresh} />}
            {slots.status === 'ready' &&
              (slots.data.length === 0 ? (
                <EmptyState
                  title="На этой неделе приёма нет"
                  hint={
                    activity === null
                      ? 'Выберите вид активности.'
                      : `У активности «${activity.name}» нет слотов с ${dayAndMonth(weekStart)}.`
                  }
                  action={{
                    label: 'Показать следующую неделю',
                    onClick: () => setWeekStart(addDays(weekStart, 7)),
                  }}
                />
              ) : (
                <SlotGrid
                  days={days}
                  slots={slots.data}
                  today={todayDate}
                  selected={selected}
                  onPick={(slot) => {
                    setSelected(slot);
                    setConfirmed(null);
                  }}
                  onBusyPick={() =>
                    setToast({ kind: 'error', text: 'Этот слот уже забронирован' })
                  }
                />
              ))}

            {slots.status === 'ready' && slots.data.length > 0 && (
              <p className="board__summary">
                Свободно {slotsLabel(slots.data.filter((slot) => slot.is_free).length)} из{' '}
                {slots.data.length} на этой неделе
                {activity !== null && `, длительность встречи ${minutesLabel(activity.duration_minutes)}`}
              </p>
            )}
          </section>
        </div>

        <aside className="layout__side">
          <BookingPanel
            activity={activity}
            slot={selected}
            confirmed={confirmed}
            isSending={isSending}
            guestName={guestName}
            guestEmail={guestEmail}
            onGuestNameChange={setGuestName}
            onGuestEmailChange={setGuestEmail}
            onSubmit={() => void submitBooking()}
            onReset={() => setConfirmed(null)}
          />

          <MyBookings
            guestEmail={bookingsEmail.includes('@') ? bookingsEmail : ''}
            bookings={bookings}
            cancellingId={cancellingId}
            onCancel={(booking) => void cancelBooking(booking)}
          />

          <HowItWorks />
        </aside>
      </main>

      <footer className="footer">
        <p>
          Контракт API описан в <code>contract/main.tsp</code>, собранная схема лежит в{' '}
          <code>contract/openapi.yaml</code>.
        </p>
      </footer>

      <Toast toast={toast} onHide={hideToast} />
    </div>
  );
}

function describe(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
