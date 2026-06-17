alter table public.app_metrics
  add column if not exists volume_24h_usd numeric,
  add column if not exists tvl_usd numeric,
  add column if not exists metric_origin text,
  add column if not exists coverage text;

alter table public.app_metrics
  drop constraint if exists app_metrics_source_check;

alter table public.app_metrics
  add constraint app_metrics_source_check check (
    source in ('mock', 'base_rpc', 'builder_codes', 'farcaster', 'protocol_adapter')
  );

alter table public.app_metrics
  drop constraint if exists app_metrics_coverage_check;

alter table public.app_metrics
  add constraint app_metrics_coverage_check check (
    coverage is null or coverage in ('high', 'medium', 'limited', 'experimental')
  );

create index if not exists app_metrics_metric_origin_measured_at_idx
  on public.app_metrics(metric_origin, measured_at desc);
create index if not exists app_metrics_coverage_measured_at_idx
  on public.app_metrics(coverage, measured_at desc);
