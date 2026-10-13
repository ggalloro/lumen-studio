import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { AssetsClient, type FetchFn } from './assets.js';
import { createAuth } from './auth.js';
import { loadConfig, type Config } from './config.js';
import { openDatabase, ReviewStore, type DB } from './db.js';
import { HttpError } from './errors.js';
import { ReviewEventBus } from './events.js';
import { reviewRoutes } from './routes/reviews.js';

export interface BuildAppOptions {
  config?: Partial<Config>;
  /** Override the fetch used to call the assets service (tests). */
  fetch?: FetchFn;
  logger?: FastifyServerOptions['logger'];
}

/** Strips the `token` query parameter so JWTs do not end up in request logs. */
function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]*/g, '$1[redacted]');
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config: Config = { ...loadConfig(), ...opts.config };

  const app = Fastify({
    logger:
      opts.logger === undefined
        ? {
            serializers: {
              req: (req) => ({ method: req.method, url: redactUrl(req.url) }),
            },
          }
        : opts.logger,
  });

  const db: DB = openDatabase(config.dbPath);
  const store = new ReviewStore(db);
  const bus = new ReviewEventBus();
  const auth = createAuth({ tokenSecret: config.tokenSecret, internalToken: config.internalToken });
  const assets = new AssetsClient(config.assetsUrl, config.internalToken, opts.fetch ?? fetch);

  app.decorate('reviewBus', bus);
  app.addHook('onClose', async () => {
    db.close();
  });

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    const status = err.statusCode ?? 500;
    if (status < 500) {
      return reply.code(status).send({ error: err.message });
    }
    req.log.error({ err }, 'unhandled error');
    const message = status === 500 ? 'internal server error' : err.message;
    return reply.code(status).send({ error: message });
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'route not found' }));

  app.get('/health', async () => ({ status: 'ok', service: 'review' }));

  await app.register(reviewRoutes, { store, assets, auth, bus, heartbeatMs: config.heartbeatMs });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    reviewBus: ReviewEventBus;
  }
}
