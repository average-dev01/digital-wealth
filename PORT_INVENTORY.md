# PORT_INVENTORY.md

Checklist for the in-place port of `/frontend` from **TanStack Start** (Vite, React 19, file-based routing, Supabase) to **Next.js 14+ App Router**. This is a mechanical port  no redesign, no new features. Nothing gets added that isn't listed here; nothing listed here gets skipped.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done + visually verified

---

## 1. Routes (17 files → Next.js App Router)

Old (`frontend/src/routes/`) is TanStack Start file-based routing (flat + dot-segment + `_prefix` = pathless layout). New (`frontend/app/`) is Next.js App Router (`page.tsx`/`layout.tsx`, route groups `(name)`).

| # | Old file | URL | New file (planned) | Type | Notes | Status |
|---|---|---|---|---|---|---|
| 1 | `src/routes/__root.tsx` | (shell) | `app/layout.tsx` + `app/error.tsx` + `app/global-error.tsx` + `app/not-found.tsx` | Root shell | `QueryClientProvider` → `AuthProvider` → children → `Toaster`; meta tags → `metadata` export; fonts → `next/font/google` | [x] |
| 2 | `src/routes/index.tsx` | `/` | `app/page.tsx` | Page | Marketing home, `SiteLayout` + hero/stats/steps/trust/testimonials | [x] |
| 3 | `src/routes/about.tsx` | `/about` | `app/about/page.tsx` | Page | Static | [x] |
| 4 | `src/routes/services.tsx` | `/services` | `app/services/page.tsx` | Page | Static | [x] |
| 5 | `src/routes/security.tsx` | `/security` | `app/security/page.tsx` | Page | Static | [x] |
| 6 | `src/routes/faq.tsx` | `/faq` | `app/faq/page.tsx` | Page | Static FAQ accordion | [x] |
| 7 | `src/routes/contact.tsx` | `/contact` | `app/contact/page.tsx` | Page | Form → `lib/api/contact.submitContact` | [x] |
| 8 | `src/routes/auth.tsx` | `/auth` | `app/auth/page.tsx` + `auth-page.tsx` | Page | Login/signup, `?mode=` via `useSearchParams` (Suspense-wrapped), Google button kept on a mock OAuth fn | [x] |
| 9 | `src/routes/forgot-password.tsx` | `/forgot-password` | `app/forgot-password/page.tsx` + `forgot-password-page.tsx` | Page | `lib/api/auth.resetPasswordForEmail` | [x] |
| 10 | `src/routes/reset-password.tsx` | `/reset-password` | `app/reset-password/page.tsx` + `reset-password-page.tsx` | Page | `lib/api/auth.updateUser` (password) | [x] |
| 11 | `src/routes/_authenticated/route.tsx` | (guard, pathless) | `app/(authenticated)/layout.tsx` | Layout/guard | Redirects to `/auth?mode=login` if not logged in; client-side like the original (`ssr: false`) | [x] |
| 12 | `src/routes/_authenticated/dashboard.tsx` | `/dashboard` (layout) | `app/(authenticated)/dashboard/layout.tsx` | Layout | Sidebar nav, sign-out, KYC banner | [x] |
| 13 | `src/routes/_authenticated/dashboard.index.tsx` | `/dashboard` | `app/(authenticated)/dashboard/page.tsx` | Page | Portfolio overview, pie chart, recent activity | [x] |
| 14 | `src/routes/_authenticated/dashboard.wallets.tsx` | `/dashboard/wallets` | `app/(authenticated)/dashboard/wallets/page.tsx` | Page | Deposit (QR)/Withdraw/Convert  heaviest client state | [x] |
| 15 | `src/routes/_authenticated/dashboard.transactions.tsx` | `/dashboard/transactions` | `app/(authenticated)/dashboard/transactions/page.tsx` | Page | Filterable transaction table | [x] |
| 16 | `src/routes/_authenticated/dashboard.kyc.tsx` | `/dashboard/kyc` | `app/(authenticated)/dashboard/kyc/page.tsx` | Page | KYC form + file upload → `lib/api/kyc.submitKyc` | [x] |
| 17 | `src/routes/_authenticated/dashboard.settings.tsx` | `/dashboard/settings` | `app/(authenticated)/dashboard/settings/page.tsx` | Page | Profile edit + password reset trigger | [x] |

