# Deploying to Railway

Two services (backend, frontend) plus a Railway-managed Postgres, all built
from this one repo via the Dockerfiles at `backend/Dockerfile` and
`frontend/Dockerfile`. Both were built and smoke-tested locally with plain
`docker build`/`docker run` before being committed  see the two `railway.toml`
files for the build/healthcheck config each service uses.

This is a manual, one-time setup done in the Railway dashboard  there's no
CLI/API token available to script it from here.

## 1. Create the project and database

1. New Project → **Provision PostgreSQL**. This gives you a `DATABASE_URL`
   reference variable other services can pull from (`${{Postgres.DATABASE_URL}}`
   in Railway's variable-reference syntax).

## 2. Create the backend service

1. **New Service → GitHub Repo** → select this repo.
2. Settings → **Root Directory**: leave as the repo root (do **not** scope it
   to `backend/`)  the Dockerfile needs the workspace-root `pnpm-lock.yaml`
   and both packages' `package.json` in its build context.
3. Settings → **Build** → Builder: **Dockerfile**, Dockerfile Path:
   `backend/Dockerfile`.
4. Settings → Config-as-code → Config File Path: `backend/railway.toml`
   (healthcheck path `/health`, restart policy).
5. Variables:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the Postgres service) |
   | `JWT_ACCESS_SECRET` | `openssl rand -hex 32` |
   | `JWT_REFRESH_SECRET` | `openssl rand -hex 32` (different value than above) |
   | `COOKIE_SECRET` | `openssl rand -hex 32` |
   | `NODE_ENV` | `production` |
   | `FRONTEND_ORIGIN` | the frontend service's public URL, once generated in step 3 (e.g. `https://dwp-frontend-production.up.railway.app`)  **must be set**, not left blank (see the CORS note below) |
   | `PRICE_FEED_ENABLED` | `true` |
   | `PRICE_PROVIDER` | `coinpaprika` |
   | `PRICE_REFRESH_INTERVAL_MS` | `300000` |
   | `ADMIN_EMAIL` | the real email you'll use to log into the admin panel  see step 4 |
   | `ADMIN_PASSWORD` | a real password (not `admin1234`)  see step 4 |
6. Settings → Networking → **Generate Domain** to get a public URL.
7. Deploy. `prisma migrate deploy` runs automatically as part of the
   container's start command (`backend/Dockerfile`'s `CMD`)  it applies
   whatever migrations exist under `backend/prisma/migrations/`, safe to run
   on every deploy.

## 3. Create the frontend service

1. **New Service → GitHub Repo** → same repo again.
2. Root Directory: repo root (same reasoning as the backend).
3. Build → Builder: **Dockerfile**, Dockerfile Path: `frontend/Dockerfile`.
4. Config-as-code path: `frontend/railway.toml`.
5. Variables:
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | the backend service's public URL from step 2.6 |
   | `PORT` | leave unset  Railway injects this and the Dockerfile already reads it |

   **`NEXT_PUBLIC_API_URL` must be visible at *build* time, not just runtime.**
   Next.js inlines every `NEXT_PUBLIC_*` variable into the client JS bundle
   during `next build`  `frontend/Dockerfile` declares `ARG
   NEXT_PUBLIC_API_URL` specifically so Railway's Dockerfile builder passes
   service variables through as build args. If you set this var *after* the
   first deploy, you must trigger a fresh deploy (not just a restart) for the
   new value to actually reach the bundle.
6. Networking → Generate Domain.
7. Go back to the **backend** service's `FRONTEND_ORIGIN` variable and set it
   to this URL now if you hadn't yet, then redeploy the backend.

## 4. First-deploy only: seed the admin account

`prisma/seed.ts` creates one admin account and nothing else  it's
deliberately **not** wired into the Dockerfile's `CMD`, so it doesn't re-run
on every deploy. It reads the email/password from the `ADMIN_EMAIL` /
`ADMIN_PASSWORD` variables you set in step 2 (falling back to the demo
`admin@digitalwealth.example` / `admin1234` if you left them unset  don't
leave them unset in production). Run it once via Railway's one-off command
runner (dashboard → backend service → the "⋮" menu / Shell) against the
running service:

```
pnpm --filter backend prisma:seed
```

**To rotate the password later**, change `ADMIN_PASSWORD` in the backend
service's Variables tab and re-run the same command  the script is
idempotent and updates the existing account's password hash instead of
erroring. Changing `ADMIN_EMAIL` instead creates a *new* admin account rather
than renaming the old one (accounts are keyed by email); delete the old row
via `pnpm --filter backend prisma:studio` if you don't want both around.

Everything else (currencies, deposit addresses, customers) is created for
real through the admin panel from there, per `docs/ADMIN_GUIDE.md`.

## Cookie / CORS note

Sessions are httpOnly cookies with `sameSite: "strict"`
(`backend/src/lib/cookies.ts`), which only survive a cross-origin `fetch`
when the two origins share the same **registrable domain** (eTLD+1)  not
just when CORS allows it. Two default `*.up.railway.app` service URLs both
resolve under `railway.app`, so this works with no extra config. If you later
move to custom domains, keep the frontend and backend as sibling subdomains
of the same root domain (e.g. `app.example.com` + `api.example.com`)  if
they end up on genuinely different domains, `sameSite: "strict"` will
silently stop sending the auth cookie on cross-origin requests and every
authenticated call will 401.

Also keep `FRONTEND_ORIGIN` on the backend set to the real frontend URL in
every environment  `backend/src/app.ts`'s CORS config falls back to
allow-any-origin if it's ever unset (see the security review notes in this
conversation), so an empty value is a silent misconfiguration, not a safe
default.

## Local verification already done

Both images were built and run locally against the existing `docker compose
up -d db` Postgres before this was committed:
- `docker build -f backend/Dockerfile .` → ran the container → `prisma
  migrate deploy` applied all 5 existing migrations cleanly → `GET /health`
  returned `{"status":"ok","dbConnected":true}`.
- `docker build -f frontend/Dockerfile . --build-arg
  NEXT_PUBLIC_API_URL=http://localhost:4000` → standalone `server.js` served
  the app correctly.
