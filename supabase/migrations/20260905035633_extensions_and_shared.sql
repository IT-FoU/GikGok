-- GIKGOK — extensions and shared helper functions
-- Demo-credit-only platform. No real-money/payment/wallet features exist in this schema.

-- Extensions (installed into the dedicated `extensions` schema per Supabase convention).
create extension if not exists "citext" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

-- Maintain updated_at on row modification.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger helper: stamps updated_at = now() on UPDATE.';

-- Block UPDATE/DELETE on append-only tables (enforced for every role, including
-- privileged/service_role, because it runs as a table trigger rather than RLS).
create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Rows in % are immutable and cannot be % ed',
    tg_table_name, lower(tg_op)
    using errcode = 'restrict_violation';
  return null;
end;
$$;

comment on function public.prevent_mutation() is
  'Trigger helper: raises on UPDATE/DELETE to enforce append-only tables (e.g. the ledger).';

-- These helpers take no user input and are safe to expose to SQL trigger use only;
-- revoke direct EXECUTE from API roles to keep the surface minimal.
revoke all on function public.set_updated_at() from public;
revoke all on function public.prevent_mutation() from public;
