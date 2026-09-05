#!/usr/bin/env node
/**
 * GIKGOK security checks.
 *
 * Static (always): no service-role/secret keys leak into client code.
 * Database (when a local Supabase DB is reachable):
 *   - RLS enabled on every public base table
 *   - every SECURITY DEFINER function pins search_path
 *   - no SECURITY DEFINER function grants EXECUTE to PUBLIC
 *   - every public view uses security_invoker
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = process.cwd();
const failures = [];
const notes = [];

// --------------------------------------------------------------------------
// Static repository checks
// --------------------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const SERVER_ONLY_ALLOWED = [
  join("src", "lib", "env", "server.ts"),
  join("src", "lib", "supabase", "admin.ts"),
];

const srcFiles = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));

for (const file of srcFiles) {
  const rel = file.slice(ROOT.length + 1);
  const text = readFileSync(file, "utf8");

  // Hardcoded Supabase secret keys must never appear anywhere in source.
  if (/sb_secret_[A-Za-z0-9_-]/.test(text)) {
    failures.push(`Hardcoded Supabase secret key found in ${rel}`);
  }
  // Legacy service-role JWT patterns.
  if (/service_role[^A-Za-z]/.test(text) && !SERVER_ONLY_ALLOWED.includes(rel)) {
    // allow the word in comments of server-only files only
    if (!/\.test\.|\.spec\./.test(rel)) {
      failures.push(`Reference to service_role outside server-only modules: ${rel}`);
    }
  }
  // The service-role env var may only be read in server-only modules.
  if (text.includes("SUPABASE_SERVICE_ROLE_KEY") && !SERVER_ONLY_ALLOWED.includes(rel)) {
    failures.push(`SUPABASE_SERVICE_ROLE_KEY referenced outside server-only modules: ${rel}`);
  }
  // Client bundles must not import the admin client.
  if (/["']@\/lib\/supabase\/admin["']/.test(text) && rel !== join("src", "lib", "supabase", "admin.ts")) {
    if (rel.includes(join("app", "(player)")) || /browser\.ts$/.test(rel)) {
      failures.push(`Admin Supabase client imported into client code: ${rel}`);
    }
  }
}

// --------------------------------------------------------------------------
// Database checks (best-effort; skipped when DB is unreachable)
// --------------------------------------------------------------------------
const DB_URL =
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function dbChecks() {
  const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch {
    notes.push("Local database unreachable — skipped DB security checks (run `supabase start`).");
    return;
  }
  try {
    const noRls = await client.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by 1`);
    if (noRls.rowCount > 0) {
      failures.push(`Tables without RLS: ${noRls.rows.map((r) => r.relname).join(", ")}`);
    } else {
      notes.push("RLS enabled on all public base tables.");
    }

    const secdef = await client.query(`
      select p.proname, p.proconfig, p.proacl::text as acl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef`);
    for (const row of secdef.rows) {
      const hasPath = (row.proconfig ?? []).some((c) => c.startsWith("search_path="));
      if (!hasPath) failures.push(`SECURITY DEFINER function without pinned search_path: ${row.proname}`);
      // proacl null => default (PUBLIC has EXECUTE); or explicit '=X/...' grant to PUBLIC.
      if (row.acl == null || /(^|,)=[A-Za-z]*X/.test(row.acl)) {
        failures.push(`SECURITY DEFINER function executable by PUBLIC: ${row.proname}`);
      }
    }

    // anon must never execute SECURITY DEFINER RPCs (Supabase default privileges
    // historically re-granted EXECUTE to anon/authenticated on CREATE).
    const anonExec = await client.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    if (anonExec.rowCount > 0) {
      failures.push(
        `SECURITY DEFINER executable by anon: ${anonExec.rows.map((r) => r.proname).join(", ")}`,
      );
    } else {
      notes.push("No SECURITY DEFINER functions are executable by anon.");
    }

    notes.push(`Checked ${secdef.rowCount} SECURITY DEFINER functions.`);

    const views = await client.query(`
      select c.relname, c.reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'`);
    for (const v of views.rows) {
      const opts = v.reloptions ?? [];
      const invoker = opts.some((o) => /^security_invoker=(true|on)$/i.test(o));
      if (!invoker) failures.push(`View without security_invoker: ${v.relname}`);
    }
    notes.push(`Checked ${views.rowCount} public views for security_invoker.`);
  } finally {
    await client.end();
  }
}

await dbChecks();

// --------------------------------------------------------------------------
console.log("GIKGOK security:check");
for (const n of notes) console.log(`  - ${n}`);
if (failures.length) {
  console.error("\nSECURITY CHECK FAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("\n✓ security:check passed");
