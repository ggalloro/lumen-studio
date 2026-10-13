# brand-check

Python / FastAPI service on port 8085. Owns `brand.db`: one brand kit per workspace and the
brand check reports. On startup, if there is no brand kit, it creates an empty kit for
workspace 1.

A check reads the asset and version from the assets service (internal token), downloads the
original blob and runs two rules:

- `palette`: up to 6 dominant colours are extracted with Pillow (median cut quantize on a
  copy downscaled to 128 px) and compared to the kit palette with CIE76 ΔE in Lab. A colour
  is on-palette when ΔE to the nearest kit colour is at most `palette_tolerance`. Neutral
  colours (L > 95, L < 20, or chroma below 12) count as on-palette. Shares are fractions of
  the whole image. Off-palette share above 35% fails, above 15% warns. If the kit has no
  palette colours the rule warns.
- `copy_style`: the version `alt_text` plus the asset `description`. Warns on exclamation
  marks and on words of 4 or more letters in all caps, and when there is no copy.

The kit's `tone_of_voice`, `fonts` and `logo_rules` are stored and shown in the UI for people
to follow; no rule evaluates them.

`overall` is the worst rule status. `score` is 100 minus 30 per fail and 10 per warn,
minimum 0.

## Routes

See the brand-check section of [`docs/api.md`](../docs/api.md) for request and response shapes.

| Route | Auth |
|---|---|
| `GET /health` | none |
| `GET /brand-kit` | JWT or internal token |
| `PUT /brand-kit` | JWT, role `brand_admin` |
| `POST /checks` | JWT or internal token |
| `GET /checks?asset_id=&version=` | JWT or internal token |
| `GET /checks/latest?asset_id=&version=` | JWT or internal token |

`GET /brand-kit` returns the caller's workspace kit. With the internal token it returns
workspace 1, or the workspace given by an optional `?workspace_id=` query parameter.
`PUT /brand-kit` accepts any subset of the kit fields; omitted fields keep their value.

## Configuration

| Variable | Default |
|---|---|
| `PORT` | `8085` (used by the Docker image) |
| `TOKEN_SECRET` | `dev-secret-change-me` |
| `INTERNAL_TOKEN` | `dev-internal-token` |
| `DATA_DIR` | `./data`, relative to this directory; created if missing |
| `ASSETS_URL` | `http://localhost:8082` |

## Run locally

From the repository root, create the shared virtual environment once:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

Then, from this directory:

```sh
../.venv/bin/uvicorn app.main:app --port 8085
```

## Test

From this directory:

```sh
../.venv/bin/python -m pytest
```

Tests mock the assets service, so they need no network access.

## Docker

```sh
docker build -t lumen-brand-check .
docker run -p 8085:8085 lumen-brand-check
```

The image stores the database in `/data`. Mount a volume there to keep it.
