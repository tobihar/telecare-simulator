create extension if not exists pgcrypto;

create table if not exists public.simulation_results (
  id uuid primary key default gen_random_uuid(),
  client_run_id text unique,
  username text not null check (char_length(username) between 2 and 80),
  created_at timestamptz not null default now(),
  case_name text not null,
  difficulty text not null,
  planned_duration_seconds integer not null default 0,
  elapsed_seconds integer not null default 0,
  outcome text not null,
  score_percent integer not null check (score_percent between 0 and 100),
  summary jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb
);

create index if not exists simulation_results_created_at_idx
  on public.simulation_results (created_at desc);
create index if not exists simulation_results_username_idx
  on public.simulation_results (username);

alter table public.simulation_results enable row level security;

-- Es werden bewusst keine anon/authenticated Policies angelegt.
-- Zugriff erfolgt ausschließlich serverseitig mit dem Supabase Secret Key.
revoke all on table public.simulation_results from anon, authenticated;
grant all on table public.simulation_results to service_role;
