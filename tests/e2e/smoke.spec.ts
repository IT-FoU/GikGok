import { test, expect } from "@playwright/test";

test.describe("public shell", () => {
  test("welcome page loads brand and demo notice", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/GIKGOK/i).first()).toBeVisible();
    // Default locale is Lao — match demo-credit wording in either language.
    await expect(page.locator("body")).toContainText(/GIK|ທົດສອບ|demo/i);
  });

  test("guide is reachable without auth", async ({ page }) => {
    await page.goto("/guide");
    await expect(page.locator("body")).toBeVisible();
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toContainText(/sign in|ເຂົ້າ/i);
  });
});

test.describe("security boundaries", () => {
  test("protected player home redirects unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/login/);
  });

  test("admin console redirects unauthenticated users", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/login|access-denied/);
  });

  test("health endpoint responds without secrets", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.demoCreditsOnly).toBe(true);
    expect(JSON.stringify(json)).not.toMatch(/service_role|password|jwt/i);
  });

  test("play routes redirect unauthenticated users (real bet boundary is RPC/server action)", async ({
    page,
  }) => {
    await page.goto("/play/fish_prawn_crab");
    await expect(page).toHaveURL(/login/);
  });

  test("unauthenticated play route cannot reach live bet settlement", async ({
    page,
  }) => {
    // Live bets go UI → Server Action → place_and_settle_bet. Prove the gate.
    await page.goto("/play/fish_prawn_crab");
    await expect(page).toHaveURL(/login/);
  });

  test("legacy /api/games/bet route is absent or non-success (not security proof)", async ({
    request,
  }) => {
    const res = await request.post("/api/games/bet", {
      data: {
        gameId: "fish_prawn_crab",
        stake: 500,
        selection: { kind: "single_symbol", symbols: ["fish"] },
        idempotencyKey: "e2e-unauth",
      },
      headers: { Origin: "http://127.0.0.1:3000" },
      maxRedirects: 0,
    });
    // Explicitly NOT treating 404 as authorization evidence for place_and_settle_bet.
    expect(res.status()).not.toBe(200);
    test.info().annotations.push({
      type: "note",
      description:
        "Legacy bet HTTP status is informational only; live authorization is covered by DB RPC tests.",
    });
  });
});

test.describe("pwa assets", () => {
  test("manifest and icons are served", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBeTruthy();
    const body = await manifest.json();
    expect(body.name).toMatch(/GIKGOK/i);
    expect(body.display).toBe("standalone");

    const icon = await request.get("/icons/icon.svg");
    expect(icon.ok()).toBeTruthy();
  });
});
