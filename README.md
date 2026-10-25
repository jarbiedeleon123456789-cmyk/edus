# EduSphere

Adaptive learning and skills evaluation platform: placement-tested learning paths, a code playground with real test cases, anonymous peer review, XP/badges/certificates with public verification, and live-session links.

The project is organized into `frontend/` for the Next.js application and `backend/` for the PHP/LavaLust API. The Next.js app includes its own API routes and MySQL/Drizzle data layer and remains the default. The PHP API is a partial port; the frontend can opt into it with `NEXT_PUBLIC_API_BASE_URL`, but keep the Next.js API routes until the remaining course and assignment flows have been ported and verified.

> A note on scope: payment (Stripe), email (SMTP), execution (Judge0), and storage (S3/R2) integrations are env-driven. Password registration requires working SMTP because users must verify their email before signing in. In-app notifications are also emailed to verified users. JavaScript runs in a local `vm` sandbox; uploads without storage credentials only register metadata.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS 4
- LavaLust 4.7.0 PHP MVC API in `backend/` (in-progress backend migration)
- Aiven MySQL + Drizzle ORM (snake_case DDL, FKs, unique indexes)
- `jose` JWT (15-min access + 30-day rotating refresh, hashed at rest)
- `bcryptjs` password hashing, `zod` input validation on every mutating route
- `@monaco-editor/react`, `framer-motion`, `lucide-react`, `canvas-confetti`, `zustand`

## Run it

Set the Aiven values in `frontend/.env` (see `frontend/.env.example`). For a new, empty database, import `backend/database/schema.sql` and then run the TypeScript demo seed once. Do not import the schema or seed into the shared database again; it is already initialized.

```bash
cd frontend
npm install
npx tsx src/db/seed.ts           # only for a new, empty database
npm run dev                      # or: npm run build && npm run start
```

Do not run schema pushes or seeds against the shared Aiven database; schema pushes can alter tables and the seed is not intended for an existing database.

For an existing database, apply the additive migration `backend/database/migrations/004_profile_email_verification.sql` before using profile persistence and password-email verification. It adds profile fields, preserves existing accounts as verified, and creates the one-time verification-code table. Do not run Drizzle schema push against the shared database.

Email configuration is split by application: set SMTP values in `frontend/.env.local` for Next.js verification and notification emails. If using the PHP API, configure `backend/.env`; that service uses `MAIL_FROM_ADDRESS` and `MAIL_FROM_NAME` instead of `MAIL_FROM`. The corresponding templates are `frontend/.env.example` and `backend/.env.example`. Keep both real env files private and out of source control.

`SMTP_SECURE` accepts `tls` for STARTTLS (commonly port 587), `ssl` for implicit TLS (commonly port 465), or `none` for an unencrypted SMTP connection; when omitted, TLS is selected for ports 465 and 587. SMTP authentication is optional, but configure both username and password together when required by your provider. New password accounts receive an 8-digit code, and cannot sign in until the code is confirmed. Google accounts rely on Google's verified-email claim. Profile bio/photo and notifications are stored in MySQL; every in-app notification for a verified account is also emailed.

To add the repeatable sample assignments and final assessments to the three existing sample courses, run `npm --prefix frontend run seed:sample-courses` from the project root. This targeted seed is idempotent and does not run the full demo seed. It also adds Python, C, C++, and C# practice exercises to the playground.

### Coding classroom

Instructors can author JavaScript assignments for their own courses at `/instructor/assignments`. Each assignment includes starter code, a problem prompt, optional due date, and JSON test cases; set `"hidden": true` to keep a case private. At least one visible case is required. Assignments can be saved as drafts or published, and the instructor view reports submissions, completion, and class-average score.

Students with a learning path in the assigned course find published work at `/assignments`. They can run code without submitting, submit multiple attempts, see their score history, and continue working after the due date; late submissions are marked. The server executes the tests and does not return private test inputs or expected outputs to the browser. Assignment authoring currently supports JavaScript. The playground includes JavaScript, Python, C, C++, C#, and HTML exercises. JavaScript uses the built-in local sandbox, HTML runs in a browser preview, and Python/C/C++/C# execution requires a private Judge0 instance configured with `JUDGE0_URL` (and `JUDGE0_API_KEY` if required by that instance). Judge0 language IDs are Python 71, C 50, C# 51, and C++ 54. Compiled-language exercises receive each test input on standard input and compare the final output line with the expected result.

The classroom adds two tables. For an existing database, review and apply the additive migration `backend/database/migrations/002_coding_classroom.sql` once with the MySQL client before opening these pages. It creates new tables only and does not alter or delete existing records. Do not run Drizzle schema push against the shared database.

The playground has a **Free run** mode that executes a program without an assignment or exercise ID. JavaScript runs in the local 4-second VM sandbox. Python, C, C++, and C# run through a private Judge0 instance; set `JUDGE0_URL` and, if required, `JUDGE0_API_KEY` in `frontend/.env.local` and restart the server. Do not use a public runner for student code. Free-run code and standard input are kept in that signed-in user's browser storage; use **Reset** to restore the language template.

### Certified courses

Students browse published courses at `/courses`, enroll, complete lessons, download module resources, submit coding assignments, and take the final assessment. Instructors create courses and modules at `/instructor/courses`, add lesson content and assessment questions, and upload PDF, PowerPoint, Word, Excel, CSV, text, image, and ZIP files (up to 25 MB). Publishing requires at least one lesson, one published coding assignment, and a final assessment with at least one question.

