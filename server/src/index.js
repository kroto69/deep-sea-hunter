import { buildApp } from './app.js';
import { config } from './config/env.js';
import { pool } from './db/pool.js';
import { tick } from './services/ticks.js';
import { reconcilePending } from './services/near.js';

const app = buildApp(pool, { logger: { level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.authorization'] } });
let timer, running = Promise.resolve();
const runTick = () => {
  running = Promise.all([tick(pool),reconcilePending(pool)]).catch(error => app.log.error({ code: error.code }, 'background tick failed'));
  running.finally(() => { if (timer !== null) timer = setTimeout(runTick, Math.min(config.populationTickSeconds,config.marketTickSeconds)*1000); });
};
app.addHook('onClose', async () => { clearTimeout(timer); timer = null; await running; await pool.end(); });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close());
try {
  await app.listen({ host: config.host, port: config.port });
  runTick();
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
