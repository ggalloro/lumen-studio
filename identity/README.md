# identity

Python / FastAPI service on port 8081. Owns `users.db`: workspaces, users and roles
(`designer`, `reviewer`, `brand_admin`). Issues the HS256 JWT that every other service
verifies with `TOKEN_SECRET`.

On startup, if the database has no users, it creates workspace 1 ("Northwind Outdoor") and the
five seed users listed in `docs/api.md`, all with password `lumen-demo`. Passwords are stored
as PBKDF2-SHA256 hashes.

## Routes

See the identity section of [`docs/api.md`](../docs/api.md) for request and response shapes.

| Route | Auth |
|---|---|
| `GET /health` | none |
| `POST /login` | none |
| `GET /me` | JWT |
| `GET /users` | JWT or internal token |
| `GET /users/{id}` | JWT or internal token |
| `GET /workspaces/{id}` | JWT or internal token |

JWT callers only see users and the workspace they belong to. Internal token callers see all.

## Configuration

| Variable | Default |
|---|---|
| `PORT` | `8081` (used by the Docker image) |
| `TOKEN_SECRET` | `dev-secret-change-me` |
| `INTERNAL_TOKEN` | `dev-internal-token` |
| `DATA_DIR` | `./data`, relative to this directory; created if missing |

## Run locally

From the repository root, create the shared virtual environment once:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

Then, from this directory:

```sh
../.venv/bin/uvicorn app.main:app --port 8081
```

## Test

From this directory:

```sh
../.venv/bin/python -m pytest
```

## Docker

```sh
docker build -t lumen-identity .
docker run -p 8081:8081 lumen-identity
```

The image stores the database in `/data`. Mount a volume there to keep it.
