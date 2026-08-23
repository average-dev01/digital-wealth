# Digital Wealth Hub

I'm building a multi-user crypto brokerage web platform for a client called Digital Wealth Partners (placeholder  replace if the real name differs). It's a brokerage/wealth-management style site where visitors learn about the service, then sign up, verify their identity, and manage a multi-currency crypto portfolio from a personal dashboard. Build this as a demo-grade but production-quality-looking MVP: real auth, real database, real-feeling flows, but wallet balances are simulated/admin-managed (details below) rather than connected to a live blockchain.

1. Brand and design direction

Design a premium, trustworthy fintech aesthetic  think institutional wealth management crossed with a modern crypto exchange (Fidelity Digital Assets / Kraken Pro / Robinhood feel, not a flashy "meme coin" look). Specifics:

Dark, sophisticated base palette  deep navy or charcoal backgrounds  with a single confident accent color (gold or electric blue) used sparingly for CTAs, active states, and data highlights. Avoid neon/gradient-heavy "crypto casino" styling.

Clean, modern sans-serif typography (e.g. Inter or similar). Generous whitespace. Numbers/data should use a tabular/monospace-friendly font so balances align.

Subtle motion only  fade/slide-in on scroll, smooth hover states. Nothing gimmicky.

Fully responsive: desktop-first for the dashboard (data-dense), mobile-first for the marketing pages.

Include a placeholder logo (wordmark "Digital Wealth Partners" is fine) and generate a matching favicon.

2. Site structure

Public marketing site (no login required):

Home  hero with value proposition, trust indicators (security badges, "assets under management" style stats, testimonials placeholder), how-it-works in 3 steps, supported currencies strip, CTA to sign up

About  company story, team placeholders, mission

Services / How It Works  explains custody model, deposit flow, fees (use clearly-labeled placeholder numbers)

Security & Compliance  2FA, cold-storage messaging, KYC/AML statement, regulatory disclaimer footer (placeholder legal text, clearly marked as such)

FAQ

Contact  form (name, email, message) that saves to a contact_submissions table

Footer with risk disclaimer: crypto assets are volatile and this is not financial advice (standard brokerage disclaimer boilerplate)

Auth flows:

Sign up (email + password via Supabase Auth), with a required checkbox for Terms/Privacy

Log in

Forgot / reset password

Email verification step

Basic KYC step after signup: collect full name, date of birth, country, and a document-upload placeholder (store metadata only; file upload to Supabase Storage). Status field: pending / verified / rejected. Until verified, show a "verification pending" banner on the dashboard but still let the user explore the UI.

Customer dashboard (auth required, /dashboard/*):

Overview  total portfolio value in USD, per-asset breakdown (donut or bar chart), 24h change (simulated), recent activity feed

Wallets  one card per supported currency (BTC, ETH, USDT, USDC, SOL, BNB, XRP) showing balance in that currency + USD equivalent, with a "Deposit" and "Withdraw" button per asset

Deposit flow  select currency → show a generated-looking deposit address (mock, clearly a realistic-format placeholder string) + QR code + minimum deposit / network warning text + "I've sent my deposit" button that creates a pending transaction row for admin review

Withdraw flow  form to request a withdrawal (address + amount), creates a pending withdrawal request (no real funds move)

Transaction history  table of all deposits/withdrawals/adjustments with status, date, asset, amount, filterable by type/date/status

Portfolio/Convert (optional nice-to-have)  simple UI to simulate converting between two held currencies at a mock exchange rate, updates balances instantly for demo purposes

Profile & Settings  personal info, KYC status, password change, 2FA toggle (UI only if full 2FA is out of scope), notification preferences

Support  simple contact/ticket form

Admin panel (/admin/*, restricted to a role of admin in the profiles table):

User list with KYC status, search/filter

View/approve/reject KYC submissions

Manually credit or adjust a user's wallet balance per currency (this is how "deposits" become real in this simulated model  logs an entry in transactions with created_by_admin)

View and mark deposit/withdrawal requests as completed/rejected

Basic dashboard stats: total users, total simulated AUM, pending KYC count, pending transactions count

3. Data model (Supabase/Postgres)

Please set up tables roughly like:

profiles (id → auth.users, full_name, country, dob, kyc_status, role [user/admin], created_at)

wallets (id, user_id, currency, balance, address [mock string], created_at)

transactions (id, user_id, wallet_id, type [deposit/withdrawal/admin_adjustment/convert], currency, amount, status [pending/completed/rejected], created_at, notes)

kyc_documents (id, user_id, doc_type, storage_path, status, submitted_at)

contact_submissions (id, name, email, message, created_at)

Apply Row Level Security everywhere: users can only read/write their own rows; admins (checked via profiles.role = 'admin') can read/write all rows. Seed one demo user and one admin user with realistic sample balances and transaction history so the dashboard doesn't look empty on first load.

4. Currencies to support

BTC, ETH, USDT, USDC, SOL, BNB, XRP  show each with its standard icon/symbol, correct decimal precision (8 for BTC, etc.), and a plausible mock USD price used to compute portfolio totals.

5. Non-functional requirements

Every list/table needs sensible empty states and loading skeletons, not blank screens.

Every destructive or fund-moving action (withdraw, admin balance edit) needs a confirmation step.

Form validation with clear inline error messages throughout (signup, KYC, deposit/withdraw, contact).

Accessible: proper labels, sufficient color contrast against the dark theme, keyboard-navigable forms.

Clearly label anywhere balances/prices are simulated data internally in code comments (not to the end user) so it's obvious later where real integrations would plug in.

6. Explicit non-goals for this build

Do not attempt to connect to a real blockchain, real wallet infrastructure, or a live price feed/exchange API  use realistic mock data and clearly-structured functions/services (e.g. a walletService layer) so those can be swapped for real integrations later without a rewrite. Do not process real payments.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aa711997-b7ef-4ac4-abe0-b76c091e0a6d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm  [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
