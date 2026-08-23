# Wire up a real backend for Digital Wealth Partners

## Context

`/frontend` currently runs entirely on an in-browser, localStorage-backed mock ("`mock-db.ts`"). `/backend` (Express + Prisma + Postgres) already has real, working auth (`routes/auth.ts`) and wallet logic (`routes/wallets.ts`, `lib/walletService.ts`)  it's just never been mounted into the app, and several admin/KYC/contact features have no backend at all yet.

The goal: replace every mock data path with a real, working backend  registration, login/session management via JWT cookies, customer wallet operations (deposit/withdraw/convert), KYC submission, the contact form, and the full admin surface (currency catalog, wallet-address management, user management, deposit/withdrawal review, dashboard stats)  while keeping almost all frontend UI code untouched. This works because the frontend already isolates all data access behind `frontend/src/lib/api/*.ts`  swapping those files' internals from mock-db calls to real `fetch()` calls (keeping the same exported function names/signatures) means the page/component code needs no changes, except in three places called out explicitly below.

**Status: Phases 1–3 are done and verified** (auth, customer wallets, admin currency catalogue, full admin panel  34 backend tests passing, both packages type-check clean, the mock layer has been deleted). Phases 4–6 below are not new features  they're hardening, removing the remaining seed/demo data so the app reflects genuine user activity instead of pre-loaded fake balances, fixing one display bug that seeding was masking, and investigating reported latency. **Phases 4–6 are scoped and approved but intentionally not started yet  pick them up after the current round of changes is done.**

### Decisions already made (don't revisit)

From the original build (Phases 1–3):
- **Deposit addresses**: one shared, admin-published address per currency (via a new `WalletAddress` table), not a per-user generated address. Matches the frontend's existing empty-state copy ("customers cannot get an address until admin publishes one"). ✅ Built.
- **Deposit proof-of-payment**: out of scope. Admins review deposits by claimed amount only  no file upload, no proof viewer. The current `ProofViewerDialog`/`getTransactionProofUrl` only ever displayed seeded demo images; nothing real was removed. ✅ Done (deleted in Phase 3).
- **`NEXT_PUBLIC_SKIP_AUTH` dev bypass**: removed entirely. Dev workflow is "log in with a real seeded account." ✅ Done.
- **Testing**: `vitest` + `supertest` for the highest-value paths only  full auth flow, and admin money-moving actions (deposit/withdrawal review, manual balance adjustment). Not exhaustive route coverage. ✅ Done  34 tests across `auth.test.ts`, `adminCatalog.test.ts`, `admin.test.ts`.
- **KYC file upload**: filename-only stub, no real file storage. `multer` stays an unused dependency. ✅ Built as designed.
- **Test database**: a second database (`digital_wealth_test`) inside the same Postgres container `make db-up` starts  a script applies migrations and truncates/reseeds tables between test runs. ✅ Built.
- **`Wallet.address` column**: dropped in the Phase 2 migration  superseded by `WalletAddress`. ✅ Done.
- **Rate limits**: 10 requests/15min/IP on `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`; 20/hour/IP on `/contact`. ✅ Built.
- **"Wallet card" / "wallet address"**: admin CRUD on `Currency` (defines what cards can exist) and `WalletAddress` (the deposit address per currency) respectively. ✅ Built.

From this round (Phases 4–6, scoped below):
- **Seed script scope**: narrows to **admin account only**  no demo customers, no pre-created currencies/addresses. There's no other way to bootstrap admin access (no self-serve promotion flow), so this one account stays; everything else gets created for real through the admin UI.
- **Deactivated currency**: a customer's existing wallet for it **stays visible** (balance shown, withdrawals still allowed)  only new deposits are blocked. Matches how exchanges usually handle delisting: get your funds out, just can't add more.
- **Dev database**: gets a full `prisma migrate reset` once the new seed script lands, so testing starts from genuinely empty state.
- **Latency**: investigate broadly first using the backend's existing `[http]` request-timing logs before making changes  no blind optimization.

### Two facts that shape every phase below

1. **snake_case vs camelCase**: every frontend type (`Profile`, `Wallet`, `Transaction`, `Currency`, `WalletAddress`) uses `snake_case` (`full_name`, `kyc_status`, `is_active`, `created_at`...); Prisma/Express naturally return `camelCase`. Each rewritten `lib/api/*.ts` file needs a small mapper so components (which destructure `profile.full_name` etc.) don't change. Role is a rename, not a case-flip: Prisma `admin`/`user` → frontend `"ADMIN"`/`"CUSTOMER"`.
2. **Decimal-as-string**: `Wallet.balance`/`Transaction.amount` are Prisma `Decimal`, which serialize to JSON strings. Every mapper must `Number(...)` these on the way in  the UI treats balances as plain numbers.

---

## Phase 1  Mount the existing backend, real auth end-to-end ✅ Done

**Goal**: signup/login/refresh/logout/`/me` work against Postgres; customer wallets are readable. Still uses the old hardcoded currency list and per-wallet mock address (fixed in Phase 2).

