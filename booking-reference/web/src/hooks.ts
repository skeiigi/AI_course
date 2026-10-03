/**
 * Небольшие хуки для загрузки данных.
 *
 * Задача одна и та же в трёх местах: показать состояние загрузки, потом либо
 * данные, либо понятную ошибку, и не применить ответ на запрос, который уже
 * никому не нужен. Поэтому это вынесено в общий хук.
 */

import { useEffect, useState, type DependencyList } from 'react';

import { ApiError } from './api';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

export function useAsyncData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });

  useEffect(() => {
    // AbortController отменяет запрос, если пользователь успел переключить
    // неделю или активность. Иначе на экран мог бы попасть устаревший ответ.
    const controller = new AbortController();
    setState({ status: 'loading' });

    load(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof ApiError ? error.message : 'Не удалось загрузить данные';
        setState({ status: 'error', message });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/** Значение, которое переживает перезагрузку страницы. Используется для почты гостя. */
export function useRememberedValue(key: string, initial = ''): [string, (value: string) => void] {
  const [value, setValue] = useState<string>(() => localStorage.getItem(key) ?? initial);

  const update = (next: string): void => {
    setValue(next);
    localStorage.setItem(key, next);
  };

  return [value, update];
}
