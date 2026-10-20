alter table public.coin_job_runs
  add column if not exists skip_reasons jsonb not null default '{}'::jsonb;

comment on column public.coin_job_runs.skip_reasons is
  'Aggregate reason counts for tracked coins not refreshed; contains no token addresses.';
