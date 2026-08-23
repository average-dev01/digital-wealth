# Admin panel  build progress

Status as of **2026-08-16**. Built, wired to the real backend, and walked
end-to-end in a browser.

Legend: `[x]` built and runtime-verified · `[~]` built, not runtime-verified · `[ ]` not started

---

## STEP 1  API layer

Every file below now calls the real backend; the localStorage mock (`mock-db.ts`)
has been deleted.

- [x] `lib/api/currencies.ts`  `getAllCurrencies()` (incl. inactive), `listCurrencies()` (public read), `createCurrency`, `updateCurrency`, `deactivateCurrency` → `/admin/currencies` + `/currencies`
- [x] `lib/api/walletAddresses.ts`  `getWalletAddresses`, `createWalletAddress`, `updateWalletAddress` → `/admin/wallet-addresses`
- [x] `lib/api/adminUsers.ts`  `getUsers(filters)` (server-side search/filter/pagination), `getUserDetail`, `updateUser`, `updateUserKyc`, `adjustUserBalance` → `/admin/users`
- [x] `lib/api/adminTransactions.ts`  `getPendingTransactions(type)`, `reviewTransaction` → `/admin/transactions`
- [x] `lib/api/adminDashboard.ts`  `getDashboardStats()` → `/admin/dashboard/stats`, computed with SQL aggregates against admin-editable prices
- [x] **No seed data.** `prisma/seed.ts` creates the admin account and nothing else. Currencies, addresses, customers and balances are all created through real use.

### Credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@digitalwealth.example` | `admin1234` |
| Customer |  | sign up through the app |

## STEP 2  Route protection

- [x] `app/(authenticated)/admin/layout.tsx` gates every `/admin/*` route
  - **Redirect**, consistently, no 404s  signed-out → `/auth?mode=login`, signed-in non-admin → `/dashboard`
  - Role comes from `GET /auth/me`'s `isAdmin`, never a nav flag; admin content never renders for a non-admin, including during the redirect frame
  - Enforced server-side too: `requireAdmin` guards every `/admin/*` route, so the client guard is convenience, not security

## STEP 3  Screens

- [x] **Dashboard** (`/admin`)  4 stat cards, skeletons, error state
- [x] **Currencies** (`/admin/currencies`)  table incl. inactive (dimmed + Inactive badge), create/edit dialog, deactivate behind an `AlertDialog`
- [x] **Wallet addresses** (`/admin/wallet-addresses`)  table + create/edit dialog (currency, address, network, active toggle)
- [x] **Users** (`/admin/users`)  search + KYC filter + status filter + pagination; detail at `/admin/users/[id]`
  - [x] Approve / reject KYC  confirmation dialog
  - [x] Suspend / reactivate  confirmation dialog (suspension also revokes live sessions)
  - [x] Adjust balance  currency + amount + note, two-step review → confirm
- [x] **Deposit queue** (`/admin/deposits`)  approve/reject behind confirmation
- [x] **Withdrawal queue** (`/admin/withdrawals`)  Complete / Reject, each behind a single confirmation. Completing debits the wallet; the admin sends the funds manually beforehand, and the app records the payout rather than performing it
- [x] Loading skeletons + empty states on every screen

## STEP 4  Verify

- [x] `tsc --noEmit` clean, `eslint src` 0 errors, `next build` all 23 routes
- [x] 38 backend tests (`vitest` + `supertest`) covering auth, catalogue, and every money-moving path
- [x] **Full browser walkthrough against a freshly reset database**  admin logs in and lands on `/admin`; creates two currencies and two deposit addresses from an empty catalogue; a new customer signs up and gets a zero-balance card per listed asset; declares a deposit and sees the admin-published address; admin approves it and the balance moves; a withdrawal is requested and rejected with the balance untouched; a conversion settles at the admin-set price; admin approves KYC; a customer is bounced off `/admin`; the overview reports the real figures.

---

## Known seams / decisions

1. **Currency catalogue vs. `lib/market.ts`  closed.** The `currencies` table is the source of truth for which assets exist *and* for their display metadata. Customer screens resolve name/glyph/decimals/price through `useCurrencies()` (public `GET /currencies`), so an admin-created asset renders correctly immediately. `market.ts` now holds only pure formatters plus `MARKETING_ASSETS`, a static list used solely by the statically-prerendered public marketing pages  those can't call a backend at build time. Don't use it for signed-in screens.
2. **Login route is `/auth?mode=login`**, not `/login` as the brief said. Used the route that exists.
3. **Suspended users are refused a session at login**, and suspending also revokes their existing refresh tokens  otherwise they keep browsing on current cookies until the access token happens to expire.
4. **Reactivating a currency** is done via the Active toggle in its edit form; there's no separate row action.
5. **Deactivating a currency is customer-visible but non-destructive**: a customer holding that asset keeps the card and the balance and can still withdraw; only new deposits are closed off, and new signups stop being provisioned that wallet.
6. **Deposit proof-of-payment was dropped.** The old `ProofViewerDialog` only ever rendered seeded placeholder images  there was never an upload path behind it. Admins review deposits on the claimed amount.
7. **No per-asset minimum deposit.** It was invented client-side with no column behind it, so it was removed rather than faked.

## Noticed but NOT built

- No pending-count badges on the admin sidebar nav.
- No audit log of *which* admin performed an action (`createdByAdmin` is recorded, the identity is not).
- No on-chain transaction reference is recorded anywhere. Withdrawal completion used to prompt for one, but it was never displayed back to anyone, so it was removed along with the `Transaction.txHash` column.
- All four auth endpoints share one per-IP rate-limit bucket, so repeated failed logins also block password reset. Worth splitting if it bites.
