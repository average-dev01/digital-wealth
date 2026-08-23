# Adding a price provider

Everything the app needs from a market data source is the `PriceProvider`
interface in [`types.ts`](./types.ts)  three methods. Nothing outside this
folder knows which provider is in use.

## The three methods

| Method | Called from | How often |
| --- | --- | --- |
| `fetchQuotes(ids)` | `lib/priceFeed.ts` | once per refresh (every `PRICE_REFRESH_INTERVAL_MS`) |
| `searchAssets(query)` | `GET /admin/price-feed/search` | on each keystroke in the admin asset picker (debounced, rate limited) |
| `fetchProfile(id)` | currency link + logo backfill | once per currency, ever |

**`fetchQuotes` must batch.** Cost has to stay flat as the catalogue grows, or a
free tier runs out. Coinpaprika does this by pulling the full ticker list in one
call and filtering locally; CoinGecko would use `/simple/price?ids=a,b,c`. Never
loop one call per currency on this path.

Ids the provider doesn't recognise are **omitted from the result**, not thrown 
one bad id must not cost every other currency its price update.

## Recipe

1. **Write `<provider>.ts`.** Use `getJson`, `toNumber` and `toDate` from
   [`http.ts`](./http.ts)  they handle timeouts, non-2xx, numeric strings and
   junk timestamps. Export a `const` satisfying `PriceProvider`.

2. **Register it**  one line in [`index.ts`](./index.ts):

   ```ts
   const providers: Record<string, PriceProvider> = {
     [coinpaprikaProvider.name]: coinpaprikaProvider,
     [coingeckoProvider.name]: coingeckoProvider, // <- added
   };
   ```

3. **Add it to the contract test**  one line in
   `src/__tests__/priceProviderContract.test.ts`. That suite stubs `fetch` and
   asserts the behaviour `lib/priceFeed.ts` relies on, so a new provider is
   covered without writing new tests.

4. **Switch to it**: `PRICE_PROVIDER=coingecko` in `.env`, then remap ids (below).

That's the whole change. No route, schema, or frontend edit.

## The one real gotcha: ids are not portable

`Currency.externalPriceId` holds a **provider-specific** id  Bitcoin is
`btc-bitcoin` on Coinpaprika and `bitcoin` on CoinGecko. Switching providers
without remapping leaves every live currency unpriced (they'd show up as
`missing` in the `[price-feed]` log and keep their last known price).

Remap with the helper script rather than by hand:

```sh
pnpm --filter backend price-ids:remap            # dry run  prints the plan
pnpm --filter backend price-ids:remap --apply    # writes it
```

It resolves each live currency by symbol through the *new* provider's
`searchAssets`, takes an exact symbol match, and reports anything ambiguous for
you to fix in the admin panel.

## If you ever need two providers at once

Today one provider serves the whole catalogue. Per-currency providers would mean
adding a `priceProvider` column to `Currency` and grouping by it in
`refreshPrices()` before dispatching. Deliberately not built  it buys nothing
until there is a real need for it.
