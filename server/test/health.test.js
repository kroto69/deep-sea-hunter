import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { healthRoutes } from '../src/routes/health.js';

 test('health endpoint reports API process status without database access', async () => {
  const app = Fastify();
  app.decorate('pg', { query: async () => { throw new Error('database should not be used'); } });
  app.register(healthRoutes);
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok', service: 'deep-sea-hunter-api' });
  await app.close();
});

test('ready endpoint marks unavailable database as not ready', async () => {
  const app = Fastify();
  app.decorate('pg', { query: async () => { throw new Error('database unavailable'); } });
  app.register(healthRoutes);
  const response = await app.inject({ method: 'GET', url: '/ready' });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { status: 'not_ready', database: 'unavailable' });
  await app.close();
});
