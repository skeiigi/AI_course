/**
 * Наполняет базу демонстрационными данными, чтобы интерфейс не был пустым
 * при первом запуске.
 *
 * Запуск: npm run seed
 *
 * Скрипт идемпотентный: если активности уже есть, он ничего не меняет.
 */

import { resolve } from 'node:path';

import { openDatabase } from './db.js';
import { config } from './config.js';
import { createRepository } from './repository.js';
import type { ActivityCreate, ScheduleCreate } from './schemas.js';
import { addDays, isoWeekday } from './slotEngine.js';

// Дни недели: 1 это понедельник, 7 это воскресенье.
const WEEKDAYS = [1, 2, 3, 4, 5];
const TUESDAY_AND_THURSDAY = [2, 4];
const MONDAY_WEDNESDAY_FRIDAY = [1, 3, 5];
const SATURDAY = [6];

interface DemoActivity {
  activity: ActivityCreate;
  schedule: Omit<ScheduleCreate, 'activity_id'>;
}

const DEMO: DemoActivity[] = [
  {
    activity: {
      name: 'Консультация по проекту',
      duration_minutes: 30,
      description: 'Короткий разбор задачи и ответы на вопросы.',
      color: '#3b5bdb',
    },
    schedule: {
      weekdays: WEEKDAYS,
      start_time: '10:00:00',
      end_time: '13:00:00',
      step_minutes: 30,
    },
  },
  {
    activity: {
      name: 'Код-ревью',
      duration_minutes: 45,
      description: 'Совместный разбор кода: читаем, обсуждаем, правим.',
      color: '#0f766e',
    },
    schedule: {
      weekdays: TUESDAY_AND_THURSDAY,
      start_time: '14:00:00',
      end_time: '18:00:00',
      step_minutes: 60,
    },
  },
  {
    activity: {
      name: 'Пробное собеседование',
      duration_minutes: 60,
      description: 'Разбор резюме и вопросы, которые задают на реальном найме.',
      color: '#9333ea',
    },
    schedule: {
      weekdays: MONDAY_WEDNESDAY_FRIDAY,
      start_time: '18:00:00',
      end_time: '21:00:00',
      step_minutes: 60,
    },
  },
  {
    activity: {
      name: 'Защита итогового проекта',
      duration_minutes: 60,
      description: 'Показ работающего сервиса и ответы на вопросы комиссии.',
      color: '#b45309',
    },
    schedule: {
      weekdays: SATURDAY,
      start_time: '11:00:00',
      end_time: '16:00:00',
      step_minutes: 60,
    },
  },
];

/** Понедельник той недели, в которую попадает сегодняшний день. */
function mondayOfThisWeek(): string {
  const today = new Date().toISOString().slice(0, 10);
  return addDays(today, 1 - isoWeekday(today));
}

export function seed(dbFile: string): void {
  const db = openDatabase(dbFile);
  const repository = createRepository(db);

  if (repository.listActivities().length > 0) {
    console.log('В базе уже есть активности, ничего не добавляю.');
    db.close();
    return;
  }

  for (const item of DEMO) {
    const activity = repository.createActivity(item.activity);
    repository.createSchedule({ ...item.schedule, activity_id: activity.id });
    console.log(`Добавлена активность: ${activity.name}`);
  }

  // Пара занятых слотов на текущей неделе, чтобы в интерфейсе сразу было
  // видно, чем отличается занятый слот от свободного.
  const monday = mondayOfThisWeek();
  const consultation = repository.listActivities()[0];
  repository.createBooking({
    activity_id: consultation.id,
    date: addDays(monday, 1),
    start_time: '10:00:00',
    end_time: '10:30:00',
    guest_name: 'Анна Соколова',
    guest_email: 'anna@example.com',
  });
  repository.createBooking({
    activity_id: consultation.id,
    date: addDays(monday, 2),
    start_time: '11:30:00',
    end_time: '12:00:00',
    guest_name: 'Пётр Ильин',
    guest_email: 'petr@example.com',
  });

  console.log('Готово. Демонстрационные данные добавлены.');
  db.close();
}

// Файл запускается и как скрипт командой node, и как обычный модуль.
// Сравнение путей отличает одно от другого. Сравнивать с import.meta.url
// напрямую нельзя: в адресе URL кириллица и пробелы в пути кодируются
// процентами, и строки перестают совпадать.
const startedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;

if (startedDirectly) {
  seed(config.dbFile);
}
