# studio-web

Browser client for Lumen Studio. TypeScript, React 19, Vite, React Router and React Spectrum.
It talks to the six backend services through a same-origin proxy, so the services need no CORS
configuration.

## Run

```sh
npm install
npm run dev        # http://localhost:3000
```

The dev server proxies `/api/<service>/*` to each backend and strips the prefix:

| Prefix | Default target | Override |
|---|---|---|
| `/api/identity` | `http://localhost:8081` | `IDENTITY_URL` |
| `/api/assets` | `http://localhost:8082` | `ASSETS_URL` |
| `/api/renditions` | `http://localhost:8083` | `RENDITIONS_URL` |
| `/api/review` | `http://localhost:8084` | `REVIEW_URL` |
| `/api/brand` | `http://localhost:8085` | `BRAND_URL` |
| `/api/campaigns` | `http://localhost:8086` | `CAMPAIGNS_URL` |
| `/api/rights` | `http://localhost:8087` | `RIGHTS_URL` |

Sign in with any seeded user (password `lumen-demo`). The login page lists them.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 3000, bound to `0.0.0.0` |
| `npm run build` | Type check, then production build into `dist/` |
| `npm run typecheck` | `tsc -b` without emitting |
| `npm test` | Vitest component tests (jsdom) |

## Layout

- `src/api/`: one typed client per service, matching `docs/api.md`. `client.ts` holds the fetch
  wrapper: it adds the JWT from `localStorage`, turns error bodies into `ApiError`, and sends the
  browser to `/login` on a 401.
- `src/pages/`: one component per route. Asset detail tabs live in `src/pages/asset/`.
- `src/components/`: shared pieces (app shell, app tile, status chips, review canvas and pins).
- `src/lib/`: hooks and helpers (theme, user directory, status mapping, formatting).

Blob URLs returned by the assets service (`/blobs/<sha>`) are loaded as
`/api/assets/blobs/<sha>`; see `blobSrc` in `src/api/assets.ts`.

## Review canvas

Annotation coordinates are percentages of the image. The canvas wrapper is `position: relative`
and shrink-wraps the rendered image (`width: fit-content; max-width: 100%`), and each pin is
placed with `left: x%; top: y%`. Pins therefore stay on the same spot at any window size without
measuring the image. Live updates come from
`EventSource('/api/review/reviews/:id/events?token=...')`.

## Docker

```sh
docker build -t lumen-studio/studio-web .
```

The image builds the app with Node and serves `dist/` with nginx on port 3000. `nginx.conf`
proxies the same `/api/<service>/` prefixes to the compose hostnames `identity:8081`,
`assets:8082`, `renditions:8083`, `review:8084`, `brand-check:8085`, `campaigns:8086` and
`rights:8087`.
Buffering is off for `/api/review/` so Server-Sent Events stream. Upstreams resolve per request
through Docker's DNS, so nginx starts even if a backend is not up yet.

Build output goes to `dist/static/` instead of the Vite default `dist/assets/`, because
`/assets/:id` is a client route.

## Test hooks

Key elements carry `data-testid` attributes for end-to-end tests, for example `asset-card`,
`review-pin`, `review-canvas`, `approve-button`, `request-changes-button`, `publish-button`,
`deliverable-cell`, `seed-user` and `upload-open`.
