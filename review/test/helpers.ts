import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { FetchFn } from '../src/assets.js';

export const TOKEN_SECRET = 'test-secret';
export const INTERNAL_TOKEN = 'test-internal';
export const ASSETS_URL = 'http://assets.test';

export const users = {
  leo: { user_id: 1, workspace_id: 1, role: 'designer', name: 'Leo Park' },
  ana: { user_id: 2, workspace_id: 1, role: 'designer', name: 'Ana Ruiz' },
  maya: { user_id: 3, workspace_id: 1, role: 'reviewer', name: 'Maya Okafor' },
  sam: { user_id: 4, workspace_id: 1, role: 'reviewer', name: 'Sam Whitfield' },
  priya: { user_id: 5, workspace_id: 1, role: 'brand_admin', name: 'Priya Natarajan' },
  outsider: { user_id: 9, workspace_id: 2, role: 'reviewer', name: 'Other Workspace' },
} as const;

export type UserKey = keyof typeof users;

export function tokenFor(user: UserKey): string {
  return jwt.sign(users[user], TOKEN_SECRET, { algorithm: 'HS256', expiresIn: '12h' });
}

export function authHeader(user: UserKey): Record<string, string> {
  return { authorization: `Bearer ${tokenFor(user)}` };
}

interface FakeAsset {
  workspace_id: number;
  owner_id: number;
  versions: number[];
}

/** Assets known to the fake assets service, keyed by asset id. */
export const fakeAssets: Record<number, FakeAsset> = {
  7: { workspace_id: 1, owner_id: 1, versions: [1, 2, 3] }, // owned by Leo (designer)
  8: { workspace_id: 1, owner_id: 5, versions: [1] }, // owned by Priya (brand_admin)
  9: { workspace_id: 1, owner_id: 2, versions: [1, 2] }, // owned by Ana (designer)
  20: { workspace_id: 2, owner_id: 9, versions: [1] }, // another workspace
};

export interface FetchCall {
  url: string;
  headers: Record<string, string>;
}

/** A fetch replacement that serves `GET {ASSETS_URL}/assets/{id}` from `fakeAssets`. */
export function createFakeFetch(): { fetch: FetchFn; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url, headers });
    if (headers['x-internal-token'] !== INTERNAL_TOKEN) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    const match = url.match(/^http:\/\/assets\.test\/assets\/(\d+)$/);
    const asset = match ? fakeAssets[Number(match[1])] : undefined;
    if (!asset) {
      return Response.json({ error: 'asset not found' }, { status: 404 });
    }
    return Response.json({
      id: Number(match![1]),
      workspace_id: asset.workspace_id,
      owner_id: asset.owner_id,
      title: 'Test asset',
      versions: asset.versions.map((version) => ({ asset_id: Number(match![1]), version })),
    });
  }) as FetchFn;
  return { fetch: fakeFetch, calls };
}

export async function createTestApp(fetchFn?: FetchFn): Promise<FastifyInstance> {
  return buildApp({
    config: {
      tokenSecret: TOKEN_SECRET,
      internalToken: INTERNAL_TOKEN,
      assetsUrl: ASSETS_URL,
      dbPath: ':memory:',
      heartbeatMs: 50,
    },
    fetch: fetchFn ?? createFakeFetch().fetch,
    logger: false,
  });
}

export async function createReview(app: FastifyInstance, user: UserKey, assetId: number, version: number) {
  return app.inject({
    method: 'POST',
    url: '/reviews',
    headers: authHeader(user),
    payload: { asset_id: assetId, version },
  });
}
