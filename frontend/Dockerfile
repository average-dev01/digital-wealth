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
ENV PORT=3000

# outputFileTracingRoot is the repo root, so .next/standalone mirrors the
# whole repo-relative path (frontend/server.js, root-level node_modules,
# etc.) — copy the entire tree to /app, not into /app/frontend.
COPY --from=build /app/frontend/.next/standalone ./
# standalone output deliberately omits static assets and public/, per Next's
# own docs — copy them in separately.
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public

WORKDIR /app/frontend
EXPOSE 3000
CMD ["node", "server.js"]