A certificate is issued once per course only after the student completes every course lesson, passes every published coding assignment (100% on at least one attempt per assignment), and passes the final assessment (80% by default; the instructor can set 50–100%). Verification is available at `/verify/[code]`. Instructors can review the exact source saved with each coding-assignment attempt; the platform does not try to determine whether code was pasted or typed.

For an existing database, review and apply `backend/database/migrations/003_course_certificates.sql` before using the course enrollment, material, and final-assessment features. It creates the new tables and adds a unique user/course certificate constraint; do not use Drizzle schema push against the shared database.

Course files are stored privately on the application host under `.data/course-materials`, outside the public web root. This local-disk storage is appropriate for a persistent single-host deployment; ephemeral/serverless instances may discard files or fail to share them across instances. Use a persistent volume or migrate storage to S3/R2 before deploying in those environments.

### Demo accounts (seeded placeholder data)

| Role | Login | Notes |
|---|---|---|
| Student | `aria@edusphere.dev` | mid-path, streak 3, review queue waiting |
| Instructor | `instructor@edusphere.dev` | class analytics + assignment pipeline |
| Admin | `admin@edusphere.dev` | user management |

Password for all: `password123`. Public credential demo: `/verify/EDU-7Q4M-92XT`.

## Environment variables

| Var | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Aiven MySQL connection (required) |
| `DB_SSL_CA` | Path to the Aiven CA certificate; required in production to verify the server certificate |
| `NEXT_PUBLIC_API_BASE_URL` | Optional base URL for the LavaLust API; leave blank to use Next.js routes until PHP endpoint parity is complete |
| `JWT_SECRET` | HS256 secret for access/refresh tokens |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list for `/api/*` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Live Stripe checkout + webhook verification |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_FROM` | Transactional email over SMTP |
| `JUDGE0_URL`, `JUDGE0_API_KEY` | Remote code execution instead of the local sandbox |

### Google sign-in setup

Google sign-in requires a Google Cloud OAuth 2.0 **Web application** client. Configure the OAuth consent screen, add `http://localhost:3000` under **Authorized JavaScript origins**, and add `http://localhost:3000/api/v1/auth/google` under **Authorized redirect URIs**. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000` and add the client ID to both `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` in `frontend/.env.local`, then restart the dev server. Open the app as `http://localhost:3000` rather than `http://0.0.0.0:3000`. The app uses Google Identity Services redirect mode; the server validates Google’s CSRF token and signed ID token, audience, issuer, and verified Gmail address.

## API shape

Every response is the same envelope:

```json
{ "success": true, "message": "…", "data": { }, "errors": null }
```

Groups: `auth` (register/login/refresh/logout/me), `assessments/placement` (+ submit), `learning-path` (current/generate/progress), `courses`, `lessons/[id]`, `exercises`, `coding-assignments` (author/manage/list/attempt history), `playground/run` (rate-limited 30/min), `submissions`, `peer-review/{queue,submit,feedback}`, `analytics/{student,instructor,leaderboard}`, `badges`, `certificates`, `verify/[code]` (public), `sessions`, `payments/{checkout,webhook}`, `uploads/presign`, `notifications`, `admin/users`. Health: `/api/health` and `/api/v1/health`.

### LavaLust backend migration

The PHP API is a partial port of `/api/v1/*`, integrated into a complete LavaLust 4.7.0 project under `backend/`. It currently covers authentication, lessons/catalog, placement and learning paths, playground/exercises, submissions/reviews, analytics, credentials, sessions, notifications, checkout, uploads, and admin users. Course authoring/enrollment/material downloads/final assessments and coding-assignment authoring/attempt endpoints are still handled by Next.js. Do not remove the Next.js API route files until those PHP endpoints have been migrated and verified. See [backend/README.md](./backend/README.md) for local container setup and the framework directory layout.

## Canonical test flows

**1. Placement → learning path.** Sign in as a fresh student, complete `/assessment` (10 questions). The response grades MCQs exactly and short answers against an expected phrase, writes per-skill mastery rows, then re-sequences the course: each lesson's gap score is the average mastery deficit across its tagged skills, sorted weakest-first. Check `/path` — the constellation reflects the new order, and the rationale text cites your actual percentages.

**2. Code submission → results.** In `/playground`, run Two Sum with the O(n) hash-map solution: 4/4 pass including the hidden 100,000-item case (about 20ms). Run the O(n²) double loop: it passes the visible cases, then the whole run times out at 4s with a hint about why. XP only pays above your previous best, so re-running can't farm it.

**3. Assignment → anonymous peer review.** In the Orbit Loader exercise, submit for review — `assignReviewers` enqueues it to 3 least-loaded classmates, never you, never twice. As Aria, open `/review`: the queue shows `Author #2KF7N`-style aliases only. Score the rubric sliders (live total), write ≥20 chars, submit. The author gets a notification and sees you as `Reviewer #…` on `/feedback`. When all 3 land, the submission flips to `reviewed`.

## Design

"Shoreline" system: warm sand beige + deep marine blue (light default), deep-ocean dark mode via the toggle. Bricolage Grotesque (display), Instrument Sans (body), JetBrains Mono (data). Orbit/sphere constellation motif throughout; glossy pure-CSS 3D spheres and layered sliding 2D waves on the landing. Motion: 150–600ms, `cubic-bezier(.22,1,.36,1)`, `prefers-reduced-motion` honored, custom sphere loader instead of default spinners.
