/**
 * Проверка соответствия реализации сгенерированному контракту.
 *
 * Источник истины это contract/openapi.yaml, собранный компилятором TypeSpec
 * из contract/main.tsp. Тест ничего не знает о коде обработчиков: он читает
 * контракт и требует, чтобы сервис ему подчинялся.
 *
 * Проверяется три вещи:
 *   1. В приложении ровно те эндпоинты, что описаны в контракте, без лишних.
 *   2. Каждый настоящий ответ сервиса подходит под схему из контракта,
 *      а его код состояния в контракте объявлен.
 *   3. Сценарии теста задевают все объявленные ответы, то есть контракт
 *      не содержит описаний, которых нет в жизни.
 *
 * Если начать работу с кода, а не с контракта, этот тест упадёт.
 * Так и задумано, смотри AGENTS.md, раздел 6.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ajvModule from 'ajv/dist/2020.js';
import ajvFormatsModule from 'ajv-formats';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { parse as parseYaml } from 'yaml';
import { beforeAll, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/db.js';
import { createRepository } from '../src/repository.js';
import { activityRoutes } from '../src/routes/activities.js';
import { bookingRoutes } from '../src/routes/bookings.js';
import { scheduleRoutes } from '../src/routes/schedules.js';
import { slotRoutes } from '../src/routes/slots.js';
import type { Activity, BookingCreated } from '../src/schemas.js';
import { addDays } from '../src/slotEngine.js';
import { MONDAY, SATURDAY, createActivityWithSchedule, createTestApp } from './helpers.js';

// ---------------------------------------------------------------------------
// Чтение контракта
// ---------------------------------------------------------------------------

interface ContractOperation {
  responses: Record<string, { content?: Record<string, { schema: unknown }> }>;
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
}

interface Contract {
  paths: Record<string, Record<string, ContractOperation>>;
  components: unknown;
}

const contractFile = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'contract',
  'openapi.yaml',
);
const contract = parseYaml(readFileSync(contractFile, 'utf8')) as Contract;

// Пакеты ajv собраны в формате CommonJS, и настоящее значение лежит у них
// в поле default. TypeScript в режиме NodeNext это поле не разворачивает,
// поэтому достаём его руками.
const Ajv2020 = ajvModule.default;
const addFormats = ajvFormatsModule.default;

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
// В контракте время это plainTime, то есть время без часового пояса.
// Проверка формата time в ajv-formats по умолчанию требует смещения,
// поэтому заменяем её на строгий разбор «ЧЧ:ММ:СС».
ajv.addFormat('time', /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);

/** Путь контракта «/api/bookings/{booking_id}/cancel» в вид Fastify. */
function toFastifyPath(contractPath: string): string {
  return contractPath.replace(/\{(\w+)\}/g, ':$1');
}

/** Все операции контракта в виде «МЕТОД путь». */
function contractOperations(): string[] {
  const operations: string[] = [];
  for (const [path, methods] of Object.entries(contract.paths)) {
    for (const method of Object.keys(methods)) {
      operations.push(`${method.toUpperCase()} ${toFastifyPath(path)}`);
    }
  }
  return operations.sort();
}

/** Все объявленные ответы в виде «МЕТОД путь -> код». */
function contractResponses(): string[] {
  const responses: string[] = [];
  for (const [path, methods] of Object.entries(contract.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      for (const status of Object.keys(operation.responses)) {
        responses.push(`${method.toUpperCase()} ${toFastifyPath(path)} -> ${status}`);
      }
    }
  }
  return responses.sort();
}

// ---------------------------------------------------------------------------
// Проверка одного ответа
// ---------------------------------------------------------------------------

/** Ответы, которые сервис действительно отдал во время сценариев. */
const seenResponses = new Set<string>();

interface InjectedResponse {
  statusCode: number;
  json: () => unknown;
}

function expectMatchesContract(
  method: string,
  contractPath: string,
  response: InjectedResponse,
): void {
  const operation = contract.paths[contractPath]?.[method.toLowerCase()];
  expect(operation, `в контракте нет операции ${method} ${contractPath}`).toBeDefined();

  const declared = operation!.responses[String(response.statusCode)];
  expect(
    declared,
    `контракт не объявляет ответ ${response.statusCode} для ${method} ${contractPath}`,
  ).toBeDefined();

  const schema = declared!.content?.['application/json']?.schema;
  expect(schema, `у ответа ${response.statusCode} нет схемы тела`).toBeDefined();

  // Схему компилируем вместе с разделом components, чтобы ссылки вида
  // «#/components/schemas/Activity» внутри неё нашли то, на что указывают.
  const validate = ajv.compile({
    ...(schema as Record<string, unknown>),
    components: contract.components,
  });
  const body = response.json();
  const valid = validate(body);
  expect(
    valid,
    `тело ответа ${method} ${contractPath} -> ${response.statusCode} не подходит под схему: ` +
      ajv.errorsText(validate.errors),
  ).toBe(true);

  seenResponses.add(`${method.toUpperCase()} ${toFastifyPath(contractPath)} -> ${response.statusCode}`);
}