**Backend**
- `backend/src/app.ts`: mount `authRouter` at `/auth`, `walletsRouter` at `/wallets`. Pass `process.env.COOKIE_SECRET` into `cookieParser(secret)` (currently unwired  signed cookies silently don't verify without this). Mount `csrfProtection` (`backend/src/lib/csrf.ts`, already built, never mounted) after cookie-parser, before routes. Add `compression()`. Add a final Express error-handling middleware (`(err, req, res, next) => ...`) returning `{error: message}` in the same shape routes already use.
- Add `express-rate-limit` dependency; apply to the four auth endpoints + `/contact` per the thresholds above.
- `backend/src/routes/auth.ts`: add `PATCH /me` (requireAuth)  zod-validates `{fullName?, country?, dob?}` (deliberately **not** `kycStatus`  that only changes via KYC submission or admin decision), updates `User`, returns `publicUser(...)`.
- `backend/src/middleware/requireAdmin.ts` (new): same pattern as `requireAuth`  after `req.userId` is set, checks `prisma.userRole.findFirst({where:{userId, role:"admin"}})`, 403 if absent. Leave `/me`'s existing inline admin check as-is; new admin routes (Phase 2+) use this middleware.
- `backend/src/routes/wallets.ts`: add `GET /transactions` (requireAuth) → `{transactions: await listTransactions(req.userId!)}` (fills a gap  no route currently exposes a user's own transaction history).

**Frontend**
- `frontend/src/lib/api/client.ts`: replace `delay()` with a `fetchApi(path, init)` wrapper  `credentials:"include"`, reads the `csrf_token` cookie and sets `X-CSRF-Token` on non-GET requests, throws `Error(body.error)` on non-2xx (preserves every `toast.error(e.message)` call site), and on 401 transparently does one `POST /auth/refresh` + retry before failing.
- `frontend/src/lib/api/auth.ts`: rewrite `signup`/`login`/`logout`/`getCurrentUser`/`resetPasswordForEmail`/`updateUser` to call `fetchApi`. **Remove** `isAuthBypassEnabled()` and `loginWithGoogle()` (no real OAuth provider exists to back it). Drop the `onAuthStateChange` pub/sub (see Cross-cutting below). Simplify `refreshSessionUser(userId)` into a thin re-fetch of `/auth/me` (check its call sites first  it likely only ever refreshes the caller's own session).
- `frontend/src/lib/api/profile.ts`: `getMyProfile`/`updateMyProfile` → `GET`/`PATCH /auth/me`, with the snake_case + Decimal mapping.
- `frontend/src/lib/api/wallets.ts`: `listWallets`, `getDepositAddress`, `requestDeposit`, `requestWithdrawal`, `convert` → real `/wallets/...` calls. Leave `adminAdjustBalance`/`adminSettleTransaction` in place for now  removed in Phase 3.
- `frontend/src/lib/api/transactions.ts`: `listTransactions` → `GET /wallets/transactions`.
- `frontend/src/hooks/useAuth.tsx`: drop the pub/sub subscription; `AuthProvider` hydrates via `useQuery(["me"], getCurrentUser)`; login/signup/logout call sites invalidate `["me"]` (logout already does `queryClient.clear()`). `useProfile()`/`useIsAdmin()` stay structurally the same.
- Component edits (the only page/component changes in this whole plan):
  - `frontend/src/app/(authenticated)/layout.tsx`  remove the SKIP_AUTH bypass branch.
  - `frontend/src/app/auth/auth-page.tsx`  remove the "Continue with Google" button and its handler/import.
- `frontend/.env.example`: delete the `NEXT_PUBLIC_SKIP_AUTH` line/comment.

**Tests**: `backend/src/__tests__/auth.test.ts` via `supertest(createApp())`  signup provisions wallets, login success/failure, refresh rotation, logout revokes the refresh token, `/me` reflects session. Add the `digital_wealth_test` DB setup (migration + truncate helper) here since this is the first test file.

---

## Phase 2  Currency/wallet-address catalog becomes real and DB-driven ✅ Done

**Goal**: admin manages the currency catalog and shared deposit addresses; backend stops trusting the hardcoded `CURRENCIES` array.

**Backend  one migration** (`prisma migrate dev --name admin_catalog_and_hardening`):
- New model `Currency`: `id, symbol @unique, name, decimals Int, icon String?, mockPriceUsd Decimal @db.Decimal(18,8), isActive Boolean @default(true), createdAt`.
- New model `WalletAddress`: `id, currencyId, address, network, isActive Boolean @default(true), createdAt`, relation to `Currency`, `@@index([currencyId, isActive])`.
- `Transaction.txHash String?` (needed for the admin withdrawal-completion flow in Phase 3).
- `User.isActive Boolean @default(true)`  the missing suspend/reactivate column; the mock's login-blocks-suspended-accounts behavior has no backing column today.
- Drop `Wallet.address`.
- Indexes: `Transaction` on `[type, status]` and `[userId]`; `User` on `kycStatus` and `isActive`.
- `backend/prisma/seed.ts` (new): 7 `Currency` rows from today's hardcoded list, one active `WalletAddress` per currency, an admin account, a few seeded customers. Wire via `package.json`'s `prisma.seed` field; add `pnpm --filter backend prisma:seed`.

**Backend  dynamic currency refactor**:
- `backend/src/lib/currencies.ts`: replace the hardcoded array with DB-backed `getActiveCurrencies()` (short in-memory TTL cache, ~30-60s), `isValidCurrency(code): Promise<boolean>`, `getCurrency(code): Promise<CurrencyMeta|undefined>`, plus `invalidateCurrencyCache()` called after admin create/update/deactivate. Drop `mockAddress()` entirely.
- `backend/src/lib/walletService.ts`: `listWallets`/`seedNewUser` iterate `await getActiveCurrencies()`. `getDepositAddress(userId, code)` now resolves the currency's active `WalletAddress` instead of `wallet.address`  returns a typed "no address published yet" result when none exists, which the frontend's existing empty-state copy already anticipates.
- `backend/src/routes/wallets.ts`: the four `isValidCurrency(code)` call sites (address/deposit/withdraw/convert) become `await isValidCurrency(code)`.
- `backend/src/routes/adminCurrencies.ts` (new, `/admin/currencies`, `requireAuth+requireAdmin`): `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/deactivate` (soft-delete only, matches existing "never hard-delete" UI).
- `backend/src/routes/adminWalletAddresses.ts` (new, `/admin/wallet-addresses`, same guard): `GET /`, `POST /`, `PATCH /:id`.
- Mount both in `app.ts`.

**Frontend**
- `frontend/src/lib/api/currencies.ts`, `walletAddresses.ts`: rewrite to hit the new admin endpoints, with snake_case + Decimal mapping. No other file changes this phase.

---

## Phase 3  Admin user/transaction operations, KYC, contact ✅ Done

**Goal**: every remaining `lib/api/*.ts` file talks to a real endpoint.

**Backend**
- `routes/auth.ts` `/login`: add the suspension check now that `User.isActive` exists  `403 {error:"This account has been suspended. Contact support for assistance."}` (same copy as today, no frontend change needed).
- `lib/walletService.ts`: add `adminAdjustBalance(userId, currencyCode, delta, note)` (create-if-missing wallet, guard against negative balance, write an `admin_adjustment` transaction with `createdByAdmin:true`) and `settleTransaction(txId, status, note, txHash?)` (completed+deposit credits, completed+withdrawal debits and throws on would-be overdraw, rejected just marks the row  wrapped in `prisma.$transaction`).
- `routes/adminUsers.ts` (new, `/admin/users`, requireAuth+requireAdmin): `GET /` (server-side search/filter/pagination via Prisma `where`+`skip`/`take`+`count()`, excludes admin accounts), `GET /:id` (single query with `include: {wallets, transactions, kycDocuments}`), `PATCH /:id` (`{isActive?, fullName?}`), `PATCH /:id/kyc` (`{status}`), `POST /:id/adjust-balance` (`{currencyId, amount, note}`).
- `routes/adminTransactions.ts` (new, `/admin/transactions`, same guard): `GET /pending?type=deposit|withdrawal` (one query with `include:{user:{select:...}}`, no N+1), `POST /:id/review` (`{status, txHash?, note?}` → `settleTransaction`).
- `routes/adminDashboard.ts` (new, `/admin/dashboard`, same guard): `GET /stats` via aggregate queries (`count`, `groupBy` sum by currency)  AUM computed server-side against the now-admin-editable `Currency.mockPriceUsd`, not the frontend's compile-time prices.
- `routes/kyc.ts` (new, `/kyc`, requireAuth): `POST /`  `{fullName, dob, country}` + filename-only stub for any attached file, updates `User`, creates a `pending` `KycDocument`.
- `routes/contact.ts` (new, `/contact`, no auth): zod-validated `{name, email, message}` → `prisma.contactSubmission.create`.
- Mount all five in `app.ts`.

**Frontend**
- `adminUsers.ts`, `adminTransactions.ts`, `adminDashboard.ts`, `kyc.ts`, `contact.ts`: rewritten with their own mappers.
- `wallets.ts`: remove `adminAdjustBalance`/`adminSettleTransaction` (now dead  admin files call the real admin endpoints directly).
- Proof-viewer removal: delete `frontend/src/components/admin/ProofViewerDialog.tsx`, remove its import/trigger from `admin/deposits/page.tsx`, delete `getTransactionProofUrl` from `adminTransactions.ts`.

**Tests**: `backend/src/__tests__/admin.test.ts`  approve/reject deposit (balance moves correctly / doesn't on reject), approve/reject withdrawal (debits correctly, over-withdrawal rejected), manual balance adjustment (credit/debit/debit-below-zero rejected).

---

## Phase 4  Cross-cutting hardening + latency investigation ✅ Done

### Hardening  all verified

- **CSRF race**: fresh browser context, login submitted as the very first action → `200`, no `403`. The cookie is issued in time; no race.
- **Silent refresh-on-401**: removing only the `access_token` cookie produced exactly `GET /auth/me 401` → `POST /auth/refresh 200` → `GET /auth/me 200` → data loads. The user stays signed in and never sees a login screen.
- **Rate limiting**: attempts 1-10 return `401`, attempt 11+ returns `429`. Exactly the configured 10/15min. Note all four auth endpoints share one per-IP bucket (a single `authRateLimit` instance), and `/contact` has its own independent 20/hour bucket  confirmed still `201` while the auth bucket was exhausted.
- **N+1**: none. Measured query counts per request  `/wallets` 1, `/wallets/transactions` 1, `/admin/transactions/pending` 2, `/admin/users` 3, `/admin/users/:id` 6 (one per included relation, which is Prisma's normal `include` behaviour, not per-row).
- **`CSRF_SECRET`**: removed from `.env`/`.env.example`. The double-submit cookie is an unsigned random token and never used it  leaving a dangling "secret" implied protection that wasn't there.

### Latency  measured, then fixed

**The finding that matters: the backend was never the problem.** Every API endpoint measured 5-30ms. The cost was elsewhere.

Three real causes, each fixed:

1. **`bcryptjs` cost factor 12 → 10** (`lib/password.ts`). `bcryptjs` is pure JS (no native binding), so it's far slower than native bcrypt at the same cost. Benchmarked on the dev machine: cost 12 = ~990ms/login, cost 10 = ~160ms. 10 is the OWASP-recommended minimum. Verified: a newly-created account logs in at **119-162ms** vs **475-539ms** for an existing cost-12 hash. The cost lives inside each hash, so old hashes keep verifying at 12 until re-created  Phase 5's DB reset clears them all.
2. **`QueryClient` had no `staleTime`** (`app/providers.tsx`), so the default 0 made every page mount refetch data another page had just loaded. Set to 30s; mutations still invalidate explicitly, so user-initiated changes appear immediately.
3. **Three query keys were all fetching `GET /auth/me`**  `["me"]`, `["profile", id]`, `["is-admin", id]`  up to three identical requests per page load. Collapsed into one shared `["me"]` session (`lib/api/auth.ts`'s `getSession()` returning `{user, profile}`); `useAuth`/`useProfile`/`useIsAdmin` now `select` slices of it. The session keeps a short 10s `staleTime` (not 0, or a second consumer mounting moments later re-fetches; not 30s, so window-focus revalidation still catches a logout/suspension from another tab).

**Results (production build, identical scripted flow):**

| Action | Before | After |
|---|---|---|
| Login → dashboard visible | 3126ms | 1552ms |
| Navigate → Wallets | 408ms | 123ms |
| Navigate → Transactions | 267ms | 104ms |
| Navigate → Overview | 431ms | 102ms |
| Hard reload of /dashboard | 1039ms | **395ms** |
| API calls per session | 18 | **8** |

A full navigation round now makes **zero** API calls (was 4).

**Also fixed: the production build was broken.** `next build` failed outright  the reset-password page called `useSearchParams()` without a Suspense boundary (introduced in Phase 1 when the `?token=` read was added). Wrapped it the same way `auth/page.tsx` already does.

### The dev-mode caveat  read this before chasing more latency

Dev mode is **~10-17x slower than production and that gap is not the app**. Measured after all the above fixes:

| Action | `next dev` | `next start` (prod) |
|---|---|---|
| Navigate → Wallets | 2153ms (**0 API calls**) | 123ms |
| Hard reload | 4140ms (66ms of API) | 395ms |

2153ms to render a page that makes *no network requests at all* is entirely Next.js dev overhead  unminified bundles, the HMR runtime, React strict-mode double-rendering, and on-demand route compilation. The heavy pages are the ones pulling large client libraries (`recharts` on Overview, `qrcode` on Wallets); in prod they're fine.

**So: judge performance against `next start`, not `next dev`.** Turbopack (`next dev --turbopack`) was measured at a consistent but modest ~15-20% improvement (reload 4140ms → 3448ms)  available if wanted, but not adopted as the default since the gain doesn't justify the change.

### Diagnostics added

`PRISMA_LOG_QUERIES=true` on the backend prints every SQL statement, for counting round trips per request against the `[http]` timing logs. Off by default (noisy, and it logs query text).

---

## Phase 5  Remove seed/demo data, fix currency display gap ✅ Done

**Verified end-to-end from an empty database**: admin logs in → creates `ZEPH`
(an asset hardcoded nowhere in the codebase) → publishes its address → a new
customer signs up and sees one wallet card reading **ZEPH / Zephyr / 0.00**,
zero transactions, no Bitcoin fallback. Deactivating it leaves the card
visible with the balance and a "No longer accepting deposits" notice, Deposit
disabled and Withdraw still enabled.

Final DB state: 1 user (the admin), 0 currencies, 0 wallets, 0 transactions.

Notable extras beyond the original scope:
- The deposit dialog's **network label now comes from the published address
  row** (`GET /wallets/:code/address` returns `{address, network}`) instead of
  a hardcoded table, and the invented per-asset **minimum deposit was removed**
   no column ever backed it.
- The **Convert panel** no longer hardcodes a BTC→USDT pair; it defaults to
  whatever the desk actually lists and hides itself entirely until at least two
  assets exist.
- Tests that move money out of a wallet now **fund it explicitly**
  (`fundWallet` helper) rather than relying on the app to fabricate an opening
  balance  better test design regardless.

**Goal**: no mock/demo/fake data anywhere. New signups start at zero balance. The only pre-existing account is one admin login. Admin-created currencies display correctly  not just functionally  on the customer dashboard.

**Backend  stop fabricating data**:
- `backend/src/lib/currencies.ts`: delete `SEED_BALANCES` and `seedBalanceFor()`.
- `backend/src/lib/walletService.ts`: `seedNewUser` stops creating the two backdated fake transactions ("Simulated opening deposit" / "Simulated portfolio funding")  just provisions empty (`balance: 0`) wallets for every active currency. All real transaction history from here on only ever comes from actual deposit/withdrawal/convert/admin-adjustment activity.
- `backend/prisma/seed.ts`: remove `DEMO_CUSTOMERS` and the `CURRENCY_SEED`/`WalletAddress` seeding loop. Script narrows to creating one idempotent admin account (`admin@digitalwealth.example` / `admin1234`) and nothing else  currencies and addresses get created for real through the admin UI once logged in.
- `backend/src/__tests__/setup.ts` **keeps** seeding a currency catalogue before each test run  that's test-fixture data scoped to the test DB, unrelated to app-level demo data, and tests still need currencies to exist to provision wallets. Just confirm it doesn't break if `CURRENCY_SEED` moves/changes shape.

**Fix the currency display-metadata gap** (a real latent bug from Phase 2, only now surfacing because Phase 2's test only checked that a wallet got *provisioned*, not what it *displayed*): `frontend/src/lib/market.ts`'s `getCurrency(code)` is a compile-time lookup over the original 7 hardcoded currencies. For any currency an admin creates through the real UI, it silently falls back to `CURRENCIES[0]` (BTC)  so a brand-new asset's wallet card would incorrectly show BTC's glyph/name. Fix:
- New public, unauthenticated `GET /currencies` route (distinct from `/admin/currencies`) returning active currencies' `{symbol, name, icon, decimals}`  lets the customer app resolve real display metadata without admin permissions.
- `dashboard/wallets/page.tsx` (and anywhere else rendering wallet cards from live data) sources name/icon from this real endpoint instead of `market.ts`. `market.ts` keeps owning pricing/formatting only (`mockPriceUsd`, `formatUsd`, etc.  still simulated, unchanged scope).

**Currency deactivation UX** (per the decision above  stays visible, deposits blocked):
- Deposits are already blocked server-side for inactive currencies (Phase 2's `isValidCurrency` check)  no backend change needed.
- The new `GET /currencies` response carries `is_active`, so `dashboard/wallets/page.tsx` can disable/hide the Deposit button (with a short "no longer accepting deposits" note) on a wallet whose currency is inactive, while leaving Withdraw enabled.

**Dev database reset**: once the above ships, run `prisma migrate reset` (drops, re-migrates, reseeds with just the admin account) so testing starts from genuinely empty state  no leftover demo customers or fake balances.

**Tests**: update/add coverage for `seedNewUser` now provisioning zero-balance wallets with no fake transactions, and for the new public `/currencies` endpoint.

---

## Phase 6  Final cutover ✅ Done

`mock-db.ts` and `delay()` were already gone (removed during Phase 3). Docs
updated: `CLAUDE.md` now describes a fully-real, zero-demo-data app, and
`frontend/ADMIN_UI_PROGRESS.md` was rewritten off its mock-era text with STEP 4
ticked.

### Final gate  full browser walkthrough against the reset database

Built its own world from nothing (no currencies, no customers, no balances):

| Check | Result |
| --- | --- |
| Admin login lands on `/admin` | pass |
| Created 2 currencies from an empty catalogue | pass |
| Published 2 deposit addresses | pass |
| New signup → one zero-balance card per listed asset | pass (`BTC=0.00`, `USDT=0.00`) |
| Deposit dialog shows the admin-published address | pass |
| Admin approves deposit → balance credited | pass (`0.50`) |
| Withdrawal rejected → balance untouched | pass (still `0.50`) |
| Convert settles at the admin-set price | pass (0.1 BTC → `9,600.00` USDT at the $96,000 *I set*, not any hardcoded figure) |
| Admin approves KYC | pass (`kycStatus = verified` in DB) |
| Customer bounced off `/admin` | pass |
| Overview reports reality | pass  1 user, **$48,000.00 AUM**, 0 pending KYC, 0 pending tx |

The AUM figure is the strongest single signal: `0.4 BTC × $96,000 + 9,600 USDT
× $1 = $48,000`, computed server-side from the admin-editable catalogue price.

Final ledger, straight from Postgres  four rows, no fabricated history:

```
deposit    completed  BTC   0.50000000
withdrawal rejected   BTC   0.20000000   <- correctly never moved funds
convert    completed  BTC  -0.10000000
convert    completed  USDT  9600.00000000
```

Test data was cleared afterwards, leaving the admin-only clean slate.

<!-- ## Phase 7 (formerly Phase 6, neglected)  Split the admin panel into its own app

**Goal**: everything admin currently lives inside `/frontend` (protected by role, but still shipped in the same bundle and reachable at a guessable route). Extract it into a new `/admin` Next.js app  its own deployable service, own subdomain, own network-level access gate (Cloudflare Access in front, since Railway has no native IP allowlisting)  so a compromised or merely-inspected public bundle never contains admin code, routes, or even the fact that an admin surface exists. Run this after Phase 6, not before: by then every admin `lib/api/*.ts` file already talks to the real backend, so this is a pure relocation, not a second mock-to-real rewrite.

### Decisions already made (don't revisit)

- **Shared UI via a new `packages/ui` workspace package**, not duplication. Both `/frontend` and `/admin` depend on it via `workspace:*`. Contains the Tailwind preset (theme colors, fonts, spacing/radius tokens) and generic primitives (Button, Card, Table, Dialog, Input, Badge, form field wrappers). Page-specific composition  the deposit modal wizard, admin review dialogs  stays in whichever app owns that page.
- **Admin gets its own login**, not a shared session with `/frontend`. Same `/auth/login` backend endpoint and JWT-cookie mechanism, but `/admin`'s login page checks the returned role and immediately logs out + shows "This account doesn't have admin access" for a non-admin credential pair, rather than letting them in and hitting 403s on every subsequent call.
- **No proof-of-payment UI to migrate on the admin side**  Phase 3 already removed `ProofViewerDialog`/`getTransactionProofUrl`, so the deposit review queue in `/admin` is just the claimed-amount list, nothing else to relocate there.
- **Deployment is Railway**: one project, two more services added to the existing `frontend`/`backend`/Postgres set  `admin` (root directory `/admin`, own subdomain, Cloudflare Access policy in front) and confirm Postgres still has no public TCP proxy. Backend gets a matching Cloudflare Access rule scoped to its `/admin/*` route prefix, so a stolen/guessed admin JWT still isn't enough without also clearing the same identity gate the `/admin` app sits behind.

### Backend

- `app.ts`: CORS currently allows a single `FRONTEND_ORIGIN`. Change to an explicit allowlist of two origins (`FRONTEND_ORIGIN`, `ADMIN_ORIGIN`), both read from env, `credentials: true`, still no wildcard. Add `ADMIN_ORIGIN` to `.env.example`.
- Verify cookie `SameSite`/`Secure`/`Domain` settings still work once requests originate from two different frontend hosts hitting the same backend host  this should already be fine as ordinary cross-origin credentialed requests (CORS per-origin + `credentials:true` + `fetchApi`'s `credentials:"include"`) as long as neither origin is wildcarded; smoke-test a login from `/admin`'s own origin specifically, don't assume it behaves like `/frontend` did.
- No route changes  `requireAdmin` already guards every `/admin/*` backend route from Phase 1-3.

### Frontend split

- **Step 0  inventory before moving anything**: write `ADMIN_SPLIT_INVENTORY.md` at the repo root listing every file under `frontend/src/app` and `frontend/src/lib/api` that is (a) admin-only, (b) shared/generic UI reusable by both apps, or (c) customer-only. Pay specific attention to `currencies.ts` and `walletAddresses.ts`  confirm whether any customer-facing page reads from them (e.g. to render currency names/icons on the dashboard) or whether they're admin-CRUD-only; if customer pages do read from them, split into a small shared read path rather than moving the whole file. Don't guess  grep for actual usages.
- **`packages/ui`**: new workspace package, Tailwind preset + the generic primitives identified above. Update `frontend`'s imports to pull from it. Verify `/frontend` still builds and looks identical before continuing.
- **Scaffold `/admin`**: new Next.js app, same Next/Tailwind/shadcn versions as `/frontend`, own `lib/api/client.ts` (the same `fetchApi` pattern from Phase 1, pointed at the same backend `API_URL`), depends on `@digital-wealth/ui` (or whatever `packages/ui` gets named  match `frontend`'s existing package-naming convention).
- **Move**: every admin route/page/component and every admin-only `lib/api/*.ts` file (`adminUsers.ts`, `adminTransactions.ts`, `adminDashboard.ts`, `adminCurrencies`/`currencies.ts` if admin-only per the inventory, `adminWalletAddresses`/`walletAddresses.ts` if admin-only) moves into `/admin`, importing shared primitives from `packages/ui` instead of `/frontend`'s local files. Routes lose whatever "admin" prefix/segment they had in `/frontend`'s URL space  the whole new app is admin, so `frontend.com/admin/users` becomes `admin-app.com/users`.
- **Remove from `/frontend`**: delete the moved routes/components/lib files entirely. Grep for any remaining reference (imports, links, nav items) and remove them. Confirm the production build output has zero admin chunks/routes.
- **Auth wiring in `/admin`**: reuse `useAuth.tsx`'s pattern (react-query `["me"]`, invalidate on login/logout) but adapted for the role check described above.

### Verify

- `/frontend`'s production build contains no admin route, chunk, or string referencing admin  check the build output, not just click-through navigation.
- `/admin` run standalone: login as the seeded admin account works, login as a seeded customer account is rejected with the explicit message, every screen (currencies, wallet addresses, users, deposit/withdrawal review, dashboard stats) functions identically to how it did inside `/frontend` before the move.
- Both apps visually match  since they share `packages/ui`, spot-check one component (e.g. Button) rendering identically in both.
- `ADMIN_SPLIT_INVENTORY.md` fully checked off; commit at each completed step, not one giant commit at the end.

### Deployment note (do this in the Railway/Cloudflare dashboards, not in code)

Add the `admin` service in Railway with root directory `/admin` and its own custom subdomain. Put Cloudflare Access in front of that subdomain (identity-based  email allowlist or SSO  since Railway has no native IP allowlisting) and a second Access policy scoped to the backend's `/admin/*` path prefix on its own domain. Confirm the Postgres service has no public networking enabled  private network only, reachable from `backend` alone. -->

## Phase 8  Real market prices ✅ Done

**Goal**: currencies carry real USD prices and real 24h changes, refreshed automatically, at zero cost  so the dollar figure a customer sees when depositing is accurate.

(Phase 7, the admin-panel split, remains deferred  see the commented block above.)

### Decisions already made (don't revisit)

- **Provider: Coinpaprika free tier**  20,000 calls/month, **no API key, no signup**, 10 req/sec, top ~2,000 assets. Verified against the live API.
- **Explicit provider id per currency**, picked through a search box. Never symbol auto-matching: dozens of assets share a ticker, and a wrong match silently mis-prices real balances.
- **Per-currency `live` / `manual` source.** `manual` is how a demo asset with no real market gets listed, and the escape hatch when the feed misbehaves.
- **`mockPriceUsd` keeps its name.** Renaming would touch the schema, both routers, the frontend mapper, the admin form, tests and docs for no behavioural gain. Doc comments were corrected instead.
- **Marketing pages stay static.** `MARKETING_ASSETS` keeps hardcoded `displayPriceUsd`/`displayChange24h`  those pages are prerendered and must not depend on a running backend.
- **Conversion was out of scope**  it is not being run yet. It reads the same `getCurrency()` catalogue, so it inherits real rates for free when switched on.

### Backend  one migration

- `backend/prisma/schema.prisma`: new `PriceSource` enum (`manual` | `live`); `Currency` gains `iconUrl`, `priceSource`, `externalPriceId`, `priceChange24h`, `priceUpdatedAt`, and `mockPriceUsd` widens `Decimal(18,8)` → `(24,12)` (8dp rounded low-priced tokens toward zero). Purely additive; generated with the `migrate diff` workaround since `migrate dev` is interactive.

### Backend

- `backend/src/lib/priceProviders/types.ts` (new): the `PriceProvider` interface  `fetchQuotes`, `searchAssets`, `fetchProfile`.
- `backend/src/lib/priceProviders/http.ts` (new): shared `getJson`/`toNumber`/`toDate`, so a new provider only describes its endpoints.
- `backend/src/lib/priceProviders/coinpaprika.ts` (new): **one** `/tickers?quotes=USD` call per refresh, filtered locally  cost stays flat as the catalogue grows. Per-id fallback capped at 5, for assets outside the free tier's top 2,000.
- `backend/src/lib/priceProviders/index.ts` (new): registry keyed by `PRICE_PROVIDER`.
- `backend/src/lib/priceFeed.ts` (new): `refreshPrices()` (live rows only, one `$transaction`, then `invalidateCurrencyCache()`), bounded logo backfill (3/run), `startPriceFeed()`/`stopPriceFeed()`, in-flight de-duplication.
- `backend/src/index.ts`: `startPriceFeed()`  deliberately here and not `app.ts`, since tests build the app directly and a timer there would make real HTTP calls on every vitest run.
- `backend/src/routes/adminCurrencies.ts`: `priceSource` / `externalPriceId` / `iconUrl` added to the zod schema, `mockPriceUsd` now optional; cross-field rules run in the handler **after merging with the existing row**, because PATCH sends a subset. Linking a currency seeds price + logo immediately, non-fatally.
- `backend/src/routes/adminPriceFeed.ts` (new, `/admin/price-feed`, requireAuth+requireAdmin): `GET /search`, `POST /refresh`, `GET /status`.
- `backend/src/middleware/rateLimit.ts`: `priceFeedRateLimit` (60/min) on the two provider-proxying endpoints.
- `backend/src/routes/currencies.ts`: public catalogue exposes `iconUrl`, `priceSource`, `priceChange24h`, `priceUpdatedAt`.
- `backend/scripts/remap-price-ids.ts` + `refresh-prices.ts` (new): provider-switch helper, and a one-shot refresh.

### Frontend

- `frontend/src/lib/api/currencies.ts`: new fields on both types and both mappers. `price_change_24h` is **null-preserving**  `Number(null)` is 0, and "0%" is a claim about the market, not an absence of data.
- `frontend/src/lib/api/priceFeed.ts` (new): `searchAssets`, `refreshPrices`, `getPriceFeedStatus`.
- `frontend/src/hooks/useCurrencies.tsx`: `change24h(code)`, `pricesUpdatedAt`, and a 60s `refetchInterval` so an open dashboard follows the market.
- `frontend/src/components/CurrencyIcon.tsx` (new): logo → glyph → first letter, with an `onError` fallback. `next.config.mjs` allow-lists the provider CDNs.
- `frontend/src/components/admin/AssetSearchField.tsx` (new): debounced combobox over the existing `ui/command` + `ui/popover`.
- `frontend/src/app/[locale]/(authenticated)/dashboard/wallets/page.tsx`: **the deposit fix**  `DepositDialog` had no USD figure at all, so an accurate rate was invisible at the moment it mattered most. Also `CurrencyIcon` on the wallet cards.
- `frontend/src/app/[locale]/(authenticated)/dashboard/page.tsx`: real value-weighted 24h change (assets with no data excluded from **both** sides of the average, so they cannot drag it toward zero) plus a "prices as of …" line.
- `frontend/src/app/[locale]/(authenticated)/admin/currencies/page.tsx`: live/manual switch, asset picker, read-only price when live, Source/24h/Updated columns, "Refresh prices". Also fixes a pre-existing bug  the page invalidated only `["admin","currencies"]`, leaving customers on a stale catalogue after any edit.
- `frontend/src/lib/market.ts`: **`get24hChange` deleted.** `MARKETING_ASSETS` gains a static `displayChange24h`.
- `frontend/messages/*.json`: `overview.pricesAsOf` added, and `overview.subtitle` corrected (it claimed simulated prices) in all four locales  411 keys, parity verified.

### Tests

- `backend/src/__tests__/priceProviderContract.test.ts` (new): the contract every provider must satisfy, `describe.each`-driven  **a new provider is covered by adding one entry**.
- `backend/src/__tests__/priceFeed.test.ts` (new): mapping, manual/unlinked rows untouched, no call on an empty catalogue, failure paths leaving prices intact, cache invalidation, logo backfill and its cap.
- `backend/src/__tests__/adminPriceSource.test.ts` (new): live/manual validation on POST and PATCH, link-time seeding, provider-down tolerance, no re-seed on unrelated edits, and the price-feed endpoints.
- 38 → **69 tests**, all passing.

### Verified end to end

Against the live Coinpaprika API with the dev server running:

| Check | Result |
| --- | --- |
| Boot on empty catalogue | `updated 0, skipped 0, missing 0 in 91ms`  no HTTP call spent |
| Asset search "bitcoin" | `btc-bitcoin` #1, then WBTC #18, BCH #27  exactly the ambiguity the picker exists to resolve |
| Create BTC as live | seeded `$64,307.83`, `24h 0.27`, logo and `priceUpdatedAt` in one call |
| Create DEMO as manual | `$1.00`, `priceChange24h: null` |
| `POST /admin/price-feed/refresh` | `updated 2, skipped 0, missing 0` in 1073ms  manual rows untouched |
| Live with no asset id | 400 `"Pick a market asset for live pricing"` |
| Manual with no price | 400 `"Enter a price above zero"` |

### Cost

One batched call per refresh, independent of catalogue size. At the default 5-minute interval: **~8,640 calls/month against a 20,000 free budget**, leaving headroom for admin searches and logo backfill.

### Adding CoinGecko later

A new file implementing `PriceProvider`, one line in the registry, one line in the contract test  see `backend/src/lib/priceProviders/README.md`. The one real catch: `externalPriceId` values are provider-specific (`btc-bitcoin` vs `bitcoin`), so a switch needs `pnpm --filter backend price-ids:remap`, which re-resolves every live currency by symbol and refuses to guess when a ticker is ambiguous.

---

## Cross-cutting note: multi-tab session sync

The mock's `onAuthStateChange` was a same-tab localStorage pub/sub. Real cookie sessions are already shared across tabs by the browser, but another open tab's React state won't know a login/logout happened elsewhere without a trigger. Plan: rely on `["me"]` query invalidation after login/signup/logout (same-tab, immediate) plus `refetchOnWindowFocus: true` so a stale tab self-corrects on next focus. This is weaker than instant multi-tab push but matches how most cookie-session SPAs behave; a `BroadcastChannel` for instant sync is a possible future add, not part of this plan. ✅ Built in Phase 1.

---

## Critical files

- `backend/src/app.ts`  mounting point for every new router/middleware across all phases.
- `backend/prisma/schema.prisma` / `backend/prisma/seed.ts`  Phase 2's migration; Phase 5's seeding changes.
- `backend/src/lib/walletService.ts`  reuse pattern for all balance-moving logic (`seedNewUser`'s `$transaction` shape); Phase 5 removes its fake data, Phase 4 addresses its `listWallets` latency.
- `backend/src/lib/currencies.ts`  DB-driven since Phase 2; Phase 5 removes `SEED_BALANCES`.
- `backend/src/middleware/requestLogger.ts`  the data source for Phase 4's latency investigation.
- `frontend/src/lib/api/client.ts`  the `fetchApi` wrapper every domain file calls through.
- `frontend/src/hooks/useAuth.tsx`  session hydration/invalidation pattern.
- `frontend/src/app/providers.tsx`  likely `staleTime` fix (Phase 4).
- `frontend/src/lib/market.ts` / `frontend/src/app/(authenticated)/dashboard/wallets/page.tsx`  currency display-metadata fix (Phase 5).
- `backend/src/lib/priceFeed.ts` + `backend/src/lib/priceProviders/`  live market prices (Phase 8); the `README.md` in that folder is the guide to adding a provider.

## Verification

- After each phase, run `pnpm --filter backend dev` + `pnpm --filter frontend dev` together (or `make dev`) and exercise the affected flows by hand in the browser.
- `pnpm --filter backend prisma:studio` to inspect rows land correctly.
- Run the vitest suite (`pnpm --filter backend test`) after every phase that touches auth or admin money-movement logic.
- Phase 4: before/after latency numbers from the `[http]` logs for the same flows, plus manual smoke-tests of CSRF/refresh/rate-limit behavior.
- Phase 5: fresh signup shows all-zero wallets with zero transaction history; admin creates a brand-new currency + address and it displays with correct name/icon (not BTC's) on a customer's dashboard; deactivating a currency leaves the wallet visible but hides the Deposit action.
- Phase 6's full regression pass against a freshly `prisma migrate reset`'d database (admin-only seed) is the final gate before calling this done.
