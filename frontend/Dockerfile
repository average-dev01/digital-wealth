# Build from the repo root: `docker build -f frontend/Dockerfile . --build-arg NEXT_PUBLIC_API_URL=https://...`
# The context must be the repo root (not frontend/) because pnpm needs the
# shared workspace manifest + lockfile, and next.config.mjs's
# outputFileTracingRoot points at the repo root too.

FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

# --- Deps stage --------------------------------------------------------
FROM base AS deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
# The workspace-root postinstall hook (`prisma generate` for backend) fires
# on *any* `pnpm install` here, filtered or not — so backend's schema and
# its own deps have to be part of this install too, or that hook fails.
# Backend's dependency tree is small, so this costs little.
COPY backend/prisma ./backend/prisma
RUN pnpm install --frozen-lockfile --filter frontend --filter backend

# --- Build stage ---------------------------------------------------------
FROM deps AS build

COPY frontend ./frontend
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so this
# has to be a build arg (set as a Railway build-time service variable), not
# just a runtime env var on the running container.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter frontend build

# --- Runner stage: standalone server only ---------------------------------
FROM base AS runner
ENV NODE_ENV=production
# No hardcoded PORT: the standalone server.js reads process.env.PORT itself
# (defaulting to 3000), and Railway injects its own PORT at runtime — baking
# one in here would make the app listen on the wrong port if Railway assigns
# something else, and the healthcheck prober would hit that mismatch as
# "service unavailable" with no visible crash in the logs.
#
# HOSTNAME is different: Docker auto-sets it to the container ID, and the
# standalone server.js does `hostname = process.env.HOSTNAME || '0.0.0.0'` —
# so without this override it binds to that container-ID hostname (which
# resolves to the container's own specific IP) instead of all interfaces.
# Confirmed via /proc/net/tcp: without this, the listening socket showed the
# container's single IP, not 0.0.0.0 — works by accident under Docker
# Desktop's NAT, but not under Railway's real proxy networking, causing
# "Application failed to respond" even though the app itself is healthy.
ENV HOSTNAME=0.0.0.0

# outputFileTracingRoot is the repo root, so .next/standalone mirrors the
# whole repo-relative path (frontend/server.js, root-level node_modules,
# etc.) — copy the entire tree to /app, not into /app/frontend.
COPY --from=build /app/frontend/.next/standalone ./
# standalone output deliberately omits static assets and public/, per Next's
# own docs — copy them in separately.
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public

WORKDIR /app/frontend
EXPOSE 8080
CMD ["node", "server.js"]
