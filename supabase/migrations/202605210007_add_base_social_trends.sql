alter table public.app_metrics
  add column if not exists social_mentions_7d integer not null default 0,
  add column if not exists social_engagement_7d integer not null default 0,
  add column if not exists social_window text not null default '7d';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_metrics_social_window_check'
  ) then
    alter table public.app_metrics
      add constraint app_metrics_social_window_check
      check (social_window in ('24h', '7d'));
  end if;
end;
$$;

create table if not exists public.base_social_trends (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  mentions_7d integer not null default 0,
  confidence text not null default 'low',
  sample_casts jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null default now(),
  constraint base_social_trends_confidence_check check (
    confidence in ('low', 'medium', 'high')
  )
);

create index if not exists app_metrics_social_mentions_7d_idx
  on public.app_metrics(social_mentions_7d desc);

create index if not exists base_social_trends_detected_at_idx
  on public.base_social_trends(detected_at desc);

create index if not exists base_social_trends_keyword_detected_at_idx
  on public.base_social_trends(keyword, detected_at desc);

create index if not exists base_social_trends_mentions_7d_idx
  on public.base_social_trends(mentions_7d desc);

alter table public.base_social_trends enable row level security;

revoke all on table public.base_social_trends from anon, authenticated;
grant select on table public.base_social_trends to anon, authenticated;
grant all on table public.base_social_trends to service_role;

drop policy if exists "Public can read base social trends" on public.base_social_trends;
create policy "Public can read base social trends"
  on public.base_social_trends
  for select
  using (true);

-- No public insert/update/delete policies are created. Trend collection runs
-- server-side only with SUPABASE_SERVICE_ROLE_KEY.
