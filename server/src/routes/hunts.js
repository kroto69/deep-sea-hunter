import { createHunt, getHunt, submitShot } from '../services/hunts.js';

export async function huntRoutes(app) {
  app.post('/api/hunts', { preHandler: app.requireSession, schema: { body: {
    type: 'object', additionalProperties: false, required: ['habitatId'], properties: { habitatId: { type: 'string', minLength: 1, maxLength: 40, pattern: '^[a-z0-9_-]+$' } }
  } } }, async (request, reply) => {
    const hunt = await createHunt(app.pg, request.player, request.body.habitatId);
    reply.header('cache-control', 'no-store');
    return reply.code(201).send(hunt);
  });

  app.get('/api/hunts/:id', { preHandler: app.requireSession, schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } } }, async request => {
    const hunt = await getHunt(app.pg, request.player.id, request.params.id);
    return hunt;
  });

  app.post('/api/hunts/:id/shots', { preHandler: app.requireSession, schema: {
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    body: { type: 'object', additionalProperties: false, required: ['shotId', 'speciesId'], properties: {
      shotId: { type: 'string', minLength: 8, maxLength: 80, pattern: '^[A-Za-z0-9_-]+$' }, speciesId: { type: 'string', minLength: 1, maxLength: 40, pattern: '^[a-z0-9_-]+$' }
    } }
  } }, async (request, reply) => {
    const result = await submitShot(app.pg, request.player, request.params.id, request.body, request.headers['idempotency-key']);
    return reply.code(201).send(result);
  });
}
