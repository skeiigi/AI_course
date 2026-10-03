/**
 * Сборка приложения Fastify.
 *
 * Функция buildApp возвращает готовый сервер, но не запускает его. Так удобно
 * тестам: они поднимают приложение с базой в оперативной памяти и обращаются
 * к нему через app.inject, не занимая сетевой порт.
 */

import { existsSync } from 'node:fs';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { openDatabase } from './db.js';
import { ApiError, type ErrorBody, describeZodError } from './errors.js';
import { createRepository } from './repository.js';
import { activityRoutes } from './routes/activities.js';
import { bookingRoutes } from './routes/bookings.js';
import { scheduleRoutes } from './routes/schedules.js';
import { slotRoutes } from './routes/slots.js';

export interface AppOptions {
  /** Файл базы данных. Значение ':memory:' даёт базу в оперативной памяти. */
  dbFile?: string;
  /** Папка со собранным интерфейсом. Если её нет, сервис отдаёт только API. */
  webDir?: string | null;
  /** Писать ли журнал запросов. В тестах не нужен. */
  logger?: boolean;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const db = openDatabase(options.dbFile ?? ':memory:');
  const repository = createRepository(db);

  const app = Fastify({ logger: options.logger ?? false });

  // Единая обработка ошибок: в каждом обработчике достаточно бросить исключение,
  // а превращение его в ответ с кодом и телом ErrorBody происходит здесь.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    // Ошибка, которую сервис вернул осознанно: код и текст уже готовы.
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(error.body);
    }

    // Данные не прошли проверку Zod. Собираем из разбора одно понятное сообщение.
    if (error instanceof ZodError) {
      const body: ErrorBody = { code: 'validation_failed', message: describeZodError(error) };
      return reply.code(422).send(body);
    }

    // Fastify сам возвращает 400, если тело запроса не разобралось как JSON.
    if (error.statusCode === 400) {
      const body: ErrorBody = {
        code: 'validation_failed',
        message: 'Тело запроса не является корректным JSON',
      };
      return reply.code(422).send(body);
    }

    // Всё остальное это сбой сервиса. Подробности пишем в журнал,
    // наружу отдаём общий текст, чтобы не раскрывать устройство сервиса.
    request.log.error(error);
    const body: ErrorBody = { code: 'internal_error', message: 'Внутренняя ошибка сервиса' };
    return reply.code(500).send(body);
  });

  activityRoutes(app, repository);
  scheduleRoutes(app, repository);
  slotRoutes(app, repository);
  bookingRoutes(app, repository);

  const webDir = options.webDir ?? null;
  const hasWeb = webDir !== null && existsSync(webDir);
  if (hasWeb) {
    // Собранный интерфейс отдаётся тем же сервисом, поэтому в промышленном
    // запуске нет ни второго порта, ни настроек междоменных запросов.
    app.register(fastifyStatic, { root: webDir, prefix: '/' });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      const body: ErrorBody = { code: 'route_not_found', message: 'Такого эндпоинта нет' };
      return reply.code(404).send(body);
    }
    if (hasWeb) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ code: 'route_not_found', message: 'Страница не найдена' });
  });

  // Соединение с базой закрывается вместе с приложением.
  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
