# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Digital Wealth Partners  a demo-grade crypto brokerage/wealth-management web app: marketing site, KYC-gated customer dashboard, and admin panel, for a simulated multi-currency crypto portfolio. Which assets exist is entirely admin-managed at runtime (see the Currency table)  there is no fixed list. [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) walks through creating currencies and publishing deposit addresses, which is the required first step on any fresh database. See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) for theme/component reference and [frontend/README.md](frontend/README.md) for the original product brief  both describe an earlier TanStack Start + Supabase build of `/frontend` and are stale on stack/auth details; trust this file and the code over them.

**`/frontend` (Next.js App Router) talks to `/backend` (Express + Prisma + Postgres) for real, end to end. There is no mock data layer any more**  `mock-db.ts` is deleted and every file under `frontend/src/lib/api/` calls the backend. See [docs/PLAN.md](docs/PLAN.md) for the phased history and what each phase changed. `docs/BUILD_PLAN.md` is an abandoned older plan, background only.

**The app ships no demo data.** `prisma/seed.ts` creates exactly one row: an administrator, because there is no self-serve way to grant the admin role. Its email/password come from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars (falling back to `admin@digitalwealth.example` / `admin1234` when unset, which local dev and the test DB rely on)  set both in production, and re-run the seed to rotate the password later, since it updates the existing account instead of erroring. Everything else  currencies, deposit addresses, customers, balances, transactions  comes from real use of the app. A fresh database therefore has **no currencies**, so a new signup gets **no wallet cards** until an admin creates one; that is correct behaviour, not a bug. Don't reintroduce seeded balances or fabricated transaction history: `seedNewUser` provisions zero-balance wallets and writes no transactions on purpose.

