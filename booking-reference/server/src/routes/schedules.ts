/** Эндпоинты расписаний. */

import type { FastifyInstance } from 'fastify';

import { errors } from '../errors.js';
import type { Repository } from '../repository.js';
import { scheduleCreateSchema, scheduleQuerySchema } from '../schemas.js';
import { timeToMinutes } from '../slotEngine.js';

export function scheduleRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/api/schedules', async (request) => {
    const query = scheduleQuerySchema.parse(request.query);
    return repository.listSchedules(query.activity_id);
  });

  app.post('/api/schedules', async (request, reply) => {
    const input = scheduleCreateSchema.parse(request.body);

    if (repository.getActivity(input.activity_id) === null) {
      throw errors.activityNotFound();
    }

    // Инвариант И2 из docs/ontology.md: пустое или перевёрнутое рабочее окно
    // дало бы расписание без единого слота, поэтому его не принимаем.
    if (timeToMinutes(input.start_time) >= timeToMinutes(input.end_time)) {
      throw errors.invalidTimeWindow();
    }

    reply.code(201);
    return repository.createSchedule(input);
  });
}
