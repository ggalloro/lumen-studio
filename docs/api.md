# Lumen Studio API contracts

Every service follows these contracts. Change this file in the same PR as any contract change.

## Conventions

- JSON in and out (`Content-Type: application/json`) unless a route says multipart.
- Errors: HTTP status plus body `{"error": "<human readable message>"}`.
  400 validation, 401 missing/invalid token, 403 forbidden, 404 not found, 409 conflict.
- Timestamps: ISO 8601 UTC strings, for example `2026-10-13T09:30:00Z`.
- IDs: integers.
- Every service exposes `GET /health` → `200 {"status": "ok", "service": "<name>"}` (no auth).
- CORS: not needed. The browser reaches every service through the studio-web proxy
  (`/api/<service>/...` → `http://<service>:<port>/...`, prefix stripped).

## Auth

- `identity` mints an HS256 JWT signed with `TOKEN_SECRET` (default `dev-secret-change-me`).
  Claims: `user_id` (int), `workspace_id` (int), `role` (`designer` | `reviewer` | `brand_admin`),
  `name` (string), `exp` (12 hours).
- Clients send `Authorization: Bearer <jwt>`.
- Service-to-service calls send `X-Internal-Token: <INTERNAL_TOKEN>` (default
  `dev-internal-token`). Routes under `/internal/*` require it.
- `GET` routes that other services read (listed per service) accept **either** a valid JWT
  **or** a valid internal token. When called with the internal token, workspace filtering is
  skipped.
- Server-Sent Events routes also accept the JWT as `?token=<jwt>` (EventSource cannot set headers).

## Environment variables (all services)

| Variable | Default |
|---|---|
| `PORT` | the service port below |
| `TOKEN_SECRET` | `dev-secret-change-me` |
| `INTERNAL_TOKEN` | `dev-internal-token` |
| `DATA_DIR` | `./data` (relative to the service directory) |
| `IDENTITY_URL` | `http://localhost:8081` |
| `ASSETS_URL` | `http://localhost:8082` |
| `RENDITIONS_URL` | `http://localhost:8083` |
| `REVIEW_URL` | `http://localhost:8084` |
| `BRAND_URL` | `http://localhost:8085` |
| `CAMPAIGNS_URL` | `http://localhost:8086` |
| `RIGHTS_URL` | `http://localhost:8087` |

A service only reads the URLs it needs.

---

## identity (:8081, Python / FastAPI)

Owns `users.db`. On startup, if the database is empty, it creates workspace `1`
("Northwind Outdoor") and these users, all with password `lumen-demo`:

| id | name | email | role | avatar_color |
|---|---|---|---|---|
| 1 | Leo Park | leo@northwind.example | designer | `#E8590C` |
| 2 | Ana Ruiz | ana@northwind.example | designer | `#2F9E44` |
| 3 | Maya Okafor | maya@northwind.example | reviewer | `#1C7ED6` |
| 4 | Sam Whitfield | sam@northwind.example | reviewer | `#AE3EC9` |
| 5 | Priya Natarajan | priya@northwind.example | brand_admin | `#C92A2A` |

Passwords are stored hashed (bcrypt or PBKDF2).

User object:

```json
{"id": 3, "name": "Maya Okafor", "email": "maya@northwind.example",
 "role": "reviewer", "workspace_id": 1, "avatar_color": "#1C7ED6"}
```

