import { test, expect } from "@playwright/test";

/**
 * Placeholder E2E smoke — skipped until a running app + env are available.
 * Critical journeys land in Phase 11.
 */
test.describe("baseline", () => {
  test.skip("welcome page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /GIKGOK/i })).toBeVisible();
  });
});
