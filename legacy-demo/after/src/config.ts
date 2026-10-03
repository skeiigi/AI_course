/**
 * Бизнес-константы отчёта и параметры одного запуска.
 *
 * Все числа, которые в legacy-версии были разбросаны по коду и повторялись
 * в трёх местах, собраны здесь и названы. Правила расчёта меняются в этом
 * файле, а не в формулах.
 */

/** Ставка налога в процентах. Начисляется на сумму после скидки. */
export const TAX_PERCENT = 20;

/** Заказ дороже этой суммы получает дополнительные проценты скидки. */
export const LARGE_ORDER_THRESHOLD_CENTS = 100_000;

/** Сколько процентов добавляется к скидке за крупный заказ. */
export const LARGE_ORDER_BONUS_PERCENT = 5;

/** Больше этого процента скидка не даётся ни при каких условиях. */
export const MAX_DISCOUNT_PERCENT = 25;

/** Сколько товаров показывать в разделе «Топ товаров». */
export const TOP_ITEMS_COUNT = 5;

/** Ширина текстового отчёта в символах. */
export const REPORT_WIDTH = 60;

/** Метка месяца для заказов, у которых дату разобрать не удалось. */
export const UNKNOWN_MONTH = '0000-00';

/** Как называется категория, если в файле она пустая. */
export const NO_CATEGORY_TITLE = 'БЕЗ КАТЕГОРИИ';

/** Сколько колонок ожидается в файле заказов. */
export const EXPECTED_COLUMNS = 10;

/** Процент скидки по коду. Код, которого здесь нет, скидки не даёт. */
export const DISCOUNT_PERCENT_BY_CODE: Readonly<Record<string, number>> = {
  NONE: 0,
  SALE5: 5,
  SALE10: 10,
  SALE15: 15,
  VIP20: 20,
};

/** Русские названия категорий. Категория без названия печатается как есть. */
export const CATEGORY_TITLES: Readonly<Record<string, string>> = {
  electronics: 'Электроника',
  books: 'Книги',
  clothing: 'Одежда',
  home: 'Дом и сад',
  sports: 'Спорт',
};

/**
 * Как округлять скидку.
 *
 * `half-up`: половина копейки округляется вверх. Это правило для денег.
 * `legacy-truncate`: дробная часть отбрасывается, как в `legacy/report.js`.
 * Второй режим нужен только для доказательства эквивалентности рефакторинга.
 */
export type DiscountRounding = 'half-up' | 'legacy-truncate';

/** Параметры одного запуска отчёта. */
export interface Settings {
  readonly ordersPath: string;
  readonly outputDir: string;
  readonly rounding: DiscountRounding;
  readonly quiet: boolean;
}
