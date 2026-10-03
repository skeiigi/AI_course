/**
 * Учебный пример: печатает текущую дату и время.
 *
 * Русские названия месяца и дня недели заданы массивом, а не взяты
 * из toLocaleDateString: так вывод не зависит от настроек локали Node.
 */

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(now: Date): string {
  const weekday = WEEKDAY_NAMES[(now.getDay() + 6) % 7];
  const time = `${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}:${twoDigits(now.getSeconds())}`;
  return `${now.getDate()} ${MONTHS_GENITIVE[now.getMonth()]} ${now.getFullYear()}, ${weekday}, ${time}`;
}

console.log(`Текущая дата: ${formatDate(new Date())}`);
