/**
 * Runs one price refresh and exits — handy for checking the feed without
 * starting the server, and for a cron-driven deployment that would rather not
 * rely on the in-process timer.
 *
 *   pnpm --filter backend price-feed:refresh
 */
import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { refreshPrices } from "../src/lib/priceFeed";

refreshPrices()
  .then((run) => {
    console.log(JSON.stringify(run, null, 2));
    if (run.error) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
