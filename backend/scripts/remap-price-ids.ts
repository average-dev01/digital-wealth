/**
 * Re-resolves every live currency's `externalPriceId` against the currently
 * selected provider.
 *
 * Provider asset ids are not portable  Bitcoin is "btc-bitcoin" on Coinpaprika
 * and "bitcoin" on CoinGecko  so switching `PRICE_PROVIDER` leaves the whole
 * catalogue unpriced until the ids are remapped. This does that by symbol.
 *
 *   pnpm --filter backend price-ids:remap           # dry run, prints the plan
 *   pnpm --filter backend price-ids:remap --apply   # writes it
 *
 * Anything ambiguous is reported rather than guessed: picking the wrong
 * same-ticker asset would silently mis-price real customer balances.
 */
import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { getPriceProvider } from "../src/lib/priceProviders";

const apply = process.argv.includes("--apply");

async function main(): Promise<void> {
  const provider = getPriceProvider();
  const currencies = await prisma.currency.findMany({
    where: { priceSource: "live" },
    orderBy: { symbol: "asc" },
    select: { id: true, symbol: true, name: true, externalPriceId: true },
  });

  if (currencies.length === 0) {
    console.log("No live currencies to remap.");
    return;
  }

  console.log(`Remapping ${currencies.length} live currencies onto "${provider.name}"`);
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (pass --apply to write)\n");

  let matched = 0;
  let ambiguous = 0;

  for (const currency of currencies) {
    let hits;
    try {
      hits = await provider.searchAssets(currency.symbol);
    } catch (error) {
      console.log(`  ${currency.symbol.padEnd(6)} SEARCH FAILED  ${String(error)}`);
      ambiguous += 1;
      continue;
    }

    const exact = hits.filter((hit) => hit.symbol.toUpperCase() === currency.symbol.toUpperCase());

    if (exact.length === 0) {
      console.log(`  ${currency.symbol.padEnd(6)} NO MATCH  link it by hand in /admin/currencies`);
      ambiguous += 1;
      continue;
    }

    // More than one asset can share a ticker. The best-ranked one is almost
    // always right, but "almost always" is not good enough to apply silently.
    const best = exact.reduce((a, b) => (a.rank > 0 && a.rank <= b.rank ? a : b));

    if (exact.length > 1) {
      const others = exact
        .filter((hit) => hit.externalId !== best.externalId)
        .map((hit) => hit.externalId)
        .join(", ");
      console.log(
        `  ${currency.symbol.padEnd(6)} AMBIGUOUS  picking ${best.externalId} (#${best.rank}); also matched: ${others}`,
      );
    }

    if (best.externalId === currency.externalPriceId) {
      console.log(`  ${currency.symbol.padEnd(6)} unchanged (${best.externalId})`);
      continue;
    }

    console.log(
      `  ${currency.symbol.padEnd(6)} ${currency.externalPriceId ?? "(none)"} -> ${best.externalId}`,
    );
    matched += 1;

    if (apply) {
      await prisma.currency.update({
        where: { id: currency.id },
        // Clear the stale price stamp so the next refresh is obviously fresh,
        // and drop the old provider's logo so the backfill re-fetches it.
        data: { externalPriceId: best.externalId, priceUpdatedAt: null, iconUrl: null },
      });
    }
  }

  console.log(
    `\n${apply ? "Updated" : "Would update"} ${matched} currencies. ${ambiguous} need attention.`,
  );
  if (!apply && matched > 0) console.log("Re-run with --apply to write these changes.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