// ---------------------------------------------------------------------------
// Сценарии: задеваем каждый объявленный ответ хотя бы один раз
// ---------------------------------------------------------------------------

let app: FastifyInstance;

async function playAllScenarios(): Promise<void> {
  const activity: Activity = await createActivityWithSchedule(app);

  expectMatchesContract('GET', '/api/activities', await app.inject('/api/activities'));

  expectMatchesContract(
    'POST',
    '/api/activities',
    await app.inject({
      method: 'POST',
      url: '/api/activities',
      payload: { name: 'Код-ревью', duration_minutes: 45 },
    }),
  );
  expectMatchesContract(
    'POST',
    '/api/activities',
    await app.inject({ method: 'POST', url: '/api/activities', payload: { name: '' } }),
  );

  expectMatchesContract('GET', '/api/schedules', await app.inject('/api/schedules'));
  expectMatchesContract(
    'POST',
    '/api/schedules',
    await app.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        activity_id: activity.id,
        weekdays: [6],
        start_time: '11:00:00',
        end_time: '16:00:00',
        step_minutes: 60,
      },
    }),
  );
  expectMatchesContract(
    'POST',
    '/api/schedules',
    await app.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        activity_id: 999,
        weekdays: [1],
        start_time: '10:00:00',
        end_time: '12:00:00',
        step_minutes: 30,
      },
    }),
  );
  expectMatchesContract(
    'POST',
    '/api/schedules',
    await app.inject({ method: 'POST', url: '/api/schedules', payload: { weekdays: [] } }),
  );

  const slotsUrl = `/api/slots?activity_id=${activity.id}&date_from=${MONDAY}&date_to=${MONDAY}`;
  expectMatchesContract('GET', '/api/slots', await app.inject(slotsUrl));
  expectMatchesContract(
    'GET',
    '/api/slots',
    await app.inject(`/api/slots?activity_id=999&date_from=${MONDAY}&date_to=${MONDAY}`),
  );
  expectMatchesContract('GET', '/api/slots', await app.inject('/api/slots'));

  const booking = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      activity_id: activity.id,
      date: MONDAY,
      start_time: '10:00:00',
      guest_name: 'Иван Петров',
      guest_email: 'ivan@example.com',
    },
  });
  expectMatchesContract('POST', '/api/bookings', booking);
  expectMatchesContract(
    'POST',
    '/api/bookings',
    await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        activity_id: activity.id,
        date: addDays(MONDAY, -14),
        start_time: '10:00:00',
        guest_name: 'Иван Петров',
        guest_email: 'ivan@example.com',
      },
    }),
  );
  expectMatchesContract(
    'POST',
    '/api/bookings',
    await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        activity_id: activity.id,
        date: MONDAY,
        start_time: '10:00:00',
        guest_name: 'Мария Орлова',
        guest_email: 'maria@example.com',
      },
    }),
  );
  expectMatchesContract(
    'POST',
    '/api/bookings',
    await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        activity_id: 999,
        date: MONDAY,
        start_time: '10:00:00',
        guest_name: 'Иван Петров',
        guest_email: 'ivan@example.com',
      },
    }),
  );
  expectMatchesContract(
    'POST',
    '/api/bookings',
    await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        activity_id: activity.id,
        date: SATURDAY,
        start_time: '10:00:00',
        guest_name: 'Иван Петров',
        guest_email: 'ivan@example.com',
      },
    }),
  );

  const batchPayload = {
    activity_id: activity.id,
    slots: [
      { date: MONDAY, start_time: '11:00:00' },
      { date: MONDAY, start_time: '11:30:00' },
    ],
    guest_name: 'Иван Петров',
    guest_email: 'ivan@example.com',
  };
  const batchPath = '/api/bookings/batch';
  expectMatchesContract('POST', batchPath, await app.inject({
    method: 'POST', url: batchPath, payload: batchPayload,
  }));
  expectMatchesContract('POST', batchPath, await app.inject({
    method: 'POST', url: batchPath, payload: batchPayload,
  }));
  expectMatchesContract('POST', batchPath, await app.inject({
    method: 'POST', url: batchPath, payload: { ...batchPayload, activity_id: 999 },
  }));
  expectMatchesContract('POST', batchPath, await app.inject({
    method: 'POST', url: batchPath, payload: { ...batchPayload, slots: [] },
  }));

  const created = booking.json() as BookingCreated;
  const bookingId = created.booking.id;
  const headers = { Authorization: `Bearer ${created.access_token}` };
  const getPath = '/api/bookings/{booking_id}';
  expectMatchesContract(
    'GET',
    getPath,
    await app.inject({ method: 'GET', url: `/api/bookings/${bookingId}`, headers }),
  );
  expectMatchesContract(
    'GET',
    getPath,
    await app.inject({ method: 'GET', url: `/api/bookings/${bookingId}` }),
  );
  const messagesPath = '/api/bookings/{booking_id}/messages';
  const messagesUrl = `/api/bookings/${bookingId}/messages`;
  expectMatchesContract('GET', messagesPath, await app.inject({ method: 'GET', url: messagesUrl, headers }));
  expectMatchesContract('GET', messagesPath, await app.inject({ method: 'GET', url: messagesUrl }));
  expectMatchesContract('POST', messagesPath, await app.inject({
    method: 'POST', url: messagesUrl, headers,
    payload: { sender_name: 'Иван', body: 'Здравствуйте' },
  }));
  expectMatchesContract('POST', messagesPath, await app.inject({
    method: 'POST', url: messagesUrl,
    payload: { sender_name: 'Иван', body: 'Здравствуйте' },
  }));
  expectMatchesContract('POST', messagesPath, await app.inject({
    method: 'POST', url: messagesUrl, headers,
    payload: { sender_name: '', body: '' },
  }));
  const cancelPath = '/api/bookings/{booking_id}/cancel';
  expectMatchesContract(
    'POST',
    cancelPath,
    await app.inject({ method: 'POST', url: `/api/bookings/${bookingId}/cancel`, headers }),
  );
  expectMatchesContract(
    'POST',
    cancelPath,
    await app.inject({ method: 'POST', url: `/api/bookings/${bookingId}/cancel`, headers }),
  );
  expectMatchesContract(
    'POST',
    cancelPath,
    await app.inject({ method: 'POST', url: '/api/bookings/999/cancel', headers }),
  );
  expectMatchesContract('POST', messagesPath, await app.inject({
    method: 'POST', url: messagesUrl, headers,
    payload: { sender_name: 'Иван', body: 'После отмены' },
  }));
}

