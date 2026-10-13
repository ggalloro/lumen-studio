# rights

Usage rights for Lumen Studio assets. The service owns `rights.db` (SQLite, under `$DATA_DIR`)
and stores one record per asset: license type, licensor, allowed channels, validity dates, and
model release status. Campaigns and the studio UI ask it whether an asset is cleared for a
channel on a given date.

Stack: Java 11, Spring Boot 2.7.18, Maven wrapper, JdbcTemplate with SQLite.

## Routes

| Route | Auth |
|---|---|
| `GET /health` | none |
| `GET /rights` | JWT or internal token |
| `GET /rights/{asset_id}` | JWT or internal token |
| `PUT /rights/{asset_id}` | JWT, role `designer` or `brand_admin` |
| `GET /rights/{asset_id}/clearance?channel=&date=` | JWT or internal token |

JWT callers see records from their own workspace. Internal token callers see all workspaces.
`PUT` reads the asset from the assets service (`GET {ASSETS_URL}/assets/{id}` with
`X-Internal-Token`) to confirm it exists and to take its `workspace_id`.

The full contract, including validation rules and clearance reasons, is in
[../docs/api.md](../docs/api.md#rights-8087-java-11--spring-boot-27).

## Run

The build needs a Java 11 JDK. Point `JAVA_HOME` at it:

```bash
export JAVA_HOME=/path/to/jdk11
./mvnw spring-boot:run
```

Or build the jar and run it:

```bash
./mvnw -DskipTests package
$JAVA_HOME/bin/java -jar target/rights.jar
```

The service listens on port 8087 and creates `./data/rights.db` on first start.

With Docker:

```bash
docker build -t lumen-rights .
docker run -p 8087:8087 -v rights-data:/data lumen-rights
```

## Test

```bash
./mvnw -q test
```

Tests run the application with MockMvc against a temporary data directory. The assets client
and the date provider are replaced with Mockito mocks.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8087` | HTTP port |
| `TOKEN_SECRET` | `dev-secret-change-me` | HS256 secret for identity JWTs |
| `INTERNAL_TOKEN` | `dev-internal-token` | Shared token for service calls, sent and accepted as `X-Internal-Token` |
| `DATA_DIR` | `./data` | Directory for `rights.db`, created if missing |
| `ASSETS_URL` | `http://localhost:8082` | Base URL of the assets service |