Port order: rows 2–7 (static/no-auth) → 8–10 (auth pages) → 11–12 (guard/layout) → 13–17 (dashboard pages, most complex last).

---

## 2. Components

### `src/components/site/` (5, custom  mostly portable near-verbatim)
| File | Purpose | Client boundary |
|---|---|---|
| `Logo.tsx` | Logo image + wordmark, wraps `Link` | server-ok unless parent forces client |
| `Reveal.tsx` | Scroll-reveal wrapper (`IntersectionObserver`) | **"use client"** |
| `SiteHeader.tsx` | Top nav, mobile menu, auth-aware CTAs | **"use client"** |
| `SiteFooter.tsx` | Static footer | server-ok |
| `SiteLayout.tsx` | `SiteLayout` + `PageHero` wrappers | server-ok (presentational) |

### `src/components/ui/` (46, shadcn/ui  port verbatim, add `"use client"` to nearly all)
`accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip`

Rule of thumb: every file importing `@radix-ui/react-*`, or using `useState`/`useEffect`/`createContext`/`forwardRef`, needs `"use client"`  that's 42+ of 46. Only double-check `badge.tsx`/`skeleton.tsx` individually; default to client for the rest. `sidebar.tsx` is the largest (~700+ lines, own context provider, cookie-based state, uses `use-mobile.tsx`).

---

## 3. Hooks (`src/hooks/`)

| File | Exports | Change needed |
|---|---|---|
| `useAuth.tsx` | `AuthProvider`, `useAuth()`, `useProfile()`, `useIsAdmin()` | Rewire off Supabase → `lib/api/auth.ts` + `lib/api/profile.ts` |
| `use-mobile.tsx` | `useIsMobile()` | Portable as-is (`"use client"`, uses `window.matchMedia`) |

---

## 4. Supabase call sites (17 files → `lib/api/*`)

| File | Line(s) | Call | Maps to |
|---|---|---|---|
| `src/start.ts` | 4, 29 | registers `attachSupabaseAuth` function middleware | removed  no TanStack server-fn RPC layer in Next |
| `src/hooks/useAuth.tsx` | 27 | `supabase.auth.onAuthStateChange` | `lib/api/auth.ts` subscription equivalent |
| `src/hooks/useAuth.tsx` | 35 | `supabase.auth.getSession()` | `lib/api/auth.getCurrentUser()` |
| `src/hooks/useAuth.tsx` | 61-65 | `profiles` select (`useProfile`) | `lib/api/profile.getMyProfile()` |
| `src/hooks/useAuth.tsx` | 78-83 | `user_roles` select (`useIsAdmin`) | `lib/api/profile.ts` (or dropped  unused today) |
| `src/lib/walletService.ts` | 24-27, 34-44 | `wallets` select + self-heal insert (`listWallets`) | `lib/api/wallets.listWallets` |
| `src/lib/walletService.ts` | 57-61 | `transactions` select (`listTransactions`) | `lib/api/transactions.listTransactions` |
| `src/lib/walletService.ts` | 107-116 | `transactions` insert (`requestDeposit`) | `lib/api/wallets.requestDeposit` |
| `src/lib/walletService.ts` | 128-138 | `transactions` insert (`requestWithdrawal`) | `lib/api/wallets.requestWithdrawal` |
| `src/lib/walletService.ts` | 161-188 | `wallets` update x2 + `transactions` insert (`convert`) | `lib/api/wallets.convert` |
| `src/lib/walletService.ts` | 201-238 | `wallets`/`transactions` (`adminAdjustBalance`) | `lib/api/wallets.adminAdjustBalance` (unused by any UI, keep for parity) |
| `src/lib/walletService.ts` | 252-274 | `wallets`/`transactions` (`adminSettleTransaction`) | `lib/api/wallets.adminSettleTransaction` (unused by any UI, keep for parity) |
| `src/routes/auth.tsx` | 85-92, 101-104 | `signUp`, `signInWithPassword` | `lib/api/auth.signup`, `lib/api/auth.login` |
| `src/routes/auth.tsx` (via `integrations/lovable`) |  | Google OAuth → `supabase.auth.setSession` | **dropped**  no Supabase-free equivalent requested (flagged) |
| `src/routes/forgot-password.tsx` | 42-44 | `resetPasswordForEmail` | `lib/api/auth.resetPasswordForEmail` |
| `src/routes/reset-password.tsx` | 43 | `updateUser({password})` | `lib/api/auth.updateUser` |
| `src/routes/contact.tsx` | 48 | `contact_submissions` insert | `lib/api/contact.submitContact` |
| `src/routes/_authenticated/route.tsx` | 7 | `getUser()` (route guard) | `app/(authenticated)/layout.tsx` calling `lib/api/auth.getCurrentUser()` |
| `src/routes/_authenticated/dashboard.tsx` | 29 | `signOut()` | `lib/api/auth.logout` |
| `src/routes/_authenticated/dashboard.settings.tsx` | 23-26, 38-41 | `profiles` update, `resetPasswordForEmail` | `lib/api/profile.updateMyProfile`, `lib/api/auth.resetPasswordForEmail` |
| `src/routes/_authenticated/dashboard.kyc.tsx` | 36-56 | `profiles` update, storage upload, `kyc_documents` insert | `lib/api/kyc.submitKyc` |

