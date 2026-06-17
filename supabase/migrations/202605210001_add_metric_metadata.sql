alter table public.app_metrics
  add column if not exists source text not null default 'mock',
  add column if not exists confidence text not null default 'low',
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_metrics_source_check'
      and conrelid = 'public.app_metrics'::regclass
  ) then
    alter table public.app_metrics
      add constraint app_metrics_source_check
      check (source in ('mock', 'base_rpc', 'builder_codes', 'farcaster'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_metrics_confidence_check'
      and conrelid = 'public.app_metrics'::regclass
  ) then
    alter table public.app_metrics
      add constraint app_metrics_confidence_check
      check (confidence in ('low', 'medium', 'high'));
  end if;
end;
$$;

create index if not exists app_metrics_source_measured_at_idx
  on public.app_metrics(source, measured_at desc);