// ---------------------------------------------------------------------------
// Сами проверки
// ---------------------------------------------------------------------------

describe('реализация соответствует контракту', () => {
  beforeAll(async () => {
    app = createTestApp();
    await playAllScenarios();
    await app.close();
  });

  it('в приложении ровно те эндпоинты, что описаны в контракте', () => {
    // Собираем список маршрутов теми же функциями, которыми их регистрирует
    // приложение. Хук onRoute срабатывает на каждую регистрацию.
    const probe = Fastify();
    const registered: string[] = [];
    probe.addHook('onRoute', (route) => {
      // HEAD Fastify добавляет к каждому GET автоматически, в контракте его нет.
      if (route.method !== 'HEAD') {
        registered.push(`${route.method} ${route.url}`);
      }
    });

    const db = openDatabase(':memory:');
    const repository = createRepository(db);
    activityRoutes(probe, repository);
    scheduleRoutes(probe, repository);
    slotRoutes(probe, repository);
    bookingRoutes(probe, repository);
    db.close();

    expect(registered.sort()).toEqual(contractOperations());
  });

  it('каждый объявленный в контракте ответ проверен на настоящем ответе сервиса', () => {
    expect([...seenResponses].sort()).toEqual(contractResponses());
  });

  it('контракт объявляет обязательные параметры запроса слотов', () => {
    const parameters = contract.paths['/api/slots'].get.parameters ?? [];
    const required = parameters.filter((item) => item.required).map((item) => item.name);
    expect(required.sort()).toEqual(['activity_id', 'date_from', 'date_to']);
  });

  it('контракт собран из main.tsp и описывает OpenAPI 3.1', () => {
    const raw = readFileSync(contractFile, 'utf8');
    expect(raw.startsWith('openapi: 3.1.0')).toBe(true);
  });
});
