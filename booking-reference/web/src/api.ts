/**
 * Обращения к API сервиса.
 *
 * Типы здесь повторяют модели контракта contract/main.tsp. Когда меняется
 * контракт, этот файл правится следом.
 */

/** Вид активности. */
export interface Activity {
  id: number;
  name: string;
  duration_minutes: number;
  description: string;
  color: string;
}

/** Тайм-слот. На сервере не хранится, вычисляется при каждом запросе. */
export interface Slot {
  activity_id: number;
  schedule_id: number;
  date: string;
  start_time: string;
  end_time: string;
  is_free: boolean;
}

export type BookingStatus = 'active' | 'cancelled';

/** Бронь гостя. */
export interface Booking {
  id: number;
  activity_id: number;
  activity_name: string;
  date: string;
  start_time: string;
  end_time: string;
  guest_name: string;
  guest_email: string;
  status: BookingStatus;
  created_at: string;
}

export interface BookingCreate {
  activity_id: number;
  date: string;
  start_time: string;
  guest_name: string;
  guest_email: string;
}

/**
 * Ошибка, которую вернул сервис. Поле code машиночитаемое, message
 * уже написано по-русски и годится для показа пользователю.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_MESSAGE = 'Сервис не отвечает. Проверьте, запущен ли он, и повторите попытку.';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    });
  } catch {
    // Сюда попадаем, если сервис не запущен или пропала сеть.
    throw new ApiError('network_error', NETWORK_MESSAGE, 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { code?: string; message?: string }
      | null;
    throw new ApiError(
      body?.code ?? 'unknown_error',
      body?.message ?? 'Неизвестная ошибка сервиса',
      response.status,
    );
  }

  return (await response.json()) as T;
}

export const api = {
  listActivities: (signal?: AbortSignal) => request<Activity[]>('/api/activities', { signal }),

  listSlots: (activityId: number, dateFrom: string, dateTo: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      activity_id: String(activityId),
      date_from: dateFrom,
      date_to: dateTo,
    });
    return request<Slot[]>(`/api/slots?${query}`, { signal });
  },

  listBookings: (guestEmail: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ guest_email: guestEmail });
    return request<Booking[]>(`/api/bookings?${query}`, { signal });
  },

  createBooking: (payload: BookingCreate) =>
    request<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify(payload) }),

  cancelBooking: (bookingId: number) =>
    request<Booking>(`/api/bookings/${bookingId}/cancel`, { method: 'POST' }),
};
