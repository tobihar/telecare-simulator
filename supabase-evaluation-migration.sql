-- TeleCare: bestehende Evaluationen dauerhaft anonymisieren
--
-- Dieses Skript ist erneut ausführbar. Es entfernt bewusst alle direkten
-- Verknüpfungen zwischen Evaluation, Benutzer und Simulationsdurchlauf.

create extension if not exists pgcrypto;

create table if not exists public.simulation_evaluations (
  id uuid primary key default gen_random_uuid(),
  case_id text,
  case_name text not null,
  difficulty text not null,
  answers jsonb not null default '{}'::jsonb,
  submitted_on date
);

alter table public.simulation_evaluations
  add column if not exists case_id text;
alter table public.simulation_evaluations
  add column if not exists submitted_on date;
alter table public.simulation_evaluations
  add column if not exists created_at timestamptz;

-- Vor dem Entfernen des exakten Zeitstempels bleibt nur der Kalendertag
-- erhalten. Dadurch lassen sich Fragebögen nicht über Uhrzeiten mit einem
-- konkreten Simulationsdurchlauf abgleichen.
update public.simulation_evaluations
set submitted_on = coalesce(submitted_on, created_at::date, current_date)
where submitted_on is null;

-- Bestehende Fälle erhalten stabile technische IDs. Unbekannte Altfälle
-- werden ausschließlich aus dem Fallnamen gruppiert.
update public.simulation_evaluations
set case_id = case
  when case_name = 'Postoperative Blutung nach Hemikolektomie' then 'postop_bleeding_01'
  when case_name = 'Frau Berger bei Urosepsis' then 'septic_shock_05'
  else 'legacy_' || substr(md5(case_name), 1, 16)
end
where case_id is null or btrim(case_id) = '';

-- Personen- und Durchlaufbezüge werden nicht nur geleert, sondern aus dem
-- Schema entfernt. Auch der exakte Einreichungszeitpunkt wird gelöscht.
alter table public.simulation_evaluations
  drop column if exists simulation_result_id,
  drop column if exists client_run_id,
  drop column if exists username,
  drop column if exists skipped,
  drop column if exists created_at;

alter table public.simulation_evaluations
  alter column case_id set not null,
  alter column submitted_on set default current_date,
  alter column submitted_on set not null;

alter table public.simulation_results
  drop column if exists evaluation_completed,
  drop column if exists evaluation_skipped;

drop index if exists public.simulation_evaluations_created_at_idx;
create index if not exists simulation_evaluations_case_idx
  on public.simulation_evaluations (case_id, submitted_on desc);

alter table public.simulation_evaluations enable row level security;
revoke all on table public.simulation_evaluations from anon, authenticated;
grant all on table public.simulation_evaluations to service_role;
