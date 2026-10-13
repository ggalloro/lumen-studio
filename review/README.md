# review

TypeScript service (Fastify 5, better-sqlite3) that runs review cycles on asset versions:
pinned annotations, approve or request-changes decisions, and a live event stream for the
review canvas.

Contract: [`../docs/api.md`](../docs/api.md#review-8084-typescript--node--fastify).

## Behaviour

- `POST /reviews` reads the asset from assets (`GET {ASSETS_URL}/assets/{id}` with the
  internal token) to confirm the version exists and to record `asset_owner_id`. A missing
  asset or version returns 404; an unreachable or failing assets service returns 502. An
  asset can have only one open review (`in_review` or `changes_requested`); a second one
  returns 409.
- Annotations carry `x_pct` and `y_pct` from 0 to 100, measured from the top-left of the
  image at its natural size, and are numbered from 1 within each review. They are accepted
  until the review is `approved`.
- Decisions follow the four-eyes rule: the caller must have role `reviewer` or
  `brand_admin` and must not be the asset owner (403 otherwise). Decisions are only allowed
  while the review is `in_review` (409 otherwise). `approve` moves the review to
  `approved`, `request_changes` moves it to `changes_requested`.
- `POST /reviews/{id}/versions` moves a `changes_requested` review back to `in_review` on a
  newer version, which must exist in assets.
- `author_name` and `reviewer_name` come from the JWT `name` claim.
- Callers only see reviews in their own workspace. Reviews in other workspaces return 404.
  `GET` routes also accept `X-Internal-Token`, which skips workspace filtering.

### Live events

`GET /reviews/{id}/events` is a Server-Sent Events stream. Pass the JWT in the
`Authorization` header or as `?token=` (EventSource cannot set headers). Events:

| Event | Data |
|---|---|
| `annotation` | Annotation |
| `decision` | Decision |
| `status` | `{"status": "<new status>"}` |

A comment line (`: heartbeat`) is sent every 15 seconds to keep proxies from closing the
connection. Events are delivered through an in-process event bus, so all clients must reach
the same instance.

## Configuration

| Variable | Default |
|---|---|
| `PORT` | `8084` |
| `TOKEN_SECRET` | `dev-secret-change-me` |
| `INTERNAL_TOKEN` | `dev-internal-token` |
| `ASSETS_URL` | `http://localhost:8082` |
| `DATA_DIR` | `./data` (database at `$DATA_DIR/review.db`) |

## Development

Requires Node 22 or later.

```sh
npm install
npm run dev         # tsx watch on :8084
npm test            # vitest, routes exercised with fastify.inject
npm run typecheck
npm run build       # compile to dist/
npm start           # run the compiled build
```

Tests use an in-memory database and replace the HTTP call to assets with a fake `fetch`
passed to `buildApp`, so no other service needs to be running.

Layout:

| Path | Purpose |
|---|---|
| `src/server.ts` | Process entry point |
| `src/app.ts` | Builds the Fastify instance, error handling, wiring |
| `src/routes/reviews.ts` | Review, annotation, decision, version and event routes |
| `src/db.ts` | Schema and data access |
| `src/auth.ts` | JWT and internal token checks |
| `src/assets.ts` | Client for the assets service |
| `src/events.ts` | In-process event bus for SSE |

## Docker

```sh
docker build -t lumen-review .
docker run --rm -p 8084:8084 -v review-data:/data -e ASSETS_URL=http://assets:8082 lumen-review
```

The image runs as the `node` user and stores the database in `/data`.
