create extension if not exists "pgcrypto";

create table if not exists public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  processed_apps integer not null default 0,
  base_rpc_metrics_inserted integer not null default 0,
  builder_code_metrics_inserted integer not null default 0,
  attributions_inserted integer not null default 0,
  skipped_apps integer not null default 0,
  errors integer not null default 0,
  duration_ms integer,
  trigger_type text,
  notes text,
  constraint refresh_runs_status_check check (
    status in ('running', 'success', 'partial_failure', 'failed')
  ),
  constraint refresh_runs_trigger_type_check check (
    trigger_type is null or trigger_type in ('manual', 'cron', 'verification')
  )
);

create index if not exists refresh_runs_started_at_idx
  on public.refresh_runs(started_at desc);
create index if not exists refresh_runs_status_started_at_idx
  on public.refresh_runs(status, started_at desc);
create index if not exists refresh_runs_trigger_started_at_idx
  on public.refresh_runs(trigger_type, started_at desc);

alter table public.refresh_runs enable row level security;

revoke all on table public.refresh_runs from anon, authenticated;
grant all on table public.refresh_runs to service_role;

-- No public RLS policies are created. Refresh run history is operational data
-- and must be accessed only through server-side admin code with REFRESH_SECRET.
