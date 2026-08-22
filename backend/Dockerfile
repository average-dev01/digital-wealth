# Build from the repo root: `docker build -f backend/Dockerfile .`
# The context must be the repo root (not backend/) because pnpm needs the
# shared workspace manifest + lockfile to install backend's dependencies.

FROM node:20-slim AS base
# The root postinstall hook runs `prisma generate` on every `pnpm install`
# (see root package.json); Prisma's query engine needs a real OpenSSL to link
# against or it silently guesses a version, so install it up front rather
# than let Prisma warn-and-guess.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# --- Build stage: full deps (incl. devDependencies), generate + compile ----
FROM base AS build

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
# The schema has to exist before `pnpm install` below — the root postinstall
# hook it triggers (`prisma generate`) fails otherwise.
COPY backend/prisma ./backend/prisma
RUN pnpm install --frozen-lockfile --filter backend

COPY backend ./backend
RUN pnpm --filter backend build

# --- Runner stage: prod-only deps, compiled output only --------------------
FROM base AS runner
ENV NODE_ENV=production

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/prisma ./backend/prisma
# `prisma` and `@prisma/client` are real (non-dev) dependencies, so the
# postinstall hook's `prisma generate` runs against this prod-only
# node_modules directly — no fragile cross-stage artifact copying needed.
RUN pnpm install --frozen-lockfile --prod --filter backend

COPY --from=build /app/backend/dist ./backend/dist

WORKDIR /app/backend
EXPOSE 4000
# `pnpm start` (backend/package.json) runs `prisma migrate deploy` before
# `node dist/index.js` — deliberately kept in the npm script rather than only
# here, because some platforms invoke `pnpm start` directly and ignore this
# CMD. Either way it applies pending migrations non-interactively before the
# app starts; safe on every deploy, no-ops if none are pending.
CMD ["pnpm", "start"]