**Lovable sync**: `frontend/.lovable/` and `frontend/AGENTS.md` reference a [Lovable](https://lovable.dev) connection (git remote `github.com/PrincewillDev/digital-wealth`) from `/frontend`'s original TanStack Start incarnation. Avoid rewriting published git history (force-push, rebase/amend/squash of pushed commits) regardless, since this repo has a real remote.

## Commands

Package manager is **pnpm**, with a workspace (`pnpm-workspace.yaml`) covering `/frontend` and `/backend`. Run package-scoped commands with `--filter` from the repo root, or `cd` into the package. A root `Makefile` wraps the common ones.

```sh
pnpm install                     # install deps for the whole workspace
pnpm --filter frontend dev       # frontend dev server (Next.js)  http://localhost:3000
pnpm --filter frontend lint      # ESLint
pnpm --filter frontend format    # prettier --write .

docker compose up -d db          # start Postgres for /backend (only Postgres runs in Docker)
pnpm --filter backend dev        # backend dev server (tsx watch)  http://localhost:4000
pnpm --filter backend prisma:generate  # regenerate the Prisma client
pnpm --filter backend prisma:migrate   # create/apply a Prisma migration locally
pnpm --filter backend prisma:seed      # creates the admin account only (idempotent)
pnpm --filter backend prisma:studio    # Prisma Studio against the local DB
pnpm --filter backend test             # vitest + supertest (see test DB note below)

pnpm lint                        # lint both packages (pnpm -r lint)
pnpm format                      # prettier --write . across the whole repo

make dev                         # frontend + backend dev servers in parallel
make db-up / make db-down        # start/stop the Postgres container
make prisma-migrate / prisma-deploy / prisma-studio / prisma-reset
```

**Tests** live only in `/backend` (`vitest` + `supertest`, `src/__tests__/`, 93 of them) and cover auth, the admin catalogue, the price feed (provider contract, refresh behaviour, live/manual rules), role separation, delisted-wallet visibility, the Institutional custody, and every money-moving path. They need Postgres running: `pretest` runs `scripts/prepare-test-db.ts`, which `prisma db push`es the schema onto a **separate `digital_wealth_test` database** in the same container, and `src/__tests__/setup.ts` truncates then writes `CURRENCY_FIXTURES` (test-only, `src/__tests__/currencyFixtures.ts`) before each test  the app itself has no built-in catalogue, so without those fixtures a signup would provision no wallets. Because signups now start at zero, any test that moves money *out* of a wallet funds it first via the `fundWallet` helper. Rate limiting is skipped under test (`NODE_ENV=test`/`VITEST`)  the limiter's store is a process-wide singleton and would otherwise throttle later tests into confusing 401s.

**Prisma migrations are interactive** and refuse to run from this non-interactive shell whenever they'd drop data. Workaround that keeps history intact: `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql`, then `prisma migrate deploy`. Separately, `prisma migrate reset` is **blocked for AI agents** by Prisma itself  it needs the user's explicit, in-the-moment consent passed via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Ask; don't route around it with equivalent SQL.

**Debugging**: `PRISMA_LOG_QUERIES=true` on the backend prints every SQL statement, for counting round trips per request against `requestLogger`'s `[http] … Nms` timings. Off by default (noisy, logs query text).

## Architecture

```
/frontend   Next.js (App Router), React 19, Tailwind v4, shadcn/ui (new-york
            style, Radix primitives), TanStack Query. All data access is
            isolated in lib/api/*, and all of it calls the real backend
/backend    Express (TypeScript, Prisma ORM, Postgres) serving /auth,
            /wallets, /kyc, /contact, /currencies, and /admin/* (currencies,
            wallet-addresses, users, transactions, dashboard)
/docs       PLAN.md is the phased build record  what each phase changed and
            the measured results. DESIGN_SYSTEM.md + BUILD_PLAN.md describe an
            earlier TanStack Start + Supabase iteration; stale, kept as
            historical reference
```

### Frontend (`/frontend`)

Routing is Next.js App Router under `frontend/src/app/`, and **every route lives under a `[locale]` segment** (`/en/about`, `/ar/dashboard`)  see the i18n section below. `app/layout.tsx` is now a deliberate pass-through that renders `children` and nothing else: `<html lang dir>`, the Google Fonts `<link>`s (not `next/font`, see below) and `Providers` (`QueryClientProvider`) all live in `app/[locale]/layout.tsx`, because only that layout knows the locale. Public marketing routes are flat within it (`page.tsx`, `about/`, `services/`, `security/`, `faq/`, `contact/`, `auth/`, `forgot-password/`, `reset-password/`). `app/[locale]/(authenticated)/layout.tsx` is a route-group guard (`"use client"`, checks `useAuth()`, redirects to `/auth?mode=login` if signed out) covering everything under it: `dashboard/` (customer, with its own `dashboard/layout.tsx` for the sidebar shell) and `admin/` (admin panel, with its own `admin/layout.tsx` gate  see below).

**Admin panel** (`app/[locale]/(authenticated)/admin/`): dashboard (`/admin`), currencies, wallet-addresses, users (+ `users/[id]` detail), deposits, withdrawals. Gated by `admin/layout.tsx`, which re-checks auth independently of the parent `(authenticated)` guard and adds a role check via `useIsAdmin()` (read fresh from `GET /auth/me`'s `isAdmin`, not the cached session): signed-out → `/auth?mode=login`, signed-in non-admin → `/dashboard` (redirect, not 404, applied consistently). Enforced server-side too, by `requireAdmin` on every `/admin/*` route.

**The two account types are mutually exclusive, and now enforced both ways.** They were already exclusive by construction (`seedNewUser` grants only `user`, `prisma/seed.ts` only `admin`, and there is no self-serve way to gain a role) but nothing checked it at the boundary  an admin calling `/wallets` was silently provisioned a customer wallet. So:
- `requireCustomer` (`backend/src/middleware/requireCustomer.ts`) is the mirror of `requireAdmin` and guards `/wallets` and `/kyc` with a 403. It must run *before* `listWallets`, which self-heals by creating wallets for any catalogue asset the caller lacks.
- `/admin/users` already filtered desk staff out of the *list*; `customersOnly` now also scopes `GET/PATCH /:id`, `PATCH /:id/kyc` and `POST /:id/adjust-balance` to customers, returning 404. That guards the mutations more than the read  without it one admin could suspend a colleague or post an adjustment that creates a wallet on a desk account.
- The customer dashboard has the mirror of the `/admin` gate: `dashboard/layout.tsx` redirects an admin to `/admin`. The "Customer view" links that used to sit in the admin sidebar are gone, and `SiteHeader` sends signed-in desk staff to `/admin` (`nav.adminPanel`) rather than an empty portfolio.

**Institutional custody** (`backend/src/routes/accountKeyword.ts`, customer `/dashboard/account-keyword`): an opaque identifier a customer is issued out-of-band and can enter or update at any time. It is **not** a credential or a wallet recovery phrase  auth stays email + password, and it grants no access. Stored as a plain `User.accountKeyword` column and carried on the `/auth/me` session (via `publicUser`) so the page renders its current value with no extra request. Every submit overwrites the previous value and bumps `accountKeywordSetAt`  it is **not** one-time any more (that restriction was removed at the customer's request); `POST /admin/users/:id/reset-keyword` still exists for an admin to clear it on a customer's behalf. Word count (12 or 24) is indicated in the UI but never enforced by the API. Admins see it on the user-detail page. `requireCustomer` keeps desk staff out. **While adding it, `GET /admin/users/:id` and both `PATCH` handlers stopped leaking `passwordHash`**  they now go through a `withoutPasswordHash` helper instead of spreading the raw row.

The only pre-existing account is the seeded admin (email/password from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, see above); customers are created by signing up. Admins land on `/admin` directly at login (see Auth below). There's still no nav link from the customer dashboard into `/admin`. See `frontend/ADMIN_UI_PROGRESS.md` for the screen-by-screen status.

**Internationalisation** (`frontend/src/i18n/`, `frontend/messages/`): the customer-facing app ships in **English, Arabic, French and Spanish** via `next-intl`, path-prefixed on every locale including English (`localePrefix: "always"`). `src/middleware.ts` detects the locale from `Accept-Language` and redirects bare paths; `src/i18n/request.ts` loads `messages/<locale>.json` and **deep-merges English underneath as a fallback**, so a missing key renders English rather than blank. Import `Link`/`useRouter`/`usePathname` from `@/i18n/navigation`, never from `next/link` or `next/navigation`, or navigation drops the locale.

Copy lives only in `messages/*.json` (410 keys, identical shape in all four files; key parity and ICU-placeholder/tag parity are what break first when editing them). Strings that wrap JSX use next-intl rich text (`t.rich` with `<gold>`, `<link>`, `<email>` chunks). Database values are **not** translated, but the `TxType`/`TxStatus`/`KycStatus` enums are, via `common.transactionTypes` / `common.statuses`. Timestamps use `useDateTimeFormat()` (`Intl.DateTimeFormat` pinned to `-u-nu-latn` so Arabic keeps Western digits); `lib/market.ts` money formatting is still deliberately `en-US`.

Arabic renders RTL: `<html dir>` comes from `isRtl()`, layout styles use logical properties (`ms-`/`me-`/`ps-`/`pe-`/`text-start`), directional icons get the `rtl-flip` utility, Noto Sans Arabic is loaded **only** for Arabic, and the **admin panel is pinned `dir="ltr"`** since it stays English. `app/error.tsx`, `app/global-error.tsx` and `app/not-found.tsx` sit *above* `[locale]` where no locale exists, so each renders its own `<html>`/`<body>` and stays English  don't add `@/i18n/navigation` imports or `useTranslations` to them, both throw outside the provider.

`scripts/translate.ts` (`pnpm --filter frontend translate [locale]`) regenerates the non-English catalogues with DeepL and needs `DEEPL_API_KEY` in `frontend/.env`. It is not wired into the build and no runtime code touches DeepL. It only sends keys whose English changed since `messages/.<locale>.source.json`, and never overwrites anything listed in `messages/<locale>.overrides.json`  which is where a native speaker's correction to the legal or risk copy belongs. Adding a language means adding it to `locales` in `src/i18n/routing.ts` (plus `localeNames`, and `RTL_LOCALES` if it is right-to-left) and to `TARGETS` in the script. See [docs/LANGUAGE_PLAN.md](docs/LANGUAGE_PLAN.md).

**Auth** (`frontend/src/hooks/useAuth.tsx`, `frontend/src/lib/api/auth.ts`): real httpOnly JWT-cookie sessions, with **one** `["me"]` query against `GET /auth/me` shared by every consumer. `useAuth()`, `useProfile()` and `useIsAdmin()` all `select` a slice of that same cache entry  they previously used three separate query keys and fired three identical requests per page load. Its `staleTime` is a deliberate 10s: not 0 (a second consumer mounting moments later would refetch immediately) and not the app-wide 30s (window-focus revalidation is what catches a logout or suspension from another tab).

Three fixed bugs, all easy to reintroduce:
- Login/signup **hydrate the cache synchronously** with `setQueryData(["me"], session)` rather than invalidating, and the auth page guards its own "already signed in" effect with a ref while it navigates. Otherwise that effect wins the race and sends a new signup to `/dashboard` instead of `/dashboard/kyc`.
- **Sign-out does a full `window.location.replace`, not `router.replace`**  evicting the cache does not update already-mounted React Query observers, so a client-side navigation leaves `AuthProvider` serving the old user and the auth page bounces straight back in.
- **Every endpoint that issues a session returns `isAdmin`**, so the client routes an admin straight to `/admin` instead of flashing through `/dashboard`. Keep that field on any new session-returning route.

**Data layer** (`frontend/src/lib/`): `client.ts` is the `fetchApi()` wrapper every domain file calls through  `credentials: "include"`, `X-CSRF-Token` echoed from the `csrf_token` cookie on unsafe methods, `{error}` bodies rethrown as `Error(message)` (so `toast.error(e.message)` call sites keep working), and one transparent `POST /auth/refresh` + retry on a 401, de-duplicated so a burst of concurrent 401s triggers a single refresh. Each domain file owns a small mapper, because the wire format is camelCase and the UI types are snake_case, and Prisma `Decimal` serializes to a **string** that must be `Number(...)`-ed.

**Currency display metadata is DB-driven** via `useCurrencies()` (`hooks/useCurrencies.tsx`), backed by the public `GET /currencies`. An asset's name, glyph, decimals and price all come from the catalogue, so a currency an admin creates renders correctly with no code change. `market.ts` is now only pure formatters (`formatUsd`, `formatCryptoAmount`, `formatPercent`) plus `MARKETING_ASSETS`  a static list used **exclusively** by the statically-prerendered public marketing pages, which can't depend on a running backend. Never resolve a signed-in user's asset metadata from `MARKETING_ASSETS`: the old `getCurrency()` fell back to the first hardcoded entry for an unknown symbol, which valued a newly-listed asset at Bitcoin's price.

**Prices are real.** `Currency.mockPriceUsd` (the name is historical  it was not renamed) holds a live USD price for any currency whose `priceSource` is `live`; `backend/src/lib/priceFeed.ts` overwrites it, plus `priceChange24h` and `priceUpdatedAt`, from **Coinpaprika**'s free tier (20,000 calls/month, **no API key**). A `live` currency carries an `externalPriceId` (`btc-bitcoin`) that an admin picks through a search box, never by symbol auto-matching  dozens of assets share a ticker and a wrong match mis-prices real balances. `manual` currencies keep an admin-typed price, which is how a demo asset with no real market gets listed and the escape hatch when the feed misbehaves.

Four things about the feed are load-bearing:
- **`startPriceFeed()` lives in `src/index.ts`, never `app.ts`.** Tests build the app directly, so a timer in `app.ts` would fire  and make real outbound HTTP calls  on every vitest run. It is also a no-op under test and when `PRICE_FEED_ENABLED=false`.
- **`refreshPrices()` must call `invalidateCurrencyCache()`** after writing, or the 30s catalogue cache keeps serving the old price.
- **A failed refresh leaves every stored price untouched.** Degrading to a stale price is correct; degrading to zero would value real balances at nothing. `priceUpdatedAt` is what surfaces the staleness.
- **`fetchQuotes` batches.** One `/tickers` call per refresh regardless of catalogue size, so cost never grows with the number of listed assets. At the default 5-minute interval that is ~8,640 calls/month against a 20,000 budget.

Adding another provider (CoinGecko) is a new file implementing `PriceProvider` plus one line in the registry  see [`backend/src/lib/priceProviders/README.md`](backend/src/lib/priceProviders/README.md). The one catch: `externalPriceId` values are provider-specific, so switching means re-running `pnpm --filter backend price-ids:remap`.

**Error handling**: `app/error.tsx` (route-segment) and `app/global-error.tsx` (root-layout-replacing) both render the same fallback UI and report via `lib/lovable-error-reporting.ts`; `app/not-found.tsx` is the 404. Preserve this three-way structure when touching root-level error handling.

**Design system**: dependencies and `components.json` (`new-york` style, `slate` base color, Radix, `cssVariables: true`, `rsc: true`)  add new shadcn components via `pnpm dlx shadcn@2 add <name>` (not `@latest`; the current CLI replaced this config model with an incompatible preset system). `docs/DESIGN_SYSTEM.md` documents the theme (dark-only navy + gold palette, `num`/`surface-panel` utilities, form patterns)  the content is accurate, but file paths/stack references in it point at the old `frontend/src/routes/` + `styles.css` TanStack layout rather than the current `app/` + `app/globals.css`.

**Environment**: `frontend/.env.example`  just `NEXT_PUBLIC_API_URL` (backend base URL). The old `NEXT_PUBLIC_SKIP_AUTH` bypass was removed with real auth: sign in with a seeded account instead. No Supabase vars  this app has no Supabase dependency despite some historical comments referencing the old RLS design for context.

### Backend (`/backend`)

`src/index.ts` loads `.env` then starts `createApp()`. `src/app.ts` middleware order matters: `helmet()` → `cors()` (locked to `FRONTEND_ORIGIN`, `credentials: true`) → `compression()` → `cookieParser(COOKIE_SECRET)` → `express.json()` → `requestLogger` → `csrfProtection`, then routes, then a 404 handler and a final error handler. Two things are load-bearing and easy to break: **`cookieParser` must get `COOKIE_SECRET`** (cookies are `signed: true`; without the secret, `req.signedCookies` silently never verifies), and **`import "express-async-errors"` at the top** (Express 4 doesn't forward rejected promises, so without it a throwing async handler hangs the connection instead of reaching the error handler).

Mounted: `/auth`, `/wallets`, `/kyc`, `/account-keyword`, `/contact`, `/currencies` (public catalogue read), and `/admin/currencies`, `/admin/wallet-addresses`, `/admin/users`, `/admin/transactions`, `/admin/dashboard`, `/admin/price-feed` (asset search, on-demand refresh, last-run status). Middleware in `src/middleware/`: `requireAuth` (verifies the access cookie, sets `req.userId`), `requireAdmin` (checks `UserRole`, 403  must run after `requireAuth`), `rateLimit`, `requestLogger` (logs `METHOD path status Nms`, appending the `{error}` message on 4xx/5xx; never logs bodies, since auth routes carry passwords).

**Rate limiting caveat**: all four auth endpoints share a single `authRateLimit` instance, so they share one per-IP bucket (10/15min)  a burst of failed logins also blocks password reset. `/contact` has its own independent bucket (20/hour), and `/admin/price-feed/search|refresh` another (60/min) so an admin typing in the asset picker can't burn the provider's monthly call budget.

`src/lib/`: `jwt.ts` (access 15m / refresh 30d; refresh tokens carry a random **`jti`** so two issued in the same second aren't byte-identical and don't collide on the `tokenHash` unique index  a real bug that hung requests), `cookies.ts`, `csrf.ts` (double-submit), `password.ts` (bcrypt at cost **10**, not 12  `bcryptjs` is pure JS, so cost 12 measured ~990ms per login versus ~160ms at 10, dominating all other request latency; the cost is stored in each hash, so old hashes keep verifying at whatever they were made with), `tokens.ts` (SHA-256; only hashes are stored), `currencies.ts` (**DB-driven** catalogue with a 30s cache  admin writes *and the price feed* call `invalidateCurrencyCache()`; holds no hardcoded asset list), `priceFeed.ts` + `priceProviders/` (live market prices  see the Prices note above), `walletService.ts` (the custody seam  `listWallets` hides wallets for deactivated currencies **only when the balance is zero**: an empty card for a delisted asset is clutter, but a balance is the customer's money and hiding it would strand it with no route to a withdrawal, so those keep their card with deposits disabled  provisioning, deposits/withdrawals, conversion, `seedNewUser`, plus `adminAdjustBalance`/`settleTransaction`, which re-read balances **inside** their `$transaction` so concurrent settlements can't both pass the negative-balance guard).

`prisma/schema.prisma`: `User` (with `isActive` for suspension), `UserRole` (separate table, not a column), `Wallet` (no `address`  deposit addresses are per-currency, not per-user), `Currency` (+ `PriceSource` enum, `externalPriceId`, `iconUrl`, `priceChange24h`, `priceUpdatedAt`), `WalletAddress`, `Transaction`, `KycDocument`, `ContactSubmission`, `RefreshToken`, `PasswordResetToken`. `prisma/seed.ts` is idempotent and creates only the admin account.

`docker-compose.yml` publishes Postgres on host port **55432** (not 5432  a native Postgres service already owns 5432 on the dev machine this was set up on); keep it and every `backend` `DATABASE_URL` in sync if that ever changes.
