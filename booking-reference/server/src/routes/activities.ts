/** Эндпоинты видов активности. */

import type { FastifyInstance } from 'fastify';

import type { Repository } from '../repository.js';
import { activityCreateSchema } from '../schemas.js';

export function activityRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/api/activities', async () => repository.listActivities());

  app.post('/api/activities', async (request, reply) => {
    const input = activityCreateSchema.parse(request.body);
    reply.code(201);
    return repository.createActivity(input);
  });
}
