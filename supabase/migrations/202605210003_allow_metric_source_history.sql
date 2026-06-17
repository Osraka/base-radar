drop index if exists public.app_metrics_app_id_measured_at_unique;

create unique index if not exists app_metrics_app_id_source_measured_at_unique
  on public.app_metrics(app_id, source, measured_at);
