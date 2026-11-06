export async function healthRoutes(app) {
  app.get('/health', async () => ({ status: 'ok', service: 'deep-sea-hunter-api' }));

  app.get('/ready', async (_request, reply) => {
    try {
      await app.pg.query('SELECT 1');
      return { status: 'ready', database: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'not_ready', database: 'unavailable' });
    }
  });
}