| Route | Auth | Body / query | Response |
|---|---|---|---|
| `POST /login` | none | `{"email", "password"}` | `200 {"token": "<jwt>", "user": User}`; 401 on bad credentials |
| `GET /me` | JWT | | `200 User` |
| `GET /users` | JWT or internal | | `200 {"items": [User]}` (caller's workspace; all users with internal token) |
| `GET /users/{id}` | JWT or internal | | `200 User` or 404 |
| `GET /workspaces/{id}` | JWT or internal | | `200 {"id": 1, "name": "Northwind Outdoor"}` |

---

## assets (:8082, Java / Spring Boot)

Owns `assets.db` and blobs under `$DATA_DIR/blobs/<sha256>`. Accepted uploads: PNG and JPEG,
max 25 MB. Versions are immutable.

Rendition object:

```json
{"preset": "story", "width": 1080, "height": 1920, "sha256": "…",
 "blob_url": "/blobs/<sha256>", "created_at": "…"}
```

Version object:

```json
{"asset_id": 7, "version": 2, "filename": "ridge-jacket-hero.png",
 "content_type": "image/png", "size_bytes": 812345, "width": 2048, "height": 1365,
 "sha256": "…", "blob_url": "/blobs/<sha256>", "alt_text": "…",
 "created_by": 1, "created_at": "…", "renditions": [Rendition]}
```

Asset object:

```json
{"id": 7, "workspace_id": 1, "title": "Ridge Jacket hero", "description": "…",
 "owner_id": 1, "tags": ["jacket", "fall"], "created_at": "…", "updated_at": "…",
 "latest_version": Version, "versions": [Version]}
```

`versions` (ascending by version) is included only on `GET /assets/{id}` and on create.
`latest_version` always includes its `renditions` (the library grid uses the `thumbnail` one).

| Route | Auth | Body / query | Response |
|---|---|---|---|
| `GET /assets` | JWT or internal | `?q=` (title/description substring, case-insensitive), `?tag=`, `?owner_id=` | `200 {"items": [Asset]}` newest `updated_at` first |
| `POST /assets` | JWT | multipart: `file`, `title` (required), `description`, `tags` (comma separated), `alt_text` | `201 Asset`. Owner is the caller. Creates version 1. |
| `GET /assets/{id}` | JWT or internal | | `200 Asset` with `versions` |
| `POST /assets/{id}/versions` | JWT | multipart: `file`, `alt_text` | `201 Version` |
| `GET /assets/{id}/versions/{v}` | JWT or internal | | `200 Version` |
| `GET /blobs/{sha256}` | none (hash is the capability) | `?download=1` adds `Content-Disposition: attachment` | file bytes with stored content type. `Content-Disposition` carries both `filename="<ascii fallback>"` and `filename*=UTF-8''<percent-encoded original>` (RFC 6266 / 5987). |
| `POST /internal/renditions` | internal | multipart: `asset_id`, `version`, `preset`, `width`, `height`, `file` | `201 Rendition`. Replaces an existing rendition with the same preset. |

Rendition download filename: `<original filename stem>_<preset>.jpg`.

After a version is stored, assets sends (asynchronously, 3 attempts with backoff)
`POST {RENDITIONS_URL}/internal/jobs` with the internal token and body
`{"asset_id": 7, "version": 2, "blob_url": "{ASSETS_SELF_URL}/blobs/<sha256>"}`.
`ASSETS_SELF_URL` defaults to `http://localhost:8082`.

---

## renditions (:8083, Go)

Stateless. Jobs are tracked in memory.

Presets (single table in `presets.go`):

| id | label | width | height | mode | anchor |
|---|---|---|---|---|---|
| `instagram_square` | Instagram square | 1080 | 1080 | fill | center |
| `story` | Story 9:16 | 1080 | 1920 | fill | top |
| `web_banner` | Web banner | 1200 | 628 | fill | center |
| `email_header` | Email header | 600 | 200 | fill | center |
| `thumbnail` | Thumbnail | 320 | 320 | fill | center |

`fill` scales to cover then crops at `anchor`. `fit` scales to fit inside. Output is JPEG,
quality 85.

| Route | Auth | Body | Response |
|---|---|---|---|
| `GET /presets` | none | | `200 {"items": [{"id", "label", "width", "height", "mode", "anchor"}]}` |
| `POST /internal/jobs` | internal | `{"asset_id", "version", "blob_url"}` | `202 {"job_id": "<string>", "status": "queued"}` |
| `GET /internal/jobs/{job_id}` | internal | | `200 {"job_id", "asset_id", "version", "status": "queued"|"running"|"done"|"failed", "error": "", "presets_done": ["thumbnail", …]}` |

A job downloads `blob_url`, renders every preset, and uploads each result to
`POST {ASSETS_URL}/internal/renditions`.

---

## review (:8084, TypeScript / Node / Fastify)

Owns `review.db`.

Annotation: `{"id", "review_id", "number", "author_id", "author_name", "x_pct", "y_pct", "body", "created_at"}`.
`x_pct` / `y_pct` are numbers from 0 to 100, measured from the top-left of the image at its
natural size. `number` is 1-based within the review.

Decision: `{"id", "review_id", "reviewer_id", "reviewer_name", "decision": "approve"|"request_changes", "note", "created_at"}`.

Review:

```json
{"id": 4, "workspace_id": 1, "asset_id": 7, "version": 2, "asset_owner_id": 1,
 "status": "in_review", "created_by": 1, "created_at": "…", "updated_at": "…",
 "annotations": [Annotation], "decisions": [Decision]}
```

Status values: `in_review`, `changes_requested`, `approved`.

| Route | Auth | Body / query | Response |
|---|---|---|---|
| `POST /reviews` | JWT | `{"asset_id", "version"}` | `201 Review`. Reads the asset from assets (internal token) to set `asset_owner_id`. 409 if the asset already has a review in `in_review` or `changes_requested`. 404 if the asset/version does not exist. |
| `GET /reviews` | JWT or internal | `?asset_id=`, `?status=` | `200 {"items": [Review]}` newest first (caller's workspace, all with internal token). `annotations` and `decisions` included. |
| `GET /reviews/{id}` | JWT or internal | | `200 Review` |
| `POST /reviews/{id}/annotations` | JWT | `{"x_pct", "y_pct", "body"}` | `201 Annotation`. 400 if out of range or empty body. 409 if review is `approved`. |
| `POST /reviews/{id}/decision` | JWT | `{"decision", "note"?}` | `200 Review`. 403 unless caller role is `reviewer` or `brand_admin` **and** caller `user_id` ≠ `asset_owner_id` (four-eyes rule). 409 unless status is `in_review`. `approve` → `approved`, `request_changes` → `changes_requested`. |
| `POST /reviews/{id}/versions` | JWT | `{"version"}` | `200 Review`. Only from `changes_requested`; moves to `in_review` on the new version. 409 otherwise. |
| `GET /reviews/{id}/events` | JWT (header or `?token=`) | | SSE stream. Events: `annotation` (data: Annotation), `decision` (data: Decision), `status` (data: `{"status"}`). Heartbeat comment every 15 s. |

---

## brand-check (:8085, Python / FastAPI)

Owns `brand.db`. On startup, if empty, creates an empty brand kit for workspace 1.

Brand kit:

```json
{"workspace_id": 1, "name": "Northwind Outdoor",
 "palette": [{"name": "Summit Red", "hex": "#C8102E"}],
 "fonts": ["Source Sans 3"], "tone_of_voice": "…", "logo_rules": "…",
 "palette_tolerance": 18, "updated_at": "…"}
```

Report:

```json
{"id": 12, "asset_id": 7, "version": 2, "overall": "pass"|"warn"|"fail", "score": 86,
 "rules": [{"rule": "palette"|"copy_style", "status": "pass"|"warn"|"fail",
            "message": "…", "details": {}}],
 "created_at": "…"}
```

| Route | Auth | Body / query | Response |
|---|---|---|---|
| `GET /brand-kit` | JWT or internal | | `200 BrandKit` |
| `PUT /brand-kit` | JWT, role `brand_admin` | BrandKit fields (except `workspace_id`, `updated_at`) | `200 BrandKit`; 403 for other roles |
| `POST /checks` | JWT or internal | `{"asset_id", "version"}` | `201 Report`. Reads the version from assets, downloads the original blob. |
| `GET /checks` | JWT or internal | `?asset_id=` (required), `?version=` | `200 {"items": [Report]}` newest first |
| `GET /checks/latest` | JWT or internal | `?asset_id=&version=` (both required) | `200 Report` or 404 |

Rules:

- **palette** (deterministic): extract up to 6 dominant colours (Pillow quantize on a
  downscaled copy), each with its pixel share. A colour is on-palette when its CIE76 ΔE (Lab)
  to the nearest kit colour is ≤ `palette_tolerance`. Neutral colours (L > 95, L < 20, or
  chroma √(a²+b²) < 12: whites, shadows, greys) count as on-palette. `share` is a fraction of
  the whole image (0 to 1). Off-palette share > 35% → `fail`, > 15% → `warn`, else `pass`.
  `details`: `{"colors": [{"hex", "share", "nearest", "delta_e", "on_palette", "neutral"}]}`.
  Hex values are compared case-insensitively. An empty kit palette gives `warn`.
- **copy_style** (deterministic): the version `alt_text` plus asset `description`. `warn` when
  the copy contains `!` or a word of 4+ letters in all caps, or when there is no copy;
  otherwise `pass`.
- `overall` is the worst rule status. `score` = 100 − 30 per fail − 10 per warn, minimum 0.
- `tone_of_voice`, `fonts` and `logo_rules` are stored in the kit for people to follow; no rule
  evaluates them.

---

## campaigns (:8086, Python / Flask)

Owns `campaigns.db`.

Deliverable: `{"id", "campaign_id", "asset_id", "channel", "created_at"}`. `channel` is a
renditions preset id.

Campaign:

```json
{"id": 1, "workspace_id": 1, "name": "Trailhead Fall 2026", "brief": "…",
 "due_date": "2026-11-02", "status": "draft"|"published", "created_by": 5,
 "created_at": "…", "published_at": null, "deliverables": [Deliverable]}
```

| Route | Auth | Body | Response |
|---|---|---|---|
| `GET /campaigns` | JWT | | `200 {"items": [Campaign]}` |
| `POST /campaigns` | JWT | `{"name", "brief", "due_date"}` | `201 Campaign` |
| `GET /campaigns/{id}` | JWT | | `200 Campaign` |
| `POST /campaigns/{id}/deliverables` | JWT | `{"asset_id", "channel"}` | `201 Deliverable`. 409 on duplicate (asset, channel). 409 if published. |
| `DELETE /campaigns/{id}/deliverables/{deliverable_id}` | JWT | | `204`. 409 if published. |
| `GET /campaigns/{id}/readiness` | JWT | | `200 Readiness` |
| `POST /campaigns/{id}/publish` | JWT | | `200 Campaign` with a `manifest` field (Manifest); `409 {"error", "readiness": Readiness}` if not ready |
| `GET /campaigns/{id}/manifest` | JWT | | `200 Manifest` or 404 if not published |

Readiness:

```json
{"campaign_id": 1, "ready": false, "total": 6, "ready_count": 5,
 "deliverables": [{"deliverable_id": 3, "asset_id": 7, "asset_title": "Ridge Jacket hero",
   "channel": "story", "review_status": "approved"|"in_review"|"changes_requested"|"none",
   "approved_version": 2, "brand_status": "pass"|"warn"|"fail"|"none",
   "rendition_url": "/blobs/<sha>", "rights_cleared": true, "ready": true, "blockers": []}]}
```

`approved_version` and `rendition_url` are `null` when there is no approved version or no
rendition. A deliverable is ready when the asset has an `approved` review, the approved version's
latest brand-check is `pass` or `warn`, the approved version has a rendition for the
channel, and rights clears the asset for the channel today (`GET {RIGHTS_URL}/rights/{asset_id}/clearance`).
`blockers` lists human-readable reasons otherwise ("No approved review", "Brand check failed",
"Brand check not run", "Rendition missing for story", plus the rights `reasons` verbatim).

Manifest: `{"campaign_id", "name", "published_at", "items": [{"asset_id", "asset_title", "version", "channel", "rendition_url", "width", "height"}]}`.

---

## rights (:8087, Java 11 / Spring Boot 2.7)

Owns `rights.db`: one usage-rights record per asset. Tracks whether the brand may use an asset,
on which channels, until when, and whether a model release is needed and on file.

Rights record:

```json
{"asset_id": 7, "workspace_id": 1, "license_type": "owned"|"licensed"|"ugc",
 "licensor": "Northwind in-house studio", "channels": ["all"],
 "valid_from": "2026-01-01", "expires_on": "2027-06-30",
 "model_release_required": true, "model_release_on_file": true,
 "notes": "", "updated_by": 5, "updated_at": "…"}
```

- `channels` holds renditions preset ids, or the single value `"all"`.
- `expires_on` is `null` for perpetual rights. Dates are `YYYY-MM-DD`.

| Route | Auth | Body / query | Response |
|---|---|---|---|
| `GET /rights` | JWT or internal | `?asset_id=` (optional) | `200 {"items": [Rights]}` (caller's workspace; all with internal token) |
| `GET /rights/{asset_id}` | JWT or internal | | `200 Rights` or 404 |
| `PUT /rights/{asset_id}` | JWT, role `designer` or `brand_admin` | Rights fields except `asset_id`, `workspace_id`, `updated_by`, `updated_at` | `200 Rights`. Creates or replaces. Reads the asset from assets (internal token) to check it exists and to set `workspace_id`; 404 if not. 400 on invalid dates, `expires_on` before `valid_from`, unknown `license_type`, empty `channels`, or `model_release_on_file` true while not required. |
| `GET /rights/{asset_id}/clearance` | JWT or internal | `?channel=` (required), `?date=` (default today, UTC) | `200 {"asset_id", "channel", "date", "cleared": bool, "reasons": [str]}` |

Clearance reasons, in this order, all that apply:

- `"No usage rights on file"` (no record; nothing else is checked)
- `"Rights start on YYYY-MM-DD"` (date before `valid_from`)
- `"License expired on YYYY-MM-DD"` (date after `expires_on`)
- `"Not licensed for <channel>"` (channel not listed and `channels` is not `["all"]`)
- `"Model release missing"` (required and not on file)

`cleared` is true when `reasons` is empty.

