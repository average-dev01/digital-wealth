# Design System — /frontend

Reference documentation of the Lovable-built app at [`/frontend`](../frontend) (TanStack Start + Vite + Tailwind v4 + shadcn/ui) — the real, actively-developed app, not a reference copy. New screens (deposit modal, admin panel, etc.) should visually match what's documented here so the app stays consistent as it grows.

Stack: React 19, Tailwind CSS v4, shadcn/ui (`new-york` style, `slate` base color, Radix primitives), TanStack Router/Query, Supabase.

*(History: this doc was originally written to drive porting `/frontend`'s content into a separate Next.js rewrite at a different path. That rewrite was abandoned — see `docs/BUILD_PLAN.md` Phase 0c — and this doc was repointed to describe `/frontend` directly. A few per-item porting notes below are stale as a result and have been trimmed.)

## 1. Tailwind theme

Defined in [`frontend/src/styles.css`](../frontend/src/styles.css). Tailwind v4 CSS-first config (no `tailwind.config.ts`) — theme tokens are CSS custom properties consumed via `@theme inline`.

### Design intent

Dark institutional base (deep navy) + a single gold accent. **The product is dark-only by design** — there is no light mode; `.dark` mirrors `:root` and `color-scheme: dark` is forced on `html`. Don't add a light-mode toggle.

### Colors

All colors are `oklch()`. Semantic tokens only — components never hardcode colors.

| Token | Value | Role |
| --- | --- | --- |
| `--background` | `oklch(0.17 0.024 260)` | Page background (deep navy) |
| `--foreground` | `oklch(0.97 0.005 250)` | Primary text |
| `--surface` | `oklch(0.21 0.025 260)` | Secondary background (section stripes, e.g. `bg-surface/30`) |
| `--card` | `oklch(0.213 0.024 260)` | Card/panel background (`surface-panel` utility) |
| `--popover` | `oklch(0.213 0.024 260)` | Popover/dropdown background |
| `--primary` | `oklch(0.8 0.132 85)` | **The gold accent** — CTAs, active states, data highlights |
| `--primary-foreground` | `oklch(0.19 0.03 260)` | Text on primary (dark, for contrast on gold) |
| `--secondary` | `oklch(0.27 0.025 260)` | Secondary surfaces/buttons |
| `--muted` / `--muted-foreground` | `oklch(0.26 0.022 260)` / `oklch(0.74 0.018 258)` | Muted backgrounds / muted (secondary) text — used constantly for supporting copy |
| `--accent` | `oklch(0.3 0.03 260)` | Hover/accent backgrounds |
| `--destructive` | `oklch(0.62 0.19 22)` | Errors, rejected status, negative values |
| `--success` | `oklch(0.72 0.15 155)` | Positive 24h change, completed status |
| `--warning` | `oklch(0.8 0.13 78)` | KYC-pending banners, caution notices |
| `--border` / `--input` | `oklch(0.32 0.022 260)` | Hairline borders, input borders |
| `--ring` | `oklch(0.8 0.132 85)` | Focus ring (= primary gold) |
| `--chart-1` … `--chart-7` | gold, blue, green, purple, cyan, orange, indigo (see file) | One per supported currency in the portfolio donut chart |
| `--sidebar*` | separate near-black scale | Dashboard sidebar — deliberately darker than `--background` |

`success` and `warning` are **not** default shadcn tokens — they were added on top of the standard set and are used for status badges/text (`text-success`, `text-warning`, `bg-warning/10`, etc.).

### Fonts

- `--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif` — body/UI font.
- `--font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace` — used **only** for numbers via the `num` utility (see below), so balances/prices align on tabular figures.
- Loaded via a Google Fonts `<link>` in `frontend/src/routes/__root.tsx` (weights 400/500/600/700 for Inter, 400/500/600 for IBM Plex Mono).

### Radius

Base `--radius: 0.5rem`, with `--radius-sm/md/lg/xl/2xl/3xl` derived via `calc()` (lg = base, others step ±4px increments). Cards/panels (`surface-panel`) use `--radius-xl`.

### Custom utilities (`@utility` in styles.css)

| Utility | Purpose |
| --- | --- |
| `.num` | Applies `--font-mono`, `font-variant-numeric: tabular-nums`, tight tracking. Used on **every** numeric value (balances, prices, dates, addresses) throughout the app. |
| `.surface-panel` | The standard card treatment: `bg-card` + `border-border` + `rounded-xl`. Used for nearly every card/panel across marketing and dashboard pages. |
| `.text-gradient-gold` | Gold gradient text clip, used sparingly for hero headline emphasis (see homepage `<h1>`). |
| `.hairline-grid` | Faint background grid pattern (64px cells), used behind the homepage hero. |
| `.animate-reveal` | `reveal-up` keyframe (fade + 14px translate-Y, 0.6s custom cubic-bezier) — the scroll-reveal animation, see below. |

### Dark mode

Dark-only; `@custom-variant dark (&:is(.dark *))` exists for shadcn component compatibility but there's no light palette and no theme toggle anywhere in the app.

## 2. Global CSS & animation behavior

- `html { scroll-behavior: smooth }`, `body` gets antialiasing + base font/colors, `h1/h2/h3` get tightened letter-spacing (`-0.02em`).
- **Scroll-reveal**: [`frontend/src/components/site/Reveal.tsx`](../frontend/src/components/site/Reveal.tsx) wraps content, uses `IntersectionObserver` (threshold 0.15) to add `.animate-reveal` the first time an element scrolls into view (falls back to always-shown if `IntersectionObserver` is unavailable, e.g. SSR). Accepts a `delay` prop (ms) for staggering sequential items — used throughout marketing pages to stagger hero copy, stat cards, feature lists, etc. This is the only motion pattern in the app: no other animation libraries or transitions beyond Tailwind's `transition-colors` on hover states.
- No dark/light transition, no page-transition animation, no skeleton shimmer beyond shadcn's default `Skeleton` pulse.

## 3. Reusable components

### Site-specific components — [`frontend/src/components/site/`](../frontend/src/components/site/)

| Component | File | Purpose |
| --- | --- | --- |
| `Logo` | `Logo.tsx` | Wordmark: `dwp-mark.png` image + "Digital Wealth / Partners" two-line text (or icon-only via `compact` prop). Links to `/`. |
| `Reveal` | `Reveal.tsx` | Scroll-triggered fade/slide-in wrapper, see §2. |
| `SiteHeader` | `SiteHeader.tsx` | Sticky, blurred-background top nav. Desktop: horizontal nav + login/signup (or "My portfolio" if authenticated) buttons. Mobile: hamburger toggling a slide-down panel. Nav items: Home, About, How it works, Security, FAQ, Contact. |
| `SiteFooter` | `SiteFooter.tsx` | 4-column footer (logo+blurb+supported-assets list, Company links, Client access links, then a legal block: risk disclaimer + placeholder legal notice + copyright). |
| `SiteLayout`, `PageHero` | `SiteLayout.tsx` | `SiteLayout` = header + `<main>` + footer wrapper used by every public page. `PageHero` = the shared eyebrow/title/description banner used at the top of every public page except the homepage (which has its own custom hero). |

### shadcn/ui primitives — [`frontend/src/components/ui/`](../frontend/src/components/ui/)

All 46 files are **stock shadcn/ui `new-york`-style components** (Radix primitives + `class-variance-authority`, unmodified beyond the app's semantic color tokens flowing through automatically) — confirmed by spot-checking `button.tsx` and `badge.tsx` against upstream. No app-specific forks. Add new ones via `pnpm dlx shadcn@2 add <name>` from `/frontend` (not `shadcn@latest` — see CLAUDE.md for why).

| File | Component(s) |
| --- | --- |
| `accordion.tsx` | Accordion (used on FAQ page) |
| `alert-dialog.tsx` | AlertDialog (confirmation dialogs — spec requires these for withdraw/admin-adjust flows) |
| `alert.tsx` | Alert |
| `aspect-ratio.tsx` | AspectRatio |
| `avatar.tsx` | Avatar |
| `badge.tsx` | Badge — `default/secondary/destructive/outline` variants; used for transaction/KYC status pills |
| `breadcrumb.tsx` | Breadcrumb |
| `button.tsx` | Button — `default/destructive/outline/secondary/ghost/link` variants, `default/sm/lg/icon` sizes, `asChild` (Radix `Slot`) for `Link`-as-button |
| `calendar.tsx` | Calendar (react-day-picker wrapper) |
| `card.tsx` | Card (mostly superseded in this app by the `.surface-panel` utility applied directly to `<article>`/`<div>`, but available) |
| `carousel.tsx` | Carousel (embla) — not currently used on any audited page |
| `chart.tsx` | Chart (recharts wrapper/theming helper) — the dashboard overview donut chart uses raw `recharts` directly, not this wrapper |
| `checkbox.tsx` | Checkbox (signup terms acceptance) |
| `collapsible.tsx` | Collapsible |
| `command.tsx` | Command (cmdk palette) — not currently used |
| `context-menu.tsx` | ContextMenu |
| `dialog.tsx` | Dialog — deposit/withdraw modals on the Wallets page |
| `drawer.tsx` | Drawer (vaul) |
| `dropdown-menu.tsx` | DropdownMenu |
| `form.tsx` | Form (react-hook-form + label/error wiring) — not currently used; pages do manual `useState` + zod `safeParse` validation instead (see §5 patterns) |
| `hover-card.tsx` | HoverCard |
| `input-otp.tsx` | InputOTP — not currently used (2FA is "UI only" per spec, not yet built) |
| `input.tsx` | Input |
| `label.tsx` | Label |
| `menubar.tsx` | Menubar |
| `navigation-menu.tsx` | NavigationMenu |
| `pagination.tsx` | Pagination — not currently used (transaction history has no pagination yet) |
| `popover.tsx` | Popover |
| `progress.tsx` | Progress |
| `radio-group.tsx` | RadioGroup |
| `resizable.tsx` | Resizable panels |
| `scroll-area.tsx` | ScrollArea |
| `select.tsx` | Select — transaction filters, currency pickers |
| `separator.tsx` | Separator |
| `sheet.tsx` | Sheet |
| `sidebar.tsx` | Sidebar primitive — not used; the dashboard sidebar in `dashboard.tsx` is hand-built, not this component |
| `skeleton.tsx` | Skeleton — loading placeholders everywhere (wallets grid, transaction rows, overview stats) |
| `slider.tsx` | Slider |
| `sonner.tsx` | Toast (sonner) — global toast notifications, mounted once in `__root.tsx` |
| `switch.tsx` | Switch |
| `table.tsx` | Table — services (assets/fees) and dashboard (transactions) tables |
| `tabs.tsx` | Tabs |
| `textarea.tsx` | Textarea — contact form message field |
| `toggle-group.tsx` | ToggleGroup |
| `toggle.tsx` | Toggle |
| `tooltip.tsx` | Tooltip — used inside the recharts donut chart |

## 4. Page inventory

All public pages are wrapped in `SiteLayout`; all dashboard pages render inside `dashboard.tsx`'s authenticated shell (sidebar nav + KYC-pending banner + `<Outlet/>`).

### Public / marketing

| Route file | URL | Contents |
| --- | --- | --- |
| `routes/index.tsx` | `/` | Custom hero (background image + gradient + hairline grid, headline, CTAs, 4 placeholder stat tiles), supported-currencies strip (live-computed 24h change per asset), 3-step "how it works", trust/custody section + 3 placeholder testimonials, closing CTA banner. |
| `routes/about.tsx` | `/about` | `PageHero`, company story (3 placeholder paragraphs), mission/principles/who-we-serve cards, 4 placeholder team member cards (initials avatar, name, role, bio). |
| `routes/services.tsx` | `/services` | `PageHero`, 3-step custody-model explainer, supported assets/networks table (from `CURRENCIES`), placeholder fee schedule table, CTA. |
| `routes/security.tsx` | `/security` | `PageHero`, 6 operational-control cards (cold storage, multi-party keys, 2FA, identity verification, transaction monitoring, audit trail), KYC/AML statement copy, regulatory disclaimer copy — all explicitly `[PLACEHOLDER]`-marked. |
| `routes/faq.tsx` | `/faq` | `PageHero`, 8-item `Accordion` FAQ, CTA buttons to Contact/Signup. |
| `routes/contact.tsx` | `/contact` | `PageHero`, contact form (name/email/message, zod-validated, inserts into `contact_submissions` via Supabase) with success state, plus static email/phone/office contact cards and a "never share credentials" notice. |

### Auth

| Route file | URL | Contents |
| --- | --- | --- |
| `routes/auth.tsx` | `/auth?mode=login\|signup` | Single page, two modes via search param. Card with full form (name only on signup), password, terms checkbox (signup only), Google OAuth button, "check your inbox" state post-signup, mode-switch link. No `SiteHeader`/`Footer` — standalone layout with just a `Logo` + "back to site" link. |
| `routes/forgot-password.tsx` | `/forgot-password` | Email input → Supabase `resetPasswordForEmail`, "check your inbox" success state. Same standalone layout. |
| `routes/reset-password.tsx` | `/reset-password` | New password + confirm, zod-validated, `supabase.auth.updateUser`, redirects to `/dashboard` on success. Same standalone layout. |

### Dashboard (`/dashboard/*`, auth-gated by `_authenticated/route.tsx`)

| Route file | URL | Contents |
| --- | --- | --- |
| `_authenticated/dashboard.tsx` | (layout) | Sidebar (Overview/Wallets/Transactions/Verification/Profile & settings + sign-out), KYC-pending/rejected warning banner, `<Outlet/>`. |
| `_authenticated/dashboard.index.tsx` | `/dashboard` | Total portfolio value + simulated 24h change, recharts donut allocation chart + legend list, recent-activity feed (last 6 transactions). Skeletons while loading; empty states for zero holdings / zero activity. |
| `_authenticated/dashboard.wallets.tsx` | `/dashboard/wallets` | One card per currency (balance + USD value + Deposit/Withdraw buttons), a Convert panel (from/to/amount, simulated rate), Deposit dialog (QR code via `qrcode`, mock address, min-deposit warning, amount confirmation), Withdraw dialog (address+amount → review/confirm two-step). |
| `_authenticated/dashboard.transactions.tsx` | `/dashboard/transactions` | Filterable (type/status/date) transaction table, skeleton rows, empty state. |
| `_authenticated/dashboard.kyc.tsx` | `/dashboard/kyc` | Current status badge (pending/verified/rejected icon+badge), form (full name/DOB/country + file input for identity doc → Supabase Storage), zod-validated. |
| `_authenticated/dashboard.settings.tsx` | `/dashboard/settings` | Contact details (email read-only, editable full name), security (send password-reset-email button), and a **Support** section (static contact info) — there is no separate Support page/route; support is folded into Settings, unlike the original product brief's separate "Support" nav item. |

### Not yet built (spec exists, no route files)

- **Admin panel** (`/admin/*`) — user list/KYC review/balance adjustment/transaction settlement/stats. Backend logic (`walletService.ts` admin functions, RLS admin policies) already exists; no UI.
- **2FA toggle** — mentioned as "UI only" in the original spec; not present in Settings currently.
- **Standalone Support/ticket page** — folded into Settings (see above).

## 5. Common UI/data patterns

- **Forms**: manual `useState` per field + a zod schema + `safeParse` on submit → per-field error state rendered as `<p role="alert" id="{field}-error">`, wired via `aria-invalid`/`aria-describedby`. The shadcn `Form` component is *not* used anywhere — don't introduce it unless deliberately upgrading the pattern.
- **Mutations**: TanStack Query `useMutation`, success → `sonner` `toast.success` (+ query invalidation), error → `toast.error(e.message)`.
- **Money/number formatting**: always through `frontend/src/lib/market.ts` (`formatUsd`, `formatCrypto`, `formatPercent`) — never inline `toFixed`/`Intl` calls in components. Every numeric value in the DOM gets the `num` utility class.
- **Loading state**: `Skeleton` matching the shape of the eventual content (never a spinner-only state) — see wallets grid, overview stats, transaction rows.
- **Empty state**: always a plain sentence + a relevant CTA link, never a blank container (e.g. "No holdings yet. Fund your first wallet.").
- **Confirmation before fund-moving actions**: the Withdraw dialog has an explicit review → confirm two-step (see `dashboard.wallets.tsx`); any new fund-moving flow (admin adjustment, etc.) should follow the same two-step pattern rather than a single submit.

## 6. Asset inventory

| Asset | Location | Usage |
| --- | --- | --- |
| Wordmark mark | `frontend/src/assets/dwp-mark.png` | `Logo.tsx`, 32×32, imported as a module (Vite asset pipeline) |
| Hero image | `frontend/src/assets/hero-vault.jpg` | Homepage hero background only (`routes/index.tsx`), imported as a module |
| Favicon (ICO) | `frontend/public/favicon.ico` | Browser default favicon resolution |
| Favicon (PNG) | `frontend/public/favicon.png` | Explicitly linked in `__root.tsx` head (`rel="icon" type="image/png"`) |
| `robots.txt` | `frontend/public/robots.txt` | Static, served as-is |
| Icons | [lucide-react](https://lucide.dev) throughout | No custom icon set — every icon in the app is a `lucide-react` import |
