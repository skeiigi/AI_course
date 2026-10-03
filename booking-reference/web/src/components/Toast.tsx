/**
 * Всплывающее сообщение о результате действия.
 *
 * Область объявлена как role="status" с aria-live: программа чтения с экрана
 * зачитает текст, как только он появится, и пользователю не придётся искать
 * сообщение самому.
 */

import { useEffect } from 'react';

import { AlertIcon, CheckIcon } from './Icons';

export interface ToastMessage {
  kind: 'success' | 'error';
  text: string;
}

interface Props {
  toast: ToastMessage | null;
  onHide: () => void;
}

const VISIBLE_MILLISECONDS = 6000;

export function Toast({ toast, onHide }: Props) {
  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = setTimeout(onHide, VISIBLE_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [toast, onHide]);

  return (
    <div className="toast-area" role="status" aria-live="polite">
      {toast !== null && (
        <div className={`toast toast--${toast.kind}`} data-testid="toast">
          {toast.kind === 'success' ? <CheckIcon /> : <AlertIcon />}
          <p className="toast__text">{toast.text}</p>
          <button type="button" className="toast__close" onClick={onHide} aria-label="Закрыть сообщение">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
