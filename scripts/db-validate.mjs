#!/usr/bin/env node
/**
 * GIKGOK db:validate — structural validation against a local Supabase DB.
 * Asserts: all migrations applied, RLS everywhere, seed present, types file
 * exists. Requires a running local stack (`supabase start`) with migrations
 * applied (`supabase db reset`).
 */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = process.cwd();
const DB_URL =
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const migrationsDir = join(ROOT, "supabase", "migrations");
const migrationVersions = readdirSync(migrationsDir)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .map((f) => f.split("_")[0]);

const failures = [];
const ok = [];

const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 4000 });
try {
  await client.connect();
} catch (err) {
  console.error("db:validate — cannot connect to local database.");
  console.error("Run `npx supabase start` and `npx supabase db reset` first.");
  console.error(String(err.message ?? err));
  process.exit(1);
}

try {
  // 1. All migrations recorded as applied.
  const applied = await client.query("select version from supabase_migrations.schema_migrations");
  const appliedSet = new Set(applied.rows.map((r) => r.version));
  const missing = migrationVersions.filter((v) => !appliedSet.has(v));
  if (missing.length) failures.push(`Migrations not applied: ${missing.join(", ")}`);
  else ok.push(`All ${migrationVersions.length} migrations applied.`);

  // 2. RLS enabled on every public base table.
  const noRls = await client.query(`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1`);
  if (noRls.rowCount) failures.push(`Tables missing RLS: ${noRls.rows.map((r) => r.relname).join(", ")}`);
  else {
    const cnt = await client.query(`
      select count(*)::int as n from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r'`);
    ok.push(`RLS enabled on all ${cnt.rows[0].n} public tables.`);
  }

  // 3. Every API-reachable public table has at least one policy.
  //    Tables intentionally locked to service_role only (no anon/authenticated
  //    grants) may have zero policies — that is deny-all, not a misconfiguration.
  const apiPrivPred = ["SELECT", "INSERT", "UPDATE", "DELETE"]
    .flatMap((p) => [
      `has_table_privilege('authenticated', c.oid, '${p}')`,
      `has_table_privilege('anon', c.oid, '${p}')`,
    ])
    .join(" or ");
  const noPolicy = await client.query(`
    select c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and not exists (select 1 from pg_policy p where p.polrelid=c.oid)
      and (${apiPrivPred})
    order by 1`);
  if (noPolicy.rowCount) failures.push(`API-reachable tables with RLS but no policy: ${noPolicy.rows.map((r) => r.relname).join(", ")}`);
  else ok.push("Every API-reachable public table has at least one RLS policy.");

  const lockedDown = await client.query(`
    select c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and not exists (select 1 from pg_policy p where p.polrelid=c.oid)
      and not (${apiPrivPred})
    order by 1`);
  if (lockedDown.rowCount) ok.push(`Deny-all tables (service_role only): ${lockedDown.rows.map((r) => r.relname).join(", ")}`);

  // 4. Seed reference data present.
  const checks = [
    ["system_settings", "select count(*)::int n from public.system_settings", 1],
    ["games", "select count(*)::int n from public.games", 3],
    ["game_versions", "select count(*)::int n from public.game_versions", 3],
    ["role_permissions", "select count(*)::int n from public.role_permissions", 1],
  ];
  for (const [label, sql, min] of checks) {
    const r = await client.query(sql);
    if (r.rows[0].n < min) failures.push(`Seed check failed: ${label} has ${r.rows[0].n} (< ${min})`);
  }
  ok.push("Seed reference data present (settings, games, versions, role permissions).");

  // 5. Storage buckets created.
  const buckets = await client.query("select id from storage.buckets order by 1");
  const want = ["avatars", "game-assets", "ticket-attachments"];
  const have = buckets.rows.map((r) => r.id);
  const missingBuckets = want.filter((b) => !have.includes(b));
  if (missingBuckets.length) failures.push(`Missing storage buckets: ${missingBuckets.join(", ")}`);
  else ok.push("Storage buckets present: " + want.join(", "));

  // 6. Generated types file exists and is non-trivial.
  const typesFile = join(ROOT, "src", "lib", "supabase", "types.gen.ts");
  if (!existsSync(typesFile) || readFileSync(typesFile, "utf8").length < 500) {
    failures.push("Generated types file missing/empty (run `npm run db:types`).");
  } else ok.push("Generated database types present.");
} finally {
  await client.end();
}

console.log("GIKGOK db:validate");
for (const line of ok) console.log(`  ✓ ${line}`);
if (failures.length) {
  console.error("\nDB VALIDATE FAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("\n✓ db:validate passed");
