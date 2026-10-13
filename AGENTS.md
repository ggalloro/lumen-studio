# AGENTS.md

Guidance for anyone changing this repository, human or agent. Read [README.md](README.md) for
the architecture and [docs/api.md](docs/api.md) for the contracts.

## Ground rules

- **Database per service.** A service only opens its own SQLite file under `$DATA_DIR`. To read
  another service's data, call its HTTP API.
- **Contracts first.** Any change to a route, field, status code or auth rule updates
  `docs/api.md` in the same change, plus every caller (backend and `studio-web/src/api/`).
- **Auth.** User calls carry the identity JWT (`Authorization: Bearer`). Service-to-service calls
  carry `X-Internal-Token`. Routes under `/internal/*` accept only the internal token.
- **No shared code between services.** Small helpers (auth, HTTP clients) are duplicated per
  service so each one builds and deploys on its own.
- **rights runs on Java 11 and Spring Boot 2.7.** Build and test it with `JAVA_HOME` pointing at a
  Java 11 JDK. Keep it on that stack unless a task is about changing it.
- **Synthetic data only.** No real people, brands or credentials in seed data or tests.

## Where things live

| Change | Look in |
|---|---|
| Channel presets (sizes, crop mode, anchor) | `renditions/presets.go` |
| Upload validation, blob download headers | `assets/src/main/java/studio/lumen/assets/` |
| Review state machine, four-eyes rule, SSE | `review/src/routes/reviews.ts`, `review/src/events.ts` |
| Brand rules (palette, copy style) | `brand-check/app/palette.py`, `brand-check/app/copy_rules.py`, `brand-check/app/checks.py` |
| Readiness and publish rules | `campaigns/app/` |
| Usage rights and clearance | `rights/src/main/java/studio/lumen/rights/` |
| UI pages / API clients | `studio-web/src/pages/`, `studio-web/src/api/` |
| Seed data | `seed/catalog.json`, `seed.py` |

## Run, test, verify

```bash
make setup                 # once
make dev                   # all services; or run each service's command from Procfile.dev
make seed                  # sample data, needs empty databases (make reset first)
make test                  # unit tests, all services
```

Per service:

| Service | Test | Notes |
|---|---|---|
| identity, brand-check, campaigns | `cd <svc> && ../.venv/bin/python -m pytest` | |
| assets | `cd assets && ./mvnw -q test` | After code changes run `make build` and restart the service. |
| renditions | `cd renditions && go test ./...` | |
| rights | `cd rights && JAVA_HOME=<java 11 jdk> ./mvnw -q test` | After code changes run `make build` and restart the service. |
| review | `cd review && npm test && npm run typecheck` | |
| studio-web | `cd studio-web && npm test && npm run typecheck` | |

Before opening a PR:

1. Unit tests pass for every service you touched.
2. Bug fixes include a test that fails without the fix.
3. UI changes are checked in a browser against the seeded stack, at desktop and narrow widths.
4. `docs/api.md` matches the code.

## Style

- Python: type hints, standard library first, `httpx` for HTTP.
- Java: constructor injection, `JdbcTemplate`, snake_case JSON through Jackson config.
- Go: standard library `net/http`, errors wrapped with context.
- TypeScript: strict mode, ESM, zod (review) for validation, React Spectrum components in the UI.
- Errors returned as `{"error": "<message>"}` with the matching HTTP status.
