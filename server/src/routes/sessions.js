import { createGuestSession, revokeSession } from '../services/sessions.js';

export async function sessionRoutes(app) {
  app.post('/api/sessions/guest', async (_request, reply) => {
    const session = await createGuestSession(app.pg);
    reply.header('cache-control', 'no-store');
    return reply.code(201).send({
      token: session.token,
      player: { id: session.playerId, mode: 'online_guest' },
      session: { id: session.sessionId, createdAt: session.createdAt, expiresAt: session.expiresAt }
    });
  });

  app.get('/api/sessions/me', { preHandler: app.requireSession }, async request => ({
    player: { id: request.player.id, mode: request.player.mode },
    session: { id: request.player.sessionId, expiresAt: request.player.expiresAt }
  }));

  app.delete('/api/sessions/current', { preHandler: app.requireSession }, async (request, reply) => {
    await revokeSession(app.pg, request.player.id, request.player.sessionId);
    return reply.code(204).send();
  });
}
