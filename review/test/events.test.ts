import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authHeader, createReview, createTestApp, tokenFor } from './helpers.js';

let app: FastifyInstance;
let baseUrl: string;

beforeEach(async () => {
  app = await createTestApp();
  baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  await createReview(app, 'leo', 7, 1);
});

afterEach(async () => {
  await app.close();
});

/** Reads from an SSE response until `predicate` matches the accumulated text. */
async function readUntil(res: Response, predicate: (text: string) => boolean): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + 5000;
  while (!predicate(text)) {
    if (Date.now() > deadline) throw new Error(`timed out, received: ${text}`);
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();
  return text;
}

describe('GET /reviews/:id/events', () => {
  it('requires a token', async () => {
    const res = await fetch(`${baseUrl}/reviews/1/events`);
    expect(res.status).toBe(401);
  });

  it('streams annotation, decision and status events using ?token=', async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/reviews/1/events?token=${tokenFor('maya')}`, { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // Wait until the subscription is registered before publishing.
    while (app.reviewBus.listenerCount(1) === 0) await new Promise((r) => setTimeout(r, 10));

    await app.inject({
      method: 'POST',
      url: '/reviews/1/annotations',
      headers: authHeader('maya'),
      payload: { x_pct: 10, y_pct: 20, body: 'Pin' },
    });
    await app.inject({
      method: 'POST',
      url: '/reviews/1/decision',
      headers: authHeader('maya'),
      payload: { decision: 'approve' },
    });

    const text = await readUntil(res, (t) => t.includes('event: status') && t.includes(': heartbeat'));
    expect(text).toContain('event: annotation\ndata: {');
    expect(text).toContain('"body":"Pin"');
    expect(text).toContain('event: decision\n');
    expect(text).toContain('event: status\ndata: {"status":"approved"}');
    controller.abort();

    // Listeners are removed when the client disconnects.
    const deadline = Date.now() + 2000;
    while (app.reviewBus.listenerCount(1) > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(app.reviewBus.listenerCount(1)).toBe(0);
  });
});
