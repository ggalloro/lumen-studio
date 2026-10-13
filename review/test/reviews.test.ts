import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Annotation, Review } from '../src/types.js';
import {
  INTERNAL_TOKEN,
  authHeader,
  createFakeFetch,
  createReview,
  createTestApp,
  type FetchCall,
  type UserKey,
} from './helpers.js';

let app: FastifyInstance;
let calls: FetchCall[];

beforeEach(async () => {
  const fake = createFakeFetch();
  calls = fake.calls;
  app = await createTestApp(fake.fetch);
});

afterEach(async () => {
  await app.close();
});

async function decide(reviewId: number, user: UserKey, decision: string, note?: string) {
  return app.inject({
    method: 'POST',
    url: `/reviews/${reviewId}/decision`,
    headers: authHeader(user),
    payload: note === undefined ? { decision } : { decision, note },
  });
}

describe('health', () => {
  it('reports ok without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'review' });
  });
});

describe('auth', () => {
  it('rejects requests without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/reviews' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty('error');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const bad = jwt.sign({ user_id: 1, workspace_id: 1, role: 'designer', name: 'x' }, 'nope');
    const res = await app.inject({ method: 'GET', url: '/reviews', headers: { authorization: `Bearer ${bad}` } });
    expect(res.statusCode).toBe(401);
  });

  it('accepts the internal token on GET routes but not on writes', async () => {
    await createReview(app, 'leo', 7, 1);
    const list = await app.inject({ method: 'GET', url: '/reviews', headers: { 'x-internal-token': INTERNAL_TOKEN } });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);

    const one = await app.inject({ method: 'GET', url: '/reviews/1', headers: { 'x-internal-token': INTERNAL_TOKEN } });
    expect(one.statusCode).toBe(200);

    const wrong = await app.inject({ method: 'GET', url: '/reviews', headers: { 'x-internal-token': 'wrong' } });
    expect(wrong.statusCode).toBe(401);

    const write = await app.inject({
      method: 'POST',
      url: '/reviews',
      headers: { 'x-internal-token': INTERNAL_TOKEN },
      payload: { asset_id: 9, version: 1 },
    });
    expect(write.statusCode).toBe(401);
  });

  it('skips workspace filtering for the internal token', async () => {
    await createReview(app, 'leo', 7, 1);
    await createReview(app, 'outsider', 20, 1);
    const internal = await app.inject({ method: 'GET', url: '/reviews', headers: { 'x-internal-token': INTERNAL_TOKEN } });
    expect(internal.json().items).toHaveLength(2);
    const user = await app.inject({ method: 'GET', url: '/reviews', headers: authHeader('maya') });
    expect(user.json().items).toHaveLength(1);
    const hidden = await app.inject({ method: 'GET', url: '/reviews/2', headers: authHeader('maya') });
    expect(hidden.statusCode).toBe(404);
  });
});

describe('POST /reviews', () => {
  it('creates a review using the asset owner from the assets service', async () => {
    const res = await createReview(app, 'ana', 7, 2);
    expect(res.statusCode).toBe(201);
    const review = res.json<Review>();
    expect(review).toMatchObject({
      id: 1,
      workspace_id: 1,
      asset_id: 7,
      version: 2,
      asset_owner_id: 1,
      status: 'in_review',
      created_by: 2,
      annotations: [],
      decisions: [],
    });
    expect(review.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://assets.test/assets/7');
    expect(calls[0]!.headers['x-internal-token']).toBe(INTERNAL_TOKEN);
  });

  it('returns 404 when the asset does not exist', async () => {
    const res = await createReview(app, 'leo', 404, 1);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found/);
  });

  it('returns 404 when the version does not exist', async () => {
    const res = await createReview(app, 'leo', 7, 9);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an asset in another workspace', async () => {
    const res = await createReview(app, 'leo', 20, 1);
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when the asset already has an open review', async () => {
    expect((await createReview(app, 'leo', 7, 1)).statusCode).toBe(201);
    const dup = await createReview(app, 'ana', 7, 2);
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toHaveProperty('error');
  });

  it('returns 409 while the open review is in changes_requested', async () => {
    await createReview(app, 'leo', 7, 1);
    await decide(1, 'maya', 'request_changes');
    expect((await createReview(app, 'leo', 7, 2)).statusCode).toBe(409);
  });

  it('allows a new review once the previous one is approved', async () => {
    await createReview(app, 'leo', 7, 1);
    await decide(1, 'maya', 'approve');
    expect((await createReview(app, 'leo', 7, 2)).statusCode).toBe(201);
  });

  it('validates the body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reviews',
      headers: authHeader('leo'),
      payload: { asset_id: 'seven', version: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/asset_id/);
  });

  it('returns 502 when the assets service is unreachable', async () => {
    const broken = await createTestApp((async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch);
    try {
      const res = await createReview(broken, 'leo', 7, 1);
      expect(res.statusCode).toBe(502);
    } finally {
      await broken.close();
    }
  });
});

