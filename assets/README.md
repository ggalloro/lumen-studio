# assets

Spring Boot service (Java 21) on port 8082. It owns asset metadata, versions, tags and
rendition records in SQLite (`$DATA_DIR/assets.db`) and stores files content-addressed under
`$DATA_DIR/blobs/<sha256>`. The HTTP contract is in [`../docs/api.md`](../docs/api.md).

Uploads accept PNG and JPEG up to 25 MB. The declared content type must match the file's
magic bytes. After a version is stored, the service asks renditions to render it
(`POST {RENDITIONS_URL}/internal/jobs`, 3 attempts with backoff, off the request thread).
A failed webhook is logged and does not fail the upload.

The schema is created on startup from `src/main/resources/schema.sql`.

## Run

Requires JDK 21 or newer. The Maven wrapper downloads Maven on first use.

```sh
./mvnw spring-boot:run
```

Or build the jar once and run it:

```sh
./mvnw -q -DskipTests package
java -jar target/assets.jar
```

Docker:

```sh
docker build -t lumen-assets .
docker run -p 8082:8082 -v assets-data:/data lumen-assets
```

## Test

```sh
./mvnw -q test
```

Tests use a temporary `DATA_DIR` and a mocked renditions webhook.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8082` | HTTP port |
| `DATA_DIR` | `./data` | SQLite database and blob directory |
| `TOKEN_SECRET` | `dev-secret-change-me` | HS256 key for user JWTs issued by identity |
| `INTERNAL_TOKEN` | `dev-internal-token` | Expected `X-Internal-Token` value |
| `RENDITIONS_URL` | `http://localhost:8083` | Target of the rendition webhook |
| `ASSETS_SELF_URL` | `http://localhost:8082` | Base URL used in `blob_url` sent to renditions |
