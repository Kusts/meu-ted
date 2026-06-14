import Fastify from 'fastify';
import { registerRoutes } from '../routes/index.js';
import { createInMemoryReadModelStore } from '../read-models/store.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const start = async (): Promise<void> => {
  const app = Fastify({ logger: true });
  const store = createInMemoryReadModelStore();
  registerRoutes(app, { store });
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

void start();
