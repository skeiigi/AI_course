/** Выбор даты и временного интервала через существующую сетку слотов. */

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { api, type Slot } from '../api';
import { today } from '../dates';
import { selectSlotsInInterval } from '../manualSlots';

interface Props {
  activityId: number | null;
  onApply: (date: string, slots: Slot[]) => void;
}

export function ManualTimePicker({ activityId, onApply }: Props) {
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setError(null);
    setPending(false);
    return () => requestRef.current?.abort();
  }, [activityId]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (activityId === null) {
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setError(null);

    try {
      const slots = await api.listSlots(activityId, date, date, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      const matching = selectSlotsInInterval(slots, date, start, end);
      onApply(date, matching);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Не удалось выбрать время');
      }
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
      }
    }
  }

  return (
    <form className="manual-time" onSubmit={(event) => void submit(event)} data-testid="manual-time">
      <div className="manual-time__intro">
        <h2 className="manual-time__title">Указать время вручную</h2>
        <p className="manual-time__hint">Укажите время Красноярска по расписанию — свободные слоты выделятся в календаре.</p>
      </div>
      <div className="manual-time__fields">
        <label className="field">
          <span className="field__label">Дата</span>
          <input className="field__input" type="date" value={date} min={today()} required onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Начало</span>
          <input className="field__input" type="time" step="1" value={start} required onChange={(event) => setStart(event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Конец</span>
          <input className="field__input" type="time" step="1" value={end} required onChange={(event) => setEnd(event.target.value)} />
        </label>
        <button type="submit" className="button" disabled={activityId === null || pending}>
          {pending ? 'Ищем слоты…' : 'Выделить слоты'}
        </button>
      </div>
      {error !== null && <p className="field__error" role="alert">{error}</p>}
    </form>
  );
}
