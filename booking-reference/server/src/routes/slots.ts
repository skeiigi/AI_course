/** Эндпоинт со свободными и занятыми слотами. */

import type { FastifyInstance } from 'fastify';

import { errors } from '../errors.js';
import type { Repository } from '../repository.js';
import { slotQuerySchema } from '../schemas.js';
import { MAX_RANGE_DAYS, buildSlots, daysInRange } from '../slotEngine.js';

export function slotRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/api/slots', async (request) => {
    const query = slotQuerySchema.parse(request.query);

    if (query.date_from > query.date_to) {
      throw errors.invalidDateRange('Начало диапазона должно быть не позже его конца');
    }
    // Слоты не хранятся, а вычисляются, поэтому длину диапазона приходится
    // ограничивать: запрос на десять лет вперёд создал бы десятки тысяч объектов.
    if (daysInRange(query.date_from, query.date_to) > MAX_RANGE_DAYS) {
      throw errors.invalidDateRange(
        `Диапазон длиннее ${MAX_RANGE_DAYS} дней запрашивать нельзя`,
      );
    }

    const activity = repository.getActivity(query.activity_id);
    if (activity === null) {
      throw errors.activityNotFound();
    }

    // Роутер отвечает за поход в базу, движок слотов за вычисления.
    const schedules = repository.listSchedules(activity.id);
    const busy = repository.listBusySlots(activity.id, query.date_from, query.date_to);
    return buildSlots(activity, schedules, busy, query.date_from, query.date_to);
  });
}
