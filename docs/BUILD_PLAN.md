# Digital Wealth Partners — Rewrite Plan (Claude Code, Phased)

> **⚠️ Abandoned as of Phase 0c.** This was a plan to rewrite the Lovable-built TanStack Start + Supabase app as a Next.js + Express + Prisma monorepo. Phases 0 and 0b (below) built that rewrite; Phase 0c reversed it — `/frontend` is now the original TanStack Start + Supabase app directly, and `/backend` (Express/Prisma) sits scaffolded but unused. This file is kept as a historical record and to explain why `/backend` exists; it is **not** an active plan to keep following. See [CLAUDE.md](../CLAUDE.md) and [README.md](../README.md) for the current state, and `docs/DESIGN_SYSTEM.md` for the frontend's design system.

Original framing, for context on Phases 0/0b below: stack locked in was Next.js (App Router, TypeScript) frontend + Express (TypeScript) backend + Prisma + Postgres, in one monorepo, auth via httpOnly/Secure/SameSite=strict JWT cookies + CSRF. Local dev: Docker runs Postgres only; frontend and backend run natively via pnpm.

## How to use this

Run each phase as its own Claude Code session/prompt, in order. Review and test what it produced (there's a checklist at the end of each phase) before starting the next one — don't chain them blind. If a phase is too large for one session, tell Claude Code to stop after a specific step and pick up the rest as "Phase Na". This file lives at `/docs/BUILD_PLAN.md` so each new Claude Code session can be pointed at it for context.

## Phase 0 — Monorepo scaffold, Docker Postgres, environment (done)

Set up a new monorepo for a crypto brokerage platform rewrite. Structure:

```
/frontend   — Next.js 14+ App Router, TypeScript, Tailwind CSS, shadcn/ui
/backend    — Express, TypeScript, Prisma ORM
/docker-compose.yml — Postgres 16 only (name the service "db", persist data to a
              named volume, expose 5432, set POSTGRES_USER/PASSWORD/DB from a
              root .env file). Do NOT containerize the frontend or backend —
              they run natively via pnpm for local development.
```

Root-level:

- pnpm workspace (`pnpm-workspace.yaml`) covering `/frontend` and `/backend`
- `.env.example` at root AND in `/backend` documenting every required variable (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `CSRF_SECRET`, `NODE_ENV`, `PORT`, `FRONTEND_ORIGIN`, etc.) — never commit real secrets, `.env` is gitignored
- A root `README.md` explaining: how to run `docker compose up -d db`, how to run backend (`pnpm --filter backend dev`) and frontend (`pnpm --filter frontend dev`) natively, how to run Prisma migrations, and the overall architecture (frontend never talks to Postgres directly, only through the backend API)
- ESLint + Prettier configured consistently across both packages
- `.gitignore` covering node_modules, .env, build output, etc.

In `/backend`, initialize Prisma pointed at the Docker Postgres instance via `DATABASE_URL`, and set up a basic Express app with a `/health` endpoint that checks DB connectivity. Add security baseline middleware now (expanded in a later phase): `helmet()`, disable the `X-Powered-By` header, `cookie-parser`, and `cors()` locked to `FRONTEND_ORIGIN` with `credentials: true`.

In `/frontend`, initialize a bare Next.js App Router project with Tailwind and shadcn/ui installed and configured, a placeholder home page, and an API client module (`/lib/api.ts`) using `fetch` with `credentials: 'include'` by default, pointed at an `NEXT_PUBLIC_API_URL` env var.

No business logic in this phase — scaffolding only.

**Checklist before moving on:**
- [x] `docker compose up -d db` works — published on host port **55432**, not 5432 (a native Postgres service already owned 5432 on the dev machine; see root `.env`/`docker-compose.yml`)
- [x] `pnpm --filter backend dev` starts and `/health` shows DB connected (`{"status":"ok","dbConnected":true}`)
- [x] `pnpm --filter frontend dev` renders the placeholder page
- [x] `.env.example` has everything needed with no real secrets committed (root `.env` and `backend/.env` hold real *local-dev-only* generated secrets and are gitignored)

## Phase 0b — Frontend-first rescope, legacy design audit (done)

Rescope after Phase 0: build out the frontend side only for now. `/backend` (Express/Prisma/Docker Postgres) from Phase 0 was left running and wired as-is — this phase didn't touch it, it just stopped being the active focus.

```
/frontend        — Next.js 14+ App Router, TypeScript (to be populated by
                    porting /frontend-legacy in a later phase)
/frontend-legacy — the existing Lovable-built React + Vite project (moved
                    from /legacy to this path), DO NOT MODIFY, read-only reference
```

What changed vs. Phase 0:

- `/legacy` renamed to `/frontend-legacy` (same content, no other changes).
- `/frontend` was **wiped and rescaffolded** — Phase 0's shadcn init had used the CLI's current default preset (`base-nova`, `@base-ui/react` primitives), which doesn't match `/frontend-legacy`'s `new-york` + Radix setup. Rescaffolded with `create-next-app` (App Router, TS, Tailwind v4) + `shadcn@2 init -b slate -d` (the classic CLI — `shadcn@latest` no longer supports the `new-york`/base-color config model at all, see CLAUDE.md), then dependencies were hand-matched to `frontend-legacy/package.json` at the same/compatible versions (all Radix primitives, cva, clsx, cmdk, date-fns, embla-carousel-react, input-otp, lucide-react, qrcode, react-day-picker, react-hook-form + resolvers, react-resizable-panels, recharts, sonner, tailwind-merge, tw-animate-css, vaul, zod — everything UI/icon/animation-related; TanStack/Supabase/Lovable packages excluded since those are data-layer, not UI, and out of scope until a later phase).
- Root `pnpm-workspace.yaml` still covers both `/frontend` and `/backend` (left wired, per the "leave everything running" decision above) rather than dropping `/backend` from it.
- `docs/DESIGN_SYSTEM.md` was written: a full audit of `/frontend-legacy`'s Tailwind theme, global CSS/animations, every reusable component (site-specific + shadcn/ui primitives), the full page inventory, common UI/data patterns, and the asset inventory. This is what later frontend phases port from and what new screens must visually match — **read it before porting any page/component**.
- The actual Tailwind theme (colors, fonts, custom utilities) and component/page files were **not** ported into `/frontend` in this phase — only dependencies + matching `components.json` config. Theme/component porting is later-phase work driven by `docs/DESIGN_SYSTEM.md`.

**Checklist before moving on:**
- [x] `/frontend` loads a placeholder page (`pnpm --filter frontend dev` → `http://localhost:3000`, renders "Digital Wealth Partners")
- [x] `pnpm --filter frontend lint` passes
- [x] `docs/DESIGN_SYSTEM.md` written and spot-checked against `/frontend-legacy`'s homepage, dashboard wallets page, and dashboard layout (nav items, sidebar behavior, KYC banner, Deposit/Withdraw dialogs, Convert panel all confirmed against source)

## Phase 0c — Reverse the rewrite: /frontend-legacy becomes /frontend (done)

Instruction received: delete `/frontend` (the Next.js rescaffold from Phase 0b) and rename `/frontend-legacy` back to `/frontend`. Net effect: the Next.js rewrite is abandoned; the original Lovable/TanStack Start/Supabase app is now simply "the frontend," folded properly into the pnpm workspace instead of sitting as a separate reference copy.

What changed:

- `/frontend` (Next.js) deleted. `/frontend-legacy` renamed to `/frontend`.
- Folded fully into the pnpm workspace (explicit choice over leaving it on bun): removed `bun.lock`, `bunfig.toml`, `package-lock.json`; renamed `package.json`'s `name` to `frontend` so `pnpm --filter frontend` resolves it; ran `pnpm install` at root to bring its dependencies into the shared `pnpm-lock.yaml`. `docs/DESIGN_SYSTEM.md` §1 dependency-matching notes are now moot (there's only one frontend), but the doc itself remains accurate as a design system reference and wasn't rewritten line-by-line — only path references (`/frontend-legacy` → `/frontend`) and the porting framing were updated.
- Consolidated per-package config that duplicated the root: removed `frontend/.prettierrc` (byte-identical to root's), merged `frontend/.gitignore`'s extra patterns (`dist-ssr`, `.output`, `.vinxi`, `.tanstack/**`, `.nitro`, `*.local`, `.wrangler/`, `.dev.vars`, `routeTree.gen.ts`) into the root `.gitignore` and removed the nested one, same for `.prettierignore`. `frontend/eslint.config.js` was kept as its own file (genuinely different rules from `/backend`'s — React/Vite-specific).
- Removed `frontend/CLAUDE.md` (root `CLAUDE.md` now describes `/frontend`'s architecture directly instead of via a nested duplicate). Kept `frontend/AGENTS.md` (the Lovable-sync warning — now directly relevant since this is the actively-developed, Lovable-connected app) and `frontend/README.md` (the original product brief — genuine content, not duplicated elsewhere).
- Fixing lint after the `pnpm install`/config move surfaced one real issue: every file in the app used CRLF line endings, which the shared Prettier config (LF) flagged as a few thousand line-ending diffs. Not a content problem — fixed with one `eslint --fix` pass across `/frontend`.
- Rewrote root `CLAUDE.md` and `README.md` to describe `/frontend` as the real TanStack Start + Supabase app (routing, auth, data layer, database, design system, Lovable-sync caution) rather than a Next.js target; `/backend` is now documented as scaffolded-but-dormant rather than "current focus."

**Checklist before moving on:**
- [x] `pnpm install` at root succeeds with `/frontend` as a proper pnpm workspace member (no bun/npm lockfiles left)
- [x] `pnpm --filter frontend lint` passes (0 errors; 9 pre-existing `react-refresh/only-export-components` warnings from stock shadcn files, not addressed — cosmetic, not this phase's concern)
- [x] `pnpm --filter frontend dev` serves the real app on `http://localhost:8080` (TanStack Start's own port, not 3000) and the homepage renders

## Future work

Not tracked as phases in this file anymore — the phased-rewrite structure ended with the Phase 0c reversal above. Treat `/frontend` as a normal, directly-developed app going forward; `/backend` stays dormant until a task explicitly says otherwise.
