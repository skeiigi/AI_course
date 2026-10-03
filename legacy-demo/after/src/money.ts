/**
 * Деньги: разбор, округление, форматирование.
 *
 * Внутри отчёта деньги живут только в копейках и только целыми числами.
 * Дробное `number` появляется ровно в одном месте: при печати.
 */

/** Строка вида `12`, `12.5`, `12.34` или `-3.10`. Ничего другого. */
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Целое число без знака и без дробной части. */
const INTEGER_PATTERN = /^-?\d+$/;

/**
 * Делит целое на целое и округляет по правилу «половина от нуля».
 *
 * Именно так округляют деньги: 166,5 копейки становятся 167, а не 166.
 * Считается целыми числами, поэтому результат не зависит от того, как
 * лягут разряды в плавающей точке.
 */
export function divideRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    throw new RangeError('Делитель должен быть положительным');
  }
  const sign = numerator < 0 ? -1 : 1;
  const absolute = Math.abs(numerator);
  return sign * Math.floor((absolute * 2 + denominator) / (denominator * 2));
}

/**
 * Разбирает денежную сумму из файла и возвращает копейки.
 *
 * Возвращает `null`, если это не число. Legacy-версия здесь звала
 * `parseFloat`, а он молча принимает `12abc` и возвращает 12.
 */
export function parseMoneyToCents(text: string): number | null {
  const trimmed = text.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return null;
  }
  const [wholePart = '0', fractionPart = ''] = trimmed.replace('-', '').split('.');
  const cents = Number(wholePart) * 100 + Number((fractionPart + '00').slice(0, 2));
  return trimmed.startsWith('-') ? -cents : cents;
}

/**
 * Разбирает целое количество.
 *
 * Возвращает `null`, если это не целое число. Legacy-версия звала
 * `parseInt`, а он молча принимает `1.9` и возвращает 1.
 */
export function parseIntegerStrict(text: string): number | null {
  const trimmed = text.trim();
  if (!INTEGER_PATTERN.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

/** Копейки в строку вида `-1605.98`. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}`;
}
