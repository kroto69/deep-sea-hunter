import Fastify from 'fastify';
import { config } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { huntRoutes } from './routes/hunts.js';
import { authenticate } from './services/sessions.js';
import { economyRoutes } from './routes/economy.js';
import { nearRoutes } from './routes/near.js';

export function buildApp(db, { logger = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 64 * 1024, ajv: { customOptions: { removeAdditional: false } } });
  app.decorate('pg', db);
  app.decorateRequest('player', null);
  app.decorate('requireSession', async (request, reply) => {
    const player = await authenticate(db, request);
    if (!player) return reply.code(401).send({ error: 'authentication_required' });
    request.player = { id: player.player_id, mode: player.mode, sessionId: player.session_id, expiresAt: player.expires_at };
  });
  // ponytail: per-process limiter; use shared storage before multiple API replicas.
  const windows = new Map();
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff');
    const origin = request.headers.origin;
    if (origin && origin !== config.allowedOrigin) return reply.code(403).send({ error: 'origin_not_allowed' });
    if (origin) {
      reply.header('access-control-allow-origin', config.allowedOrigin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
      reply.header('access-control-allow-headers', 'content-type,authorization,idempotency-key');
    }
    if (request.method === 'OPTIONS') return reply.code(204).send();
    if (!request.url.startsWith('/api/')) return;
    const now = Date.now();
    if (windows.size > 10000) for (const [key, entry] of windows) if (entry.until <= now) windows.delete(key);
    const guest = request.url === '/api/sessions/guest';
    const key = `${request.ip}:${guest ? 'guest' : 'api'}`;
    let entry = windows.get(key);
    if (!entry || entry.until <= now) {
      if (!entry && windows.size >= 20000) return reply.code(503).send({ error: 'busy' });
      entry = { until: now + 60000, count: 0 }; windows.set(key, entry);
    }
    if (++entry.count > (guest ? 30 : 300)) return reply.header('retry-after', '60').code(429).send({ error: 'rate_limited' });
  });
  app.register(healthRoutes);
  app.register(sessionRoutes);
  app.register(huntRoutes);
  app.register(economyRoutes);
  app.register(nearRoutes);
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not_found' }));
  app.setErrorHandler((error, request, reply) => {
    const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) request.log.error({ code: error.code, requestId: request.id }, 'request failed');
    reply.code(status).send({ error: status === 500 ? 'internal_error' : error.validation ? 'invalid_request' : error.code || 'invalid_request' });
  });
  return app;
}
