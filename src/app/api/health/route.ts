import { NextResponse } from "next/server";

import { logEvent } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

/**
 * Lightweight health endpoint for deploy smoke tests and uptime checks.
 * Does not expose secrets or internal topology.
 */
export async function GET() {
  const payload = {
    ok: true,
    service: "gikgok",
    demoCreditsOnly: true,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
  };

  logEvent("info", "health.check", { ok: true });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
