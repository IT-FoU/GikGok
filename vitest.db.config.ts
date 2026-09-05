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
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
