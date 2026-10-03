/**
 * Расчёт денег по одной строке заказа.
 *
 * Модуль ничего не знает ни о файлах, ни о формате отчёта, ни о накопителях.
 * Все функции здесь чистые: одни и те же аргументы всегда дают один и тот же
 * результат, и никаких побочных действий не происходит. Именно поэтому их
 * можно проверить тестами по таблице значений.
 */

import * as config from './config.js';
import { divideRoundHalfUp } from './money.js';
import type { LineAmounts, Order, OrderStatus } from './types.js';

/** Что учитывать в расчёте строки. */
export interface PricingOptions {
  readonly rounding: config.DiscountRounding;
  /** Раздел «Топ товаров» исторически считается без скидок. */
  readonly applyDiscount?: boolean;
  /** И без налога тоже. */
  readonly applyTax?: boolean;
}

/**
 * Валовая сумма строки в копейках. У возврата она отрицательная.
 *
 * Количество и цена целые, поэтому произведение точное: округлять нечего.
 */
export function grossCents(order: Order): number {
  const amount = order.quantity * order.unitPriceCents;
  return order.status === 'R' ? -amount : amount;
}

/**
 * Итоговый процент скидки для строки заказа.
 *
 * Возврату скидка не полагается. Крупный заказ получает надбавку.
 * Общий процент ограничен сверху.
 */
export function discountPercent(
  gross: number,
  discountCode: string,
  status: OrderStatus,
): number {
  if (status === 'R') {
    return 0;
  }
  let percent = config.DISCOUNT_PERCENT_BY_CODE[discountCode] ?? 0;
  if (gross > config.LARGE_ORDER_THRESHOLD_CENTS) {
    percent += config.LARGE_ORDER_BONUS_PERCENT;
  }
  if (percent > config.MAX_DISCOUNT_PERCENT) {
    percent = config.MAX_DISCOUNT_PERCENT;
  }
  return percent;
}

/**
 * Скидка в копейках.
 *
 * В режиме `half-up` половина копейки округляется вверх: 15 процентов
 * от 11,10 равны 1,665, значит скидка 1,67.
 *
 * В режиме `legacy-truncate` повторяется расчёт из `legacy/report.js`:
 * `Math.floor(amount * pct) / 100` над суммой в рублях. Дробная часть
 * отбрасывается, и та же скидка становится 1,66. Режим нужен только
 * для доказательства того, что рефакторинг ничего не изменил.
 */
export function discountCents(
  gross: number,
  percent: number,
  rounding: config.DiscountRounding,
): number {
  if (rounding === 'legacy-truncate') {
    return Math.floor((gross / 100) * percent);
  }
  return divideRoundHalfUp(gross * percent, 100);
}

/** Налог в копейках от суммы после скидки. */
export function taxCents(net: number): number {
  return divideRoundHalfUp(net * config.TAX_PERCENT, 100);
}

/** Все суммы по одной строке заказа. */
export function calculateLine(order: Order, options: PricingOptions): LineAmounts {
  const applyDiscount = options.applyDiscount ?? true;
  const applyTax = options.applyTax ?? true;

  const gross = grossCents(order);
  const discount = applyDiscount
    ? discountCents(gross, discountPercent(gross, order.discountCode, order.status), options.rounding)
    : 0;
  const net = gross - discount;
  const tax = applyTax ? taxCents(net) : 0;

  return {
    grossCents: gross,
    discountCents: discount,
    netCents: net,
    taxCents: tax,
    totalCents: net + tax,
  };
}
