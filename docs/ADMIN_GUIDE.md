# Admin guide — currencies and deposit addresses

How to set up the assets your customers can hold, and the addresses they send
funds to. These two screens are where the whole system starts: until you use
them, customers have nothing to deposit into.

Sign in at `/auth?mode=login` with the administrator account (email/password
from the `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars used when seeding — see
`docs/RAILWAY_DEPLOY.md`; defaults to `admin@digitalwealth.example` /
`admin1234` in local dev) and you'll land on `/admin`.

---

## The one rule

**Currency first → then a deposit address → then customers can deposit.**

```
Add a currency  ──►  Publish an address  ──►  Customer sees a wallet card
                                              and somewhere to send funds
```

Each step is blocked until the one before it is done:

- **Add address** is greyed out until at least one currency exists.
- A customer sees **no wallet cards at all** until an active currency exists.
- The deposit dialog shows an **empty state** — not an address — until you've
  published one for that asset.

On a brand-new database the admin overview reads `0 users / $0.00 AUM / 0
pending`. That's correct, not a fault. There is no demo data: everything you
see from here on is something you or a customer actually did.

---

## Creating a currency

**Currencies → Add currency.**

| Field | Rule | What it affects |
| --- | --- | --- |
| **Symbol** | 2–10 letters or digits, no spaces | The ticker (`BTC`). Saved uppercase automatically. Must be unique — a duplicate is rejected |
| **Icon** | Optional, short glyph | Fallback shown beside the symbol when the asset has no logo (`₿`, `Ξ`, `$`…). A live asset pulls its real logo automatically |
| **Name** | 2 characters or more | The full name customers see under the ticker (`Bitcoin`) |
| **Live market price** | Toggle, **on by default** | On: the price comes from the market data feed. Off: you type it yourself |
| **Market asset** | Required when live | Which real asset to price from — search and pick it. See below |
| **USD price** | Required when *not* live, greater than zero | Drives every USD figure in the app — see below |
| **Decimals** | Whole number, 0–18 | How many decimal places balances display and round to. 8 suits most coins, 2 suits stablecoins |
| **Active** | Toggle, on by default | Inactive assets stay in history but aren't offered to customers |

### Live pricing — picking the right asset

Type the name or ticker into **Market asset** and choose from the list. Each
result shows the ticker, the full name and its market rank.

**Pick carefully.** Searching "bitcoin" returns Bitcoin (#1), Wrapped Bitcoin
(#18) and Bitcoin Cash (#27) — three different assets at three very different
prices. The list is ranked, so the real one is usually first, but the app will
never guess for you: linking the wrong asset would silently mis-price every
customer balance held in it.

Once linked, the price, the 24h change and the asset's logo are fetched
immediately, then refreshed automatically every few minutes. The **Price**
column becomes read-only, and the **Updated** column shows how long ago it last
moved.

### When to use manual pricing instead

Turn **Live market price** off when:

- the asset has no real market (a demo or test asset you invented),
- the feed is misbehaving and you need to pin a price temporarily.

A manual currency is never touched by the feed. Its **24h** column stays `—`,
because there is no real market to measure a change against.

### What the price actually controls

It isn't cosmetic. Whether it comes from the feed or from you, the price is used for:

- the `≈ $…` figure under each customer balance,
- the **USD value shown while a customer is typing a deposit amount**,
- the USD value on deposit and withdrawal review screens,
- the **AUM** total on the admin overview.

### If prices look stale

Hit **Refresh prices** in the header. The toast reports what happened:

- *Updated N prices* — normal.
- *N not found* — the feed had no quote for that asset. Check the **Market
  asset** link is still right; very obscure assets may be outside the free
  tier's coverage.
- *N unlinked* — a currency is set to live but has no market asset picked. Edit
  it and choose one.

If the feed is down entirely, nothing breaks: every currency keeps its last
known price, and the **Updated** column shows the figures ageing. Prices never
drop to zero because a provider had a bad day.

### What happens once you save

- **New signups** are provisioned a zero-balance wallet for the asset straight away.
- **Existing customers** pick it up the next time they open their Wallets page.
  If someone's already logged in and doesn't see a new asset, they just need to
  revisit that page.

Balances always start at **zero**. Nothing is pre-funded — money only arrives
through an approved deposit or a manual balance adjustment.

---

## Editing and deactivating a currency

Editing is safe. Name, icon, decimals, price source and price all update everywhere on the
next load; balances and history are untouched.

**There is no delete.** Currencies are deactivated, never removed, so existing
balances and transaction history stay readable. Deactivate from the row action,
or by turning **Active** off in the edit form.

### What deactivating actually does

This one surprises people, so precisely:

What a customer sees depends on whether they actually hold any of it:

| | Effect |
| --- | --- |
| Wallet card, **empty balance** | **Disappears** from their dashboard |
| Wallet card, **balance held** | **Stays visible**, marked as delisted |
| Deposit button | **Disabled**, with a "no longer accepting deposits" note |
| Withdraw button | **Still works** — they can get their funds out |
| Existing balance | Untouched |
| New signups | No longer provisioned a wallet for it |
| Transaction history | Unchanged |

The split is deliberate. An empty card for an asset you no longer offer is just
clutter, so it goes. A card with a balance is the customer's money — hiding it
would strand the funds with no way to reach the Withdraw button. Once they
withdraw down to zero, the card disappears on its own.

It's a delisting, not a deletion — customers can always retrieve what they
hold. To bring it back, open the currency and switch **Active** on again; any
customer who still held a balance keeps it, and empty cards reappear.

---

## The wallet address section

**Wallet addresses** holds the deposit addresses the desk publishes. The
important thing to understand:

> There is **one shared address per currency**, used by every customer — not a
> unique address per person.

When a customer opens the Deposit dialog, they're shown the currently active
address for that asset, rendered as a copyable string and a scannable QR code.

### Adding an address

**Wallet addresses → Add address.** (Greyed out if you haven't created a
currency yet.)

| Field | Rule | Notes |
| --- | --- | --- |
| **Currency** | Required | The dropdown lists every currency; inactive ones are marked `(inactive)` |
| **Network** | 2 characters or more | The chain, e.g. `Ethereum (ERC-20)`. Shown to the customer as what to send on — worth being precise, since sending on the wrong chain loses funds |
| **Deposit address** | 12 characters or more | The address itself |
| **Active** | Toggle, on by default | Only active addresses are handed out |

The network label isn't decorative — it's the text the customer reads before
sending, both in the dialog header and the warning box.

---

## Rotating an address

You can hold **several addresses per currency**. Only one is ever served to
customers: the **most recently created active** one.

To rotate safely:

1. **Add the new address** (Active on). It takes over immediately.
2. **Then deactivate the old one** — open it and switch Active off.

Do it in that order. If you deactivate the old address first, there's a window
where no active address exists and customers get the empty state instead of
somewhere to send funds.

As with currencies, there's **no delete** — only deactivate. Old addresses stay
on record.

---

## Reviewing deposits and withdrawals

Money only moves when you approve it. Both queues work the same way: a request
sits as **pending** until you act on it, and nothing changes until you do.

### Deposits

A customer sends funds to your published address and then tells the app how
much they sent. That claim lands in **Deposits**.

Check the amount actually arrived in the desk's wallet, then:

| Action | Effect |
| --- | --- |
| **Approve** | Credits the customer's balance by the claimed amount |
| **Reject** | Marks the request rejected. Nothing is credited |

The app has no way to see the blockchain — approving is you vouching that the
funds arrived. Verify before you approve.

### Withdrawals

A customer requests a payout to a destination address. **Nothing is sent
automatically** — the app has no wallet and cannot move funds.

The order matters:

1. **Send the funds yourself**, from the desk's wallet to the destination
   address shown on the request. Check it against the customer's verified
   details first; outbound transfers can't be reversed.
2. **Then click Complete** and confirm.

| Action | Effect |
| --- | --- |
| **Complete** | Debits the customer's balance. Use this *after* you've sent |
| **Reject** | Marks it rejected. Balance untouched — no funds ever left |

Completing before you've actually sent leaves the customer's balance reduced
with no payout received, so keep to that order.

A withdrawal can also be refused automatically: if the customer's balance no
longer covers it (say they requested two payouts and you approved the first),
completing the second is blocked rather than pushing them negative.

### Adjusting a balance directly

**Users → the customer → Adjust balance** credits or debits without going
through either queue — for corrections and goodwill. It requires a note, and
won't let you push a balance below zero. Every adjustment is written to the
customer's transaction history, visible to them.

---

## The account keyword

Each customer is issued a unique **account keyword** (12 or 24 words) through
your separate delivery service, and enters it once on their **Account keyword**
page. It is an identifier that ties a customer to your records — **not** a
password and **not** a wallet recovery phrase; it grants no access to anything.

On **Users → the customer**, the **Account keyword** card shows what they
submitted (or "not submitted yet"). The customer's own field locks after one
submission, so if they entered it wrong, use **Reset keyword** on that card —
it clears the value and lets them enter it again. Nothing else changes.

---

## Quick reference

| What you're seeing | Why |
| --- | --- |
| **Add address** is greyed out | No currency exists yet — create one first |
| Customer has no wallet cards at all | No **active** currency exists |
| Deposit dialog shows an empty state instead of an address | No active address published for that asset |
| A new currency isn't showing for an existing customer | They need to revisit their Wallets page |
| The **Convert** panel is missing for customers | It needs at least **two** active currencies |
| Admin overview shows all zeros | Correct on a fresh database — there's no demo data |
| "A currency with the symbol X already exists" | Symbols are unique; edit the existing one instead |
| Customer's balance looks wrong in USD | Check the currency's price and its **Source**. If it says Manual, you set that number; if Live, check **Market asset** points at the right one |
| Customer says their account keyword is wrong and locked | Use **Reset keyword** on their user page; they can then re-enter it |

---

## A worked example

Setting up Bitcoin from scratch:

1. **Currencies → Add currency** — Symbol `BTC`, Icon `₿`, Name `Bitcoin`,
   Decimals `8`, **Live market price** on, **Market asset** `BTC — Bitcoin (#1)`, Active on. Save.
2. **Wallet addresses → Add address** — Currency `BTC — Bitcoin`, Network
   `Bitcoin`, Deposit address `bc1q…`, Active on. Save.
3. Sign up a customer in another browser. They now see a **BTC / Bitcoin** card
   at `0.00`, and the Deposit dialog shows your `bc1q…` address on the
   `Bitcoin` network.
4. They declare a deposit; it lands in **Deposits** for you to approve. On
   approval their balance moves.

Add a second currency (say `USDT` at `1`) and the Convert panel appears for
customers, priced off the live market.
