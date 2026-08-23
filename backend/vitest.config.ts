import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    // All test files share one Postgres database  run them one at a time to
    // avoid cross-file truncate/insert races.
    fileParallelism: false,
  },
});
