# EduSphere backend — LavaLust (PHP) API

EduSphere's JSON REST API, built on **LavaLust v4** (https://github.com/ronmarasigan/LavaLust). No views — every controller returns the standard JSON envelope. Deployed on Render via the included Dockerfile; data lives in MySQL on Aiven.

```json
{ "success": true, "message": "…", "data": { }, "errors": null }
```

## What this repo is

This directory is a complete LavaLust 4.7.0 project, cloned from commit `74045f12bafcbd41b08b6f581706d683b729c768`. EduSphere's application code lives inside LavaLust's `app/` folders; the framework's `scheme/`, `public/`, `runtime/`, and `console/` remain in their standard locations. The Aiven CA verification setting is applied directly in the framework's PDO connection code and is enabled only when `DB_SSL_CA` is set.

## Structure

```
scheme/                        → LavaLust core framework and database layer
public/index.php               → framework front controller / web document root
runtime/                       → framework runtime data (writable)
console/                       → framework CLI support
app/config/                    → framework configuration + EduSphere routes/database/autoload
app/controllers/               → EduSphere API controllers
app/models/                    → LavaLust models + EduSphere data models
app/libraries/                 → framework libraries + EduSphere JWT, engines, and integrations
app/helpers/                   → framework helpers + EduSphere API helper
app/kernel|language|middlewares|modules|views|migrations/ → LavaLust extensions and remaining app folders
database/schema.sql · seed.sql · NAVICAT.md → EduSphere data setup
```

## Framework conformance (audited against the cloned kernel)

| Area | Convention checked | Status |
|---|---|---|
| Controllers | `*Controller.php` classes extend LavaLust's auto-loaded `MY_Controller`; shared `before_action()` uses LavaLust CORS | conformed |
| Models | `app/models/X_model.php`, `class X_model extends Model`, loaded via `$this->call->model('X_model')` | conformed (added this pass — SQL now lives in models, not controllers) |
| Routes | `app/config/routes.php`, `$router->get/post/patch`, `{param}` placeholders | conformed |
| Loader | `app/config/autoload.php` loads `database` library + `api` helper; controllers never re-`helper()` the same file | conformed |
| Requests / responses | JSON, bearer tokens, IPs, webhook headers, and response emission use LavaLust `Request` / `Response` APIs; the existing `{success,message,data,errors}` envelope is preserved | conformed |
| CORS | `ALLOWED_ORIGINS` populates LavaLust's `security_headers.cors` allow-list; API controllers invoke the framework `handle_cors()` helper | conformed |
| Database | `$this->call->database()` in controllers, `load_class('database','database')::instance()` in models; LavaLust query-builder methods for straightforward reads and CRUD, prepared `raw($sql, $args)` where joins, aggregates, or database-specific expressions are not cleanly represented by the builder; Aiven TLS is added conditionally at the PDO options boundary | conforms with narrow driver patch |
| Libraries | `app/libraries/*` plain classes loaded via `$this->call->library()` (JWT, engines, clients) | conformed |
| Views | unused by design — JSON envelope via kernel Response header pattern | n/a (API-only) |

## Run locally

1. From this directory, copy `.env.example` to `.env` and fill in DB + JWT values. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_FROM_ADDRESS`, and `MAIL_FROM_NAME` for email delivery. Use `tls` for STARTTLS, `ssl` for implicit TLS, or `none` for unencrypted SMTP. Supply the Aiven CA file to the container and set `DB_SSL_CA` to its in-container path when connecting to Aiven.
2. Build and start the LavaLust API from the `backend/` directory:

   ```bash
   docker build -t edusphere-api .
   docker run --rm --env-file .env --mount "type=bind,source=C:\path\to\ca.pem,target=/run/secrets/aiven-ca.pem,readonly" -p 8080:80 edusphere-api
   ```

3. Check `http://localhost:8080/api/v1/health`.

The Docker build uses the LavaLust framework already present in this directory; it no longer downloads or overlays framework files during the build. Omit the CA mount for a local database and leave `DB_SSL_CA` unset. Do not copy `.env` into an image or commit it.

## Demo accounts (seeded): `aria@edusphere.dev` · `instructor@edusphere.dev` · `admin@edusphere.dev` — all `password123`. Verify demo credential: `GET /api/v1/verify/EDU-7Q4M-92XT`.

## Aiven SSL

When `DB_SSL_CA` points to Aiven's CA certificate, the LavaLust PDO connection verifies the server certificate. This setting is conditional and does not enable TLS options for local databases that do not provide a CA path.

## Render deploy

`render.yaml` is a blueprint for one Docker web service. The Dockerfile builds this complete LavaLust project, enables `mod_rewrite` for LavaLust's `public/index.php`, installs `pdo_mysql`, and honors Render's `PORT`. Set `DB_SSL_CA` to the mounted path of Aiven's CA certificate. Health check: `/api/v1/health`.

## Frontend integration and current scope

The Next.js frontend can be pointed at this API by setting `NEXT_PUBLIC_API_BASE_URL` (for local Docker, `http://localhost:8080`) and adding the frontend origin to `ALLOWED_ORIGINS`. Leave that variable blank to continue using the existing Next.js API routes.

Set `JWT_SECRET` to at least 32 random characters before using sign-in or registration. The API intentionally has no built-in development signing key.

This is a **partial backend port**, not yet a drop-in replacement for all 42 Next.js API route files. The LavaLust routes currently cover authentication, catalog/lessons, placement and learning paths, exercises/playground, submissions and peer review, analytics, credentials, sessions, notifications, payments, uploads, and admin users. Course authoring/enrollment/materials/final assessments and coding-assignment authoring/attempt APIs still need migration. Keep the Next.js API routes until those flows have equivalent LavaLust endpoints and are verified; deleting them now would break existing screens.

Set `ALLOWED_ORIGINS` to the exact deployed frontend origin(s). The API uses bearer access tokens and the same JSON response envelope as the Next.js API.

## Testing (3 canonical flows)

1. **Placement → path**: `POST /api/v1/auth/register` → `GET /api/v1/assessments/placement` → `POST /api/v1/assessments/placement/submit` → `GET /api/v1/learning-path`. Submitting re-sequences items by skill gap; response includes `skillGaps` and earned badges.
2. **Code → results**: configure a private `JUDGE0_URL`, then `POST /api/v1/playground/run` with Two Sum. Exercise tests run through Judge0. Free runs send source and stdin for JavaScript (63), Python (71), C (50), C++ (54), or C# (51), and award no XP. This API intentionally has no local host-process execution fallback.
3. **Assignment → anonymous review**: `POST /api/v1/submissions` (kind=assignment) assigns 3 least-loaded reviewers (never self, never dupes). Reviewer: `GET /api/v1/peer-review/queue` (aliases only) → `POST /api/v1/peer-review/submit`. Author: `GET /api/v1/peer-review/feedback` (reviewer aliases, never IDs).
