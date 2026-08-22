# Digital Wealth Partners

A crypto brokerage / digital-asset wealth-management platform: marketing site, KYC-gated customer dashboard, and (not yet built) an admin panel, for a simulated multi-currency crypto portfolio.

`/frontend` is the actively-developed app — a Lovable-built TanStack Start (Vite) + Supabase project, folded into this repo's pnpm workspace. It has its own complete auth/database layer via Supabase and is fully self-contained. See [frontend/README.md](frontend/README.md) for the original product brief and [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) for the design system reference (theme, components, page inventory).

`/backend` (Express + Prisma + Postgres) was scaffolded during an earlier, since-abandoned plan to rewrite `/frontend` as Next.js. It's not connected to `/frontend` and isn't the current focus — see [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) for that history if you're picking it back up.

## Architecture

```
/frontend   TanStack Start (Vite, React 19, Tailwind v4, shadcn/ui, Supabase) — the real app
/backend    Express + Prisma — scaffolded, currently unused
/docs       DESIGN_SYSTEM.md (frontend design system) + BUILD_PLAN.md (history/rescope log)
```

## Prerequisites

- Node.js >= 20
- pnpm (`corepack enable` or `npm i -g pnpm`)
- Docker Desktop (only needed if you're working on `/backend`)

## Getting started

```sh
pnpm install
pnpm --filter frontend dev   # http://localhost:8080
```

`frontend/.env` already has working local dev Supabase credentials — no setup needed beyond `pnpm install`.

To work on `/backend` instead:

```sh
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up -d db
pnpm --filter backend prisma:migrate
pnpm --filter backend dev   # http://localhost:4000, GET /health
```

## Common commands

| Command | Description |
| --- | --- |
| `pnpm --filter frontend dev` | Frontend dev server |
| `pnpm --filter frontend lint` | Lint the frontend |
| `pnpm db:up` / `pnpm db:down` | Start/stop the backend's Postgres container |
| `pnpm --filter backend dev` | Backend dev server |
| `pnpm --filter backend prisma:migrate` | Create/apply a Prisma migration |
| `pnpm --filter backend prisma:studio` | Prisma Studio against the local DB |
| `pnpm lint` | Lint both packages |
| `pnpm format` | Format the whole repo with Prettier |

## Environment variables

`frontend/.env` — Supabase config (`VITE_SUPABASE_*` for the client, `SUPABASE_*`/`SUPABASE_SERVICE_ROLE_KEY` for server-side). Already populated for local dev.

Root [.env.example](.env.example) and [backend/.env.example](backend/.env.example) — the backend's Postgres/JWT/CSRF config, only relevant if you're working on `/backend`.
