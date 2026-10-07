/**
 * Главный компонент: собирает экран из частей и держит состояние.
 *
 * Данные грузятся тремя хуками, каждый со своим состоянием загрузки и ошибки.
 * Счётчик reload нужен, чтобы после брони или отмены сетка и список броней
 * перечитались с сервера, а не показывали устаревшую картину.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { ApiError, api, type Activity, type Booking, type BookingCreated, type Slot } from './api';
import { bookingLinkFromHash, bookingLinkUrl, readBookingLinks, saveBookingLink } from './bookingLinks';
import type { BookingLink } from './bookingLinks';
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
import { BookingPage } from './components/BookingPage';
import { HowItWorks } from './components/HowItWorks';
import { CalendarIcon } from './components/Icons';
import { ManualTimePicker } from './components/ManualTimePicker';
import { MyBookings } from './components/MyBookings';
import { SlotGrid } from './components/SlotGrid';
import { EmptyState, ErrorState, SlotGridSkeleton } from './components/States';
import { Toast, type ToastMessage } from './components/Toast';
import { ThemeToggle } from './components/ThemeToggle';
import { WeekBar } from './components/WeekBar';

const DEFAULT_ACCENT = '#3b5bdb';
type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeColor(theme: Theme): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', theme === 'dark' ? '#101d1a' : '#f3f4ee',
  );
}

export function App() {
  const [openedLink, setOpenedLink] = useState(() => bookingLinkFromHash(window.location.hash));
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = document.documentElement.dataset.theme;
    return saved === 'light' || saved === 'dark' ? saved : systemTheme();
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = (): void => {
      if (document.documentElement.dataset.theme === undefined) {
        const next = media.matches ? 'dark' : 'light';
        setTheme(next);
        updateThemeColor(next);
      }
    };
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, []);

  useEffect(() => {
    const updateLink = (): void => setOpenedLink(bookingLinkFromHash(window.location.hash));
    window.addEventListener('hashchange', updateLink);
    return () => window.removeEventListener('hashchange', updateLink);
  }, []);

  function toggleTheme(): void {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    updateThemeColor(next);
    try {
      localStorage.setItem('booking.theme', next);
    } catch {
      // Тема остаётся выбранной до закрытия страницы.
    }
    setTheme(next);
  }

  return openedLink === null
    ? <BookingHome theme={theme} onToggleTheme={toggleTheme} />
    : <BookingPage key={`${openedLink.id}.${openedLink.token}`} link={openedLink} theme={theme} onToggleTheme={toggleTheme} />;
}

function BookingHome({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const todayDate = today();

  const [activityId, setActivityId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayDate));
  const [reload, setReload] = useState(0);

  const [selected, setSelected] = useState<Slot[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [confirmed, setConfirmed] = useState<BookingCreated[] | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [guestName, setGuestName] = useRememberedValue('booking.guest-name');
  const [guestEmail, setGuestEmail] = useRememberedValue('booking.guest-email');
  const [bookingLinks, setBookingLinks] = useState(readBookingLinks);

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
    (signal) => Promise.all(
      bookingLinks.map((link) => api.getBooking(link.id, link.token, signal)),
    ).then((items) => items.sort((left, right) => right.id - left.id)),
    [bookingLinks, reload],
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

  // При смене активности выбранные слоты уже не относятся к новому расписанию.
  useEffect(() => {
    setSelected([]);
    setConfirmed(null);
  }, [activityId]);

  // Обновление текущей недели не должно удалять выбор из других недель.
  useEffect(() => {
    if (slots.status !== 'ready') {
      return;
    }
    setSelected((current) => {
      const available = current.filter((item) =>
        item.date < weekStart || item.date > weekEnd || slots.data.some(
          (slot) => slot.date === item.date && slot.start_time === item.start_time && slot.is_free,
        ),
      );
      return available.length === current.length ? current : available;
    });
    // Отбор выполняется после ответа API, а не при смене недели до нового ответа.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  // --- действия -------------------------------------------------------------

  const activity =
    activities.status === 'ready'
      ? (activities.data.find((item) => item.id === activityId) ?? null)
      : null;

  async function submitBooking(): Promise<void> {
    if (activity === null || selected.length === 0) {
      return;
    }
    setIsSending(true);
    try {
      const created = selected.length === 1
        ? [await api.createBooking({
          activity_id: activity.id,
          date: selected[0].date,
          start_time: selected[0].start_time,
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim(),
        })]
        : (await api.createBookings({
          activity_id: activity.id,
          slots: selected.map(({ date, start_time }) => ({ date, start_time })),
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim(),
        })).bookings;
      let links = bookingLinks;
      for (const { booking, access_token: token } of created) {
        links = saveBookingLink({ id: booking.id, token });
      }
      setBookingLinks(links);
      setConfirmed(created);
      setSelected([]);
      setToast({
        kind: 'success',
        text: created.length === 1
          ? `Записали: ${dayAndMonth(created[0].booking.date)}, ${shortTime(created[0].booking.start_time)}`
          : `Записали ${slotsLabel(created.length)}`,
      });
      refresh();
    } catch (error) {
      setToast({ kind: 'error', text: describe(error, 'Не удалось создать бронь') });
      // Сетка могла устареть, пока гость заполнял форму.
      if (error instanceof ApiError && ['slot_taken', 'slot_in_past'].includes(error.code)) {
        setSelected([]);
        refresh();
      }
    } finally {
      setIsSending(false);
    }
  }

  function applyManualTime(date: string, matching: Slot[]): void {
    const otherDates = selectedRef.current.filter((slot) => slot.date !== date);
    if (otherDates.length + matching.length > 20) {
      throw new Error('За один раз можно выбрать не более 20 слотов');
    }
    setSelected([...otherDates, ...matching].sort((left, right) =>
      `${left.date} ${left.start_time}`.localeCompare(`${right.date} ${right.start_time}`),
    ));
    setConfirmed(null);
    setWeekStart(startOfWeek(date));
  }

  async function cancelBooking(booking: Booking): Promise<void> {
    const link = bookingLinks.find((item) => item.id === booking.id);
    if (link === undefined) {
      setToast({ kind: 'error', text: 'Секретная ссылка на эту бронь не найдена' });
      return;
    }
    setCancellingId(booking.id);
    try {
      await api.cancelBooking(booking.id, link.token);
      setToast({ kind: 'success', text: 'Бронь отменена, слот снова свободен' });
      refresh();
    } catch (error) {
      setToast({ kind: 'error', text: describe(error, 'Не удалось отменить бронь') });
    } finally {
      setCancellingId(null);
    }
  }

  async function copyBookingLink(link: BookingLink | undefined): Promise<void> {
    if (link === undefined) {
      setToast({ kind: 'error', text: 'Секретная ссылка на эту бронь не найдена' });
      return;
    }

    const url = bookingLinkUrl(link);
    try {
      await navigator.clipboard.writeText(url);
      setToast({ kind: 'success', text: 'Ссылка на бронь скопирована' });
    } catch {
      window.prompt('Скопируйте секретную ссылку на бронь:', url);
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
        <div className="topbar__row">
          <div className="topbar__brand">
            <span className="topbar__mark" aria-hidden="true">
              <CalendarIcon />
            </span>
            <div>
              <h1 className="topbar__title">Тайм-слоты</h1>
              <p className="topbar__subtitle">Запись на встречу без переписки</p>
            </div>
          </div>
          <div className="topbar__actions">
            <p className="topbar__note">
              Учебный проект курса «ИИ для разработчиков», Сибирский федеральный университет
            </p>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
        <div className="topbar__hero">
          <div className="topbar__copy">
            <p className="topbar__eyebrow">Онлайн-запись · время Красноярска</p>
            <p className="topbar__headline">Найдите время для важного разговора.</p>
            <p className="topbar__description">
              Выберите формат встречи и свободный слот. Подтверждение появится сразу после записи.
            </p>
          </div>
          <div className="topbar__illustration" aria-hidden="true">
            <span className="topbar__orbit topbar__orbit--outer" />
            <span className="topbar__orbit topbar__orbit--inner" />
            <span className="topbar__orbit-center"><CalendarIcon /></span>
          </div>
        </div>
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

            <ManualTimePicker activityId={activityId} onApply={applyManualTime} />

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
                    const alreadySelected = selected.some(
                      (item) => item.date === slot.date && item.start_time === slot.start_time,
                    );
                    if (!alreadySelected && selected.length >= 20) {
                      setToast({ kind: 'error', text: 'За один раз можно выбрать не более 20 слотов' });
                      return;
                    }
                    setSelected((current) => {
                      const hasSlot = current.some(
                        (item) => item.date === slot.date && item.start_time === slot.start_time,
                      );
                      if (hasSlot) {
                        return current.filter(
                          (item) => item.date !== slot.date || item.start_time !== slot.start_time,
                        );
                      }
                      return [...current, slot].sort((left, right) =>
                        `${left.date} ${left.start_time}`.localeCompare(`${right.date} ${right.start_time}`),
                      );
                    });
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
            slots={selected}
            confirmed={confirmed}
            isSending={isSending}
            guestName={guestName}
            guestEmail={guestEmail}
            onGuestNameChange={setGuestName}
            onGuestEmailChange={setGuestEmail}
            onSubmit={() => void submitBooking()}
            onReset={() => setConfirmed(null)}
            onCopyLink={(link) => void copyBookingLink(link)}
          />

          <MyBookings
            bookings={bookings}
            links={bookingLinks}
            cancellingId={cancellingId}
            onCancel={(booking) => void cancelBooking(booking)}
            onCopyLink={(booking) =>
              void copyBookingLink(bookingLinks.find((link) => link.id === booking.id))
            }
          />

          <HowItWorks />
        </aside>
      </main>

      {selected.length > 0 && confirmed === null && (
        <a className="mobile-booking-link" href="#booking">
          <span>Выбрано: {slotsLabel(selected.length)}</span>
          <strong>Перейти к оформлению <span aria-hidden="true">→</span></strong>
        </a>
      )}

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
