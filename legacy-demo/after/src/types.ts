/**
 * Типы, которыми обмениваются слои.
 *
 * В legacy-версии те же данные ездили между функциями массивами вида
 * `[cat, item, q, p, code, st, mon]`, и что лежит в `l[3]`, приходилось
 * вспоминать каждый раз. Здесь у каждого поля есть имя и тип.
 *
 * Все денежные величины хранятся в копейках, целым числом. Это главное
 * правило работы с деньгами: `number` с дробной частью накапливает ошибку,
 * целые копейки не накапливают ничего.
 */

/** Статус строки заказа: оплачен, возврат, отменён. */
export type OrderStatus = 'P' | 'R' | 'C';

/** Одна строка файла заказов, уже разобранная и проверенная. */
export interface Order {
  readonly orderId: string;
  readonly month: string;
  readonly customer: string;
  readonly category: string;
  readonly item: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly discountCode: string;
  readonly status: OrderStatus;
}

/** Денежные суммы по одной строке заказа, в копейках. */
export interface LineAmounts {
  readonly grossCents: number;
  readonly discountCents: number;
  readonly netCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

/** Строка файла, которую разобрать не удалось. */
export interface SkippedRow {
  readonly rowNumber: number;
  readonly orderId: string;
  readonly reason: string;
}

/** Результат разбора одной строки: либо заказ, либо причина отказа. */
export type RowOutcome =
  | { readonly ok: true; readonly order: Order }
  | { readonly ok: false; readonly reason: string };

/** Результат чтения файла заказов целиком. */
export interface LoadResult {
  readonly orders: readonly Order[];
  readonly totalRows: number;
  /** Строки, которые не попали в отчёт. */
  readonly skipped: readonly SkippedRow[];
  /** Все предупреждения, включая замечания к заголовку файла. */
  readonly warnings: readonly string[];
}

/** Накопленные суммы по одной группе: категории, месяцу или коду скидки. */
export interface Bucket {
  orders: number;
  grossCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/** Строка раздела «Топ товаров». */
export interface TopItem {
  readonly item: string;
  readonly grossCents: number;
}

/** Строка выгрузки `revenue.csv`. */
export interface ExportRow {
  readonly category: string;
  readonly month: string;
  readonly orders: number;
  readonly grossCents: number;
  readonly discountCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

/** Готовые агрегаты, из которых печатается отчёт. */
export interface Summary {
  readonly totalRows: number;
  readonly skippedRows: number;
  readonly cancelledOrders: number;
  readonly countedOrders: number;
  readonly categories: ReadonlyMap<string, Bucket>;
  readonly months: ReadonlyMap<string, Bucket>;
  readonly discountCodes: ReadonlyMap<string, Bucket>;
  readonly topItems: readonly TopItem[];
  readonly refundCount: number;
  readonly refundTotalCents: number;
  readonly grandTotalCents: number;
  readonly warningsCount: number;
}