describe('annotations', () => {
  async function annotate(payload: unknown, user: UserKey = 'maya', reviewId = 1) {
    return app.inject({
      method: 'POST',
      url: `/reviews/${reviewId}/annotations`,
      headers: authHeader(user),
      payload: payload as Record<string, unknown>,
    });
  }

  beforeEach(async () => {
    await createReview(app, 'leo', 7, 1);
  });

  it('creates numbered annotations with the author name from the token', async () => {
    const first = await annotate({ x_pct: 12.5, y_pct: 40, body: 'Logo too close to the edge' });
    expect(first.statusCode).toBe(201);
    expect(first.json<Annotation>()).toMatchObject({
      review_id: 1,
      number: 1,
      author_id: 3,
      author_name: 'Maya Okafor',
      x_pct: 12.5,
      y_pct: 40,
      body: 'Logo too close to the edge',
    });
    const second = await annotate({ x_pct: 0, y_pct: 100, body: 'Crop the bottom' }, 'leo');
    expect(second.json<Annotation>().number).toBe(2);

    const review = (await app.inject({ method: 'GET', url: '/reviews/1', headers: authHeader('leo') })).json<Review>();
    expect(review.annotations.map((a) => a.number)).toEqual([1, 2]);
  });

  it.each([
    [{ x_pct: -0.1, y_pct: 50, body: 'x' }, 'x_pct'],
    [{ x_pct: 50, y_pct: 100.01, body: 'x' }, 'y_pct'],
    [{ x_pct: 101, y_pct: 50, body: 'x' }, 'x_pct'],
    [{ x_pct: '50', y_pct: 50, body: 'x' }, 'x_pct'],
    [{ x_pct: 50, y_pct: 50, body: '' }, 'body'],
    [{ x_pct: 50, y_pct: 50, body: '   ' }, 'body'],
    [{ x_pct: 50, y_pct: 50 }, 'body'],
  ])('rejects %j', async (payload, field) => {
    const res = await annotate(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain(field);
  });

  it('returns 404 for an unknown review', async () => {
    const res = await annotate({ x_pct: 1, y_pct: 1, body: 'x' }, 'maya', 99);
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 once the review is approved', async () => {
    await decide(1, 'maya', 'approve');
    const res = await annotate({ x_pct: 1, y_pct: 1, body: 'late note' });
    expect(res.statusCode).toBe(409);
  });

  it('still accepts annotations while changes are requested', async () => {
    await decide(1, 'maya', 'request_changes');
    const res = await annotate({ x_pct: 1, y_pct: 1, body: 'one more thing' });
    expect(res.statusCode).toBe(201);
  });
});

describe('decisions (four-eyes rule)', () => {
  it('lets a reviewer approve an asset they do not own', async () => {
    await createReview(app, 'leo', 7, 1);
    const res = await decide(1, 'maya', 'approve', 'Looks good');
    expect(res.statusCode).toBe(200);
    const review = res.json<Review>();
    expect(review.status).toBe('approved');
    expect(review.decisions).toHaveLength(1);
    expect(review.decisions[0]).toMatchObject({
      reviewer_id: 3,
      reviewer_name: 'Maya Okafor',
      decision: 'approve',
      note: 'Looks good',
    });
  });

  it('lets a brand admin request changes on an asset they do not own', async () => {
    await createReview(app, 'leo', 7, 1);
    const res = await decide(1, 'priya', 'request_changes');
    expect(res.statusCode).toBe(200);
    expect(res.json<Review>().status).toBe('changes_requested');
    expect(res.json<Review>().decisions[0]!.note).toBe('');
  });

  it('forbids designers from deciding', async () => {
    await createReview(app, 'leo', 7, 1);
    const res = await decide(1, 'ana', 'approve');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toHaveProperty('error');
  });

  it('forbids a brand admin from approving their own asset', async () => {
    // Priya owns asset 8 and opens the review herself.
    const created = await createReview(app, 'priya', 8, 1);
    expect(created.json<Review>()).toMatchObject({ asset_owner_id: 5, created_by: 5 });
    const res = await decide(1, 'priya', 'approve');
    expect(res.statusCode).toBe(403);
    const review = (await app.inject({ method: 'GET', url: '/reviews/1', headers: authHeader('priya') })).json<Review>();
    expect(review.status).toBe('in_review');
    expect(review.decisions).toHaveLength(0);
  });

  it('returns 409 when the review is not in_review', async () => {
    await createReview(app, 'leo', 7, 1);
    await decide(1, 'maya', 'approve');
    const again = await decide(1, 'sam', 'request_changes');
    expect(again.statusCode).toBe(409);
  });

  it('rejects an unknown decision value', async () => {
    await createReview(app, 'leo', 7, 1);
    const res = await decide(1, 'maya', 'maybe');
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /reviews/:id/versions', () => {
  async function submitVersion(version: number, reviewId = 1) {
    return app.inject({
      method: 'POST',
      url: `/reviews/${reviewId}/versions`,
      headers: authHeader('leo'),
      payload: { version },
    });
  }

  it('moves a changes_requested review back to in_review on the new version', async () => {
    await createReview(app, 'leo', 7, 1);
    await decide(1, 'maya', 'request_changes', 'Fix the colours');
    const res = await submitVersion(2);
    expect(res.statusCode).toBe(200);
    expect(res.json<Review>()).toMatchObject({ version: 2, status: 'in_review' });

    const approved = await decide(1, 'maya', 'approve');
    expect(approved.json<Review>().status).toBe('approved');
    expect(approved.json<Review>().decisions.map((d) => d.decision)).toEqual(['request_changes', 'approve']);
  });

  it('returns 409 unless the review is in changes_requested', async () => {
    await createReview(app, 'leo', 7, 1);
    expect((await submitVersion(2)).statusCode).toBe(409);
    await decide(1, 'maya', 'approve');
    expect((await submitVersion(3)).statusCode).toBe(409);
  });

  it('returns 409 when the version is not newer', async () => {
    await createReview(app, 'leo', 7, 2);
    await decide(1, 'maya', 'request_changes');
    expect((await submitVersion(2)).statusCode).toBe(409);
    expect((await submitVersion(1)).statusCode).toBe(409);
  });

  it('returns 404 when the new version does not exist', async () => {
    await createReview(app, 'leo', 7, 1);
    await decide(1, 'maya', 'request_changes');
    expect((await submitVersion(8)).statusCode).toBe(404);
  });
});

describe('GET /reviews filters', () => {
  beforeEach(async () => {
    await createReview(app, 'leo', 7, 1); // id 1
    await createReview(app, 'ana', 9, 2); // id 2
    await createReview(app, 'priya', 8, 1); // id 3
    await decide(1, 'maya', 'approve');
    await decide(2, 'maya', 'request_changes');
  });

  async function list(query: string) {
    return app.inject({ method: 'GET', url: `/reviews${query}`, headers: authHeader('maya') });
  }

  it('returns newest first with annotations and decisions', async () => {
    const res = await list('');
    expect(res.statusCode).toBe(200);
    const items = res.json<{ items: Review[] }>().items;
    expect(items.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(items[2]!.decisions).toHaveLength(1);
    expect(items[0]!.annotations).toEqual([]);
  });

  it('filters by asset_id', async () => {
    const items = (await list('?asset_id=9')).json<{ items: Review[] }>().items;
    expect(items.map((r) => r.asset_id)).toEqual([9]);
  });

  it('filters by status', async () => {
    const approved = (await list('?status=approved')).json<{ items: Review[] }>().items;
    expect(approved.map((r) => r.id)).toEqual([1]);
    const open = (await list('?status=in_review')).json<{ items: Review[] }>().items;
    expect(open.map((r) => r.id)).toEqual([3]);
  });

  it('combines filters', async () => {
    const items = (await list('?asset_id=7&status=in_review')).json<{ items: Review[] }>().items;
    expect(items).toEqual([]);
  });

  it('rejects an invalid status filter', async () => {
    expect((await list('?status=done')).statusCode).toBe(400);
  });
});

describe('GET /reviews/:id', () => {
  it('returns 404 for a missing review', async () => {
    const res = await app.inject({ method: 'GET', url: '/reviews/42', headers: authHeader('maya') });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'review 42 not found' });
  });
});
