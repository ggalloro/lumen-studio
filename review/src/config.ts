import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  tokenSecret: string;
  internalToken: string;
  assetsUrl: string;
  /** Path to the SQLite file, or ":memory:". */
  dbPath: string;
  heartbeatMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.DATA_DIR || './data';
  return {
    port: Number(env.PORT || 8084),
    host: env.HOST || '0.0.0.0',
    tokenSecret: env.TOKEN_SECRET || 'dev-secret-change-me',
    internalToken: env.INTERNAL_TOKEN || 'dev-internal-token',
    assetsUrl: (env.ASSETS_URL || 'http://localhost:8082').replace(/\/+$/, ''),
    dbPath: path.join(dataDir, 'review.db'),
    heartbeatMs: 15_000,
  };
}
