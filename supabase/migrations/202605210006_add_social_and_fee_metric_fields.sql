alter table public.app_metrics
  add column if not exists fees_24h_usd numeric,
  add column if not exists revenue_24h_usd numeric,
  add column if not exists social_source text,
  add column if not exists social_confidence text,
  add column if not exists social_engagement_24h integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_metrics_social_source_check'
  ) then
    alter table public.app_metrics
      add constraint app_metrics_social_source_check
      check (social_source is null or social_source in ('farcaster'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_metrics_social_confidence_check'
  ) then
    alter table public.app_metrics
      add constraint app_metrics_social_confidence_check
      check (social_confidence is null or social_confidence in ('low', 'medium', 'high'));
  end if;
end;
$$;

create index if not exists app_metrics_social_source_measured_at_idx
  on public.app_metrics(social_source, measured_at desc);

create index if not exists app_metrics_fees_24h_usd_idx
  on public.app_metrics(fees_24h_usd desc);
