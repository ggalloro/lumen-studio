# renditions

Go service that turns an asset version into one JPEG per channel preset and registers each
result with the assets service. It is stateless: jobs live in memory and are lost on restart.

Contract: [`../docs/api.md`](../docs/api.md#renditions-8083-go).

## How it works

1. assets calls `POST /internal/jobs` with `{"asset_id", "version", "blob_url"}` after it
   stores a new version. The service replies `202` with a `job_id` and queues the job.
2. A worker downloads `blob_url` (absolute, or a path resolved against `ASSETS_URL`),
   decodes the PNG or JPEG, and renders every preset in `presets.go`.
3. Each rendition is encoded as JPEG at quality 85 and uploaded as multipart to
   `POST {ASSETS_URL}/internal/renditions` with the fields `asset_id`, `version`, `preset`,
   `width`, `height` and `file`.
4. `GET /internal/jobs/{job_id}` reports `queued`, `running`, `done` or `failed`, plus the
   presets uploaded so far. If any preset fails, the remaining presets are still attempted
   and the job ends as `failed` with the collected errors.

Presets are defined in one table in `presets.go`. `fill` scales the image to cover the box
and crops at the preset anchor. `fit` scales the image to fit inside the box.

## Routes

| Route | Auth |
|---|---|
| `GET /health` | none |
| `GET /presets` | none |
| `POST /internal/jobs` | `X-Internal-Token` |
| `GET /internal/jobs/{job_id}` | `X-Internal-Token` |

## Configuration

| Variable | Default |
|---|---|
| `PORT` | `8083` |
| `INTERNAL_TOKEN` | `dev-internal-token` |
| `ASSETS_URL` | `http://localhost:8082` |

## Development

Requires Go 1.24 or later.

```sh
go run .            # start on :8083
go test ./...       # unit and HTTP tests
go build -o renditions .
```

Queue a job by hand against a running assets service:

```sh
curl -s -X POST localhost:8083/internal/jobs \
  -H 'X-Internal-Token: dev-internal-token' \
  -H 'Content-Type: application/json' \
  -d '{"asset_id": 1, "version": 1, "blob_url": "http://localhost:8082/blobs/<sha256>"}'
```

## Docker

```sh
docker build -t lumen-renditions .
docker run --rm -p 8083:8083 -e ASSETS_URL=http://assets:8082 lumen-renditions
```
