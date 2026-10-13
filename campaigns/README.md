# campaigns

Python / Flask service on port 8086. Owns `campaigns.db`: campaigns, their deliverables
(asset plus channel, where the channel is a renditions preset id) and the manifest written
when a campaign is published.

Readiness is computed on request. For each deliverable the service calls, with the internal
token:

- assets `GET /assets/{id}` for the title and the renditions of each version,
- review `GET /reviews?asset_id=` for the review status,
- brand-check `GET /checks/latest?asset_id=&version=` for the approved version's report,
- rights `GET /rights/{asset_id}/clearance?channel=` to check that the asset may be used on
  the deliverable's channel today.

A deliverable is ready when the asset has an approved review, the latest brand check of the
approved version is `pass` or `warn`, the approved version has a rendition for the
deliverable's channel, and rights clears the asset for that channel. When rights does not
clear it, the reasons returned by the rights service are added to the deliverable's
`blockers` as they are, and `rights_cleared` is `false`. Clearance is checked even when there
is no approved review. If an asset has several approved reviews, the one on the highest
version is used. A campaign is ready, and can be published, when it has at least one
deliverable and all of them are ready. If one of the upstream services cannot be reached,
readiness and publish return 502.

## Routes

See the campaigns section of [`docs/api.md`](../docs/api.md) for request and response shapes.
All routes except `/health` require a user JWT and only see campaigns in the caller's
workspace.

| Route | Notes |
|---|---|
| `GET /health` | no auth |
| `GET /campaigns` | newest first |
| `POST /campaigns` | `name` required, `due_date` as `YYYY-MM-DD` |
| `GET /campaigns/{id}` | |
| `POST /campaigns/{id}/deliverables` | checks the asset exists in the caller's workspace; 409 on duplicate or if published |
| `DELETE /campaigns/{id}/deliverables/{deliverable_id}` | 409 if published |
| `GET /campaigns/{id}/readiness` | |
| `POST /campaigns/{id}/publish` | 409 with readiness if not ready, 409 if already published |
| `GET /campaigns/{id}/manifest` | 404 until published |

## Configuration

| Variable | Default |
|---|---|
| `PORT` | `8086` (used by the Docker image) |
| `TOKEN_SECRET` | `dev-secret-change-me` |
| `INTERNAL_TOKEN` | `dev-internal-token` |
| `DATA_DIR` | `./data`, relative to this directory; created if missing |
| `ASSETS_URL` | `http://localhost:8082` |
| `REVIEW_URL` | `http://localhost:8084` |
| `BRAND_URL` | `http://localhost:8085` |
| `RIGHTS_URL` | `http://localhost:8087` |

## Run locally

From the repository root, create the shared virtual environment once:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

Then, from this directory:

```sh
../.venv/bin/flask --app app run --port 8086
```

## Test

From this directory:

```sh
../.venv/bin/python -m pytest
```

Tests mock the assets, review, brand-check and rights services with respx.

## Docker

The image runs the app with gunicorn.

```sh
docker build -t lumen-campaigns .
docker run -p 8086:8086 lumen-campaigns
```

The image stores the database in `/data`. Mount a volume there to keep it.
