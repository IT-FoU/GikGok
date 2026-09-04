export { createBrowserSupabaseClient } from "./browser";
export type {
  Database,
  Tables,
  LedgerEntryType,
  PlayerStatus,
  SettlementMode,
} from "./types";

/** Prefer path imports for server clients:
 *  - `@/lib/supabase/server`
 *  - `@/lib/supabase/admin`
 *  - `@/lib/supabase/route`
 */
