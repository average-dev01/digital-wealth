import "dotenv/config";

import { createApp } from "./app";
import { startPriceFeed } from "./lib/priceFeed";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

// Started here rather than in `createApp()` on purpose: the test suite builds
// the app directly, and a polling timer there would make outbound HTTP calls
// on every vitest run.
startPriceFeed();

app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
});
