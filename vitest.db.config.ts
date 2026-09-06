import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Database/RLS tests run in a Node environment against a local Supabase
 * Postgres. Kept separate from the jsdom unit suite.
 * Run with: `npm run db:test` (requires `supabase start`).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/db/**/*.{test,spec}.ts"],
    // Shared staging fixtures (PLAYER_A / ADMIN_CREDIT) are mutated with COMMITs
    // in several suites. Parallel files race on credit_requests_one_open,
    // admin_user_permissions, and player_contacts → flaky CI. Serialize.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