Files removed entirely: `src/integrations/supabase/{client.ts,client.server.ts,auth-attacher.ts,auth-middleware.ts,types.ts}`, `src/integrations/lovable/index.ts`.

### Mock seed data (from `handle_new_user` trigger  reproduce in `lib/api/wallets.ts` so dashboards render populated)
7 currencies seeded per "signup": BTC 0.1842, ETH 3.421, USDT 5200, USDC 1800, SOL 42.75, BNB 6.2, XRP 1250  each with 2 backdated transactions (opening deposit @60% of balance, 21 days ago; portfolio funding admin_adjustment @40%, 7 days ago).

### Row shapes to preserve
- `Wallet`: `{ id, user_id, currency, balance: number, address: string|null, created_at }`
- `Transaction`: `{ id, user_id, wallet_id, type: "deposit"|"withdrawal"|"admin_adjustment"|"convert", currency, amount, status: "pending"|"completed"|"rejected", notes, destination_address, created_by_admin, created_at }`
- `Profile`: `{ id, email, full_name, country, dob, kyc_status: "pending"|"verified"|"rejected", created_at }`

---

## 5. Tailwind theme, fonts, global CSS

- **Source**: `src/styles.css` (184 lines, Tailwind v4 CSS-first config) → **destination**: `app/globals.css`, copied verbatim except the `@source "../src"` directive updates to match the new tree.
- oklch color tokens (dark navy base + gold accent), `@theme inline` mapping, `.dark` class, base layer resets, custom `@utility` classes: `num` (tabular-nums), `surface-panel`, `text-gradient-gold`, `hairline-grid`, `@keyframes reveal-up`/`animate-reveal`.
- Build plugin: `@tailwindcss/vite` → `@tailwindcss/postcss` (`postcss.config.mjs`).
- **Fonts**: Google Fonts `<link>` today (Inter 400/500/600/700, IBM Plex Mono 400/500/600) → port via `next/font/google` (`Inter`, `IBM_Plex_Mono`) as CSS variables, same families/weights, no change.
- `components.json`: flip `rsc: false` → `true`, update `tailwind.css` path to `app/globals.css`.

---

## 6. Dependencies (`frontend/package.json`)

**Keep as-is** (framework-agnostic, port unchanged): `@hookform/resolvers`, all `@radix-ui/react-*` (26 pkgs), `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `embla-carousel-react`, `input-otp`, `lucide-react`, `qrcode`+`@types/qrcode`, `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `tailwindcss`, `tw-animate-css`, `vaul`, `zod`, `@types/node`, `@types/react`, `@types/react-dom`, `typescript`, `prettier`, `eslint-config-prettier`, `eslint-plugin-prettier`, `eslint-plugin-react-hooks`.

