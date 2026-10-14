create table if not exists public.coin_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('discovery', 'refresh')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (
    status in ('running', 'success', 'partial_failure', 'failed')
  ),
  success_count integer not null default 0,
  skipped_count integer not null default 0,
  failure_count integer not null default 0,
  warnings text[] not null default '{}'
);

create index if not exists coin_job_runs_type_started_idx
  on public.coin_job_runs(job_type, started_at desc);

alter table public.coin_job_runs enable row level security;
revoke all on table public.coin_job_runs from anon, authenticated;
grant all on table public.coin_job_runs to service_role;

-- Operational history has no public policies. Only server-side service role
-- code may insert or read it.
