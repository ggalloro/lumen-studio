import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AssetsClient } from '../assets.js';
import type { Auth } from '../auth.js';
import { isUniqueViolation, type ReviewStore } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import type { ReviewEvent, ReviewEventBus } from '../events.js';
import { DECISIONS, REVIEW_STATUSES, type Principal, type Review, type ReviewStatus } from '../types.js';

export interface ReviewRoutesOptions {
  store: ReviewStore;
  assets: AssetsClient;
  auth: Auth;
  bus: ReviewEventBus;
  heartbeatMs: number;
}

const positiveInt = z.number().int().positive();

const idParams = z.object({ id: z.coerce.number().int().positive() });

const createReviewBody = z.object({
  asset_id: positiveInt,
  version: positiveInt,
});

const listQuery = z.object({
  asset_id: z.coerce.number().int().positive().optional(),
  status: z.enum(REVIEW_STATUSES).optional(),
});

const pct = z.number().min(0, 'must be between 0 and 100').max(100, 'must be between 0 and 100');

const annotationBody = z.object({
  x_pct: pct,
  y_pct: pct,
  body: z.string().trim().min(1, 'must not be empty').max(5000),
});

const decisionBody = z.object({
  decision: z.enum(DECISIONS),
  note: z.string().max(5000).nullish(),
});

const versionBody = z.object({ version: positiveInt });

const DECISION_ROLES = new Set(['reviewer', 'brand_admin']);

/** Parses input with a zod schema, raising 400 with the first issue as the message. */
function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw badRequest(`${field}${issue?.message ?? 'invalid request'}`);
  }
  return result.data;
}

function canSee(principal: Principal, review: Review): boolean {
  return principal.kind === 'internal' || principal.workspace_id === review.workspace_id;
}

export async function reviewRoutes(app: FastifyInstance, opts: ReviewRoutesOptions): Promise<void> {
  const { store, assets, auth, bus } = opts;
  const openStreams = new Set<FastifyReply>();

  /** Loads a review the caller is allowed to see. Other workspaces get 404. */
  const loadReview = (id: number, principal: Principal): Review => {
    const review = store.get(id);
    if (!review || !canSee(principal, review)) throw notFound(`review ${id} not found`);
    return review;
  };

  const publishStatus = (reviewId: number, status: ReviewStatus) =>
    bus.publish(reviewId, { type: 'status', data: { status } });

  app.post('/reviews', async (req, reply) => {
    const user = auth.user(req);
    const body = parse(createReviewBody, req.body);

    const asset = await assets.getAssetWithVersion(body.asset_id, body.version);
    if (asset.workspace_id !== user.workspace_id) {
      throw notFound(`asset ${body.asset_id} not found`);
    }
    if (store.findOpenForAsset(body.asset_id)) {
      throw conflict(`asset ${body.asset_id} already has an open review`);
    }

    let review: Review;
    try {
      review = store.create({
        workspace_id: asset.workspace_id,
        asset_id: body.asset_id,
        version: body.version,
        asset_owner_id: asset.owner_id,
        created_by: user.user_id,
      });
    } catch (err) {
      // Two concurrent creates can both pass the check above; the partial unique index settles it.
      if (isUniqueViolation(err)) throw conflict(`asset ${body.asset_id} already has an open review`);
      throw err;
    }
    req.log.info({ review_id: review.id, asset_id: review.asset_id }, 'review created');
    return reply.code(201).send(review);
  });

  app.get('/reviews', async (req) => {
    const principal = auth.userOrInternal(req);
    const query = parse(listQuery, req.query);
    const items = store.list({
      workspaceId: principal.kind === 'user' ? principal.workspace_id : undefined,
      assetId: query.asset_id,
      status: query.status,
    });
    return { items };
  });

  app.get('/reviews/:id', async (req) => {
    const principal = auth.userOrInternal(req);
    const { id } = parse(idParams, req.params);
    return loadReview(id, principal);
  });

  app.post('/reviews/:id/annotations', async (req, reply) => {
    const user = auth.user(req);
    const { id } = parse(idParams, req.params);
    const review = loadReview(id, user);
    const body = parse(annotationBody, req.body);
    if (review.status === 'approved') {
      throw conflict('review is approved and closed for annotations');
    }
    const annotation = store.addAnnotation(review.id, {
      author_id: user.user_id,
      author_name: user.name,
      x_pct: body.x_pct,
      y_pct: body.y_pct,
      body: body.body,
    });
    bus.publish(review.id, { type: 'annotation', data: annotation });
    return reply.code(201).send(annotation);
  });

  app.post('/reviews/:id/decision', async (req) => {
    const user = auth.user(req);
    const { id } = parse(idParams, req.params);
    const review = loadReview(id, user);
    const body = parse(decisionBody, req.body);

    // Four-eyes rule: only reviewers or brand admins may decide, and never on their own asset.
    if (!DECISION_ROLES.has(user.role)) {
      throw forbidden('only reviewers and brand admins can decide on a review');
    }
    if (user.user_id === review.asset_owner_id) {
      throw forbidden('the asset owner cannot decide on their own asset');
    }
    if (review.status !== 'in_review') {
      throw conflict(`review is ${review.status}, decisions require in_review`);
    }

    const status: ReviewStatus = body.decision === 'approve' ? 'approved' : 'changes_requested';
    const decision = store.addDecision(
      review.id,
      { reviewer_id: user.user_id, reviewer_name: user.name, decision: body.decision, note: body.note ?? '' },
      status,
    );
    bus.publish(review.id, { type: 'decision', data: decision });
    publishStatus(review.id, status);
    req.log.info({ review_id: review.id, decision: body.decision }, 'review decided');
    return store.get(review.id);
  });

  app.post('/reviews/:id/versions', async (req) => {
    const user = auth.user(req);
    const { id } = parse(idParams, req.params);
    const review = loadReview(id, user);
    const body = parse(versionBody, req.body);

    if (review.status !== 'changes_requested') {
      throw conflict(`review is ${review.status}, a new version can only follow changes_requested`);
    }
    if (body.version <= review.version) {
      throw conflict(`version must be newer than the current version ${review.version}`);
    }
    await assets.getAssetWithVersion(review.asset_id, body.version);

    store.moveToVersion(review.id, body.version);
    publishStatus(review.id, 'in_review');
    return store.get(review.id);
  });

  app.get('/reviews/:id/events', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = auth.userFromHeaderOrQuery(req);
    const { id } = parse(idParams, req.params);
    const review = loadReview(id, user);

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    const send = (event: ReviewEvent) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };
    const unsubscribe = bus.subscribe(review.id, send);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), opts.heartbeatMs);
    openStreams.add(reply);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      openStreams.delete(reply);
    };
    req.raw.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  });

  // End open event streams so server shutdown does not wait on them.
  app.addHook('preClose', async () => {
    for (const reply of openStreams) reply.raw.end();
    openStreams.clear();
  });
}