**Add**: `next@^14`, `@tailwindcss/postcss`, `eslint-config-next` (replaces `eslint-plugin-react-refresh`).

**Remove** (Step 4, after Next dev server verified): `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`, `@tanstack/react-query` stays (data fetching, framework-agnostic)  only the router/start packages go, `@lovable.dev/vite-tanstack-config`, `@tailwindcss/vite`, `vite`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `eslint-plugin-react-refresh`, `@supabase/supabase-js`, `@lovable.dev/cloud-auth-js`.

react/react-dom (^19.2.0) stay as-is  compatible with Next 14/15.

**Scripts**: `dev`/`build`/`start`/`lint` move from `vite dev`/`vite build`/`vite preview`/`eslint .` to `next dev`/`next build`/`next start`/`next lint` (dev port stays **8080** to match `CLAUDE.md`/root `README.md`: `next dev -p 8080`).

---

## 7. Flagged deviations (no clean 1:1 Next.js equivalent  raised in the final report, not silently substituted)

1. **`src/lib/error-capture.ts` + `src/lib/error-page.ts`**  h3/Nitro-specific unhandled-error interception and the SSR fallback error page. No TanStack-Start equivalent survives in Next; **replaced** by `app/error.tsx` + `app/global-error.tsx`, which carry the original's copy and "Try again"/"Go home" behavior. Files deleted.
2. **CSRF/auth `functionMiddleware` in `src/start.ts`**  TanStack Start's server-function middleware chain (`attachSupabaseAuth`, `createCsrfMiddleware`) has no App Router equivalent (no server-fn RPC layer). **Dropped**; reintroduce via Next `middleware.ts` against real API routes once a backend exists.
3. **Google OAuth "Continue with Google" button on `/auth`**  was `@lovable.dev/cloud-auth-js` + `supabase.auth.setSession`. **Button kept** (the task requires every flow stay clickable) and wired to `lib/api/auth.loginWithGoogle()`, a mock that signs into a fixed demo account with no real OAuth round-trip.
4. **Next 15 instead of Next 14**  Next 14 declares a `react@^18` peer dep and this app runs React 19.2; Next 15 supports React 19 cleanly. Task said "Next.js 14+".
5. **Fonts stay on the Google Fonts `<link>`** rather than `next/font/google`. `next/font` fetches font files at build time, which this environment's network blocks (5-min timeouts, fallback-font warnings). The `<link>` approach is also what the original `__root.tsx` did, so this is closer to the original markup.
6. **`seedBalance` added to `CURRENCIES`** in `lib/market.ts`  the 7 opening balances previously lived in the Postgres `handle_new_user()` trigger, which no longer exists. Values are unchanged; only their home moved.
7. **`src/globals.d.ts` added**  declares `*.css` for side-effect imports. Vite supplied this via `vite/client`; Next only declares `*.module.css` and the original tsconfig keeps `noUncheckedSideEffectImports: true`.

## 9. Cleanup performed (Step 4)

Deleted: `src/routes/`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/server.ts`, `src/start.ts`, `src/styles.css`, `vite.config.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/lib/walletService.ts` (superseded by `lib/api/wallets.ts`), `src/integrations/` (supabase + lovable), `supabase/` (config + migrations).

Deps removed: `@supabase/supabase-js`, `@lovable.dev/cloud-auth-js`, `@lovable.dev/vite-tanstack-config`, `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`, `@tailwindcss/vite`, `vite`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `nitro`, `eslint-plugin-react-refresh`. Added: `next`, `@tailwindcss/postcss`, `eslint-config-next`.

`eslint.config.js` (dropped react-refresh plugin + the TanStack `server-only` ban, ignores `.next`), `.prettierignore`, `.gitignore` (added `.next/`, `next-env.d.ts`) updated accordingly.

---

## 8. Not part of this port (leave untouched)

`/backend`, `docs/`, `docker-compose.yml`, root `package.json`/`pnpm-workspace.yaml`, `CLAUDE.md`, `README.md`  all uncommitted root-level work unrelated to `/frontend`'s framework. `frontend/supabase/migrations/*.sql` reference schema stays in the repo as historical documentation of the shape `lib/api/` mocks (not deleted, just no longer wired to anything).
