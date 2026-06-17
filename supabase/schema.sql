create extension if not exists "pgcrypto";

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  category text not null,
  description text not null,
  website_url text not null,
  x_url text,
  farcaster_url text,
  builder_code text,
  contract_addresses text[] default '{}',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apps_status_check check (status in ('approved', 'pending', 'rejected', 'hidden')),
  constraint apps_category_check check (
    category in (
      'DeFi',
      'Social',
      'NFT',
      'Gaming',
      'AI Agent',
      'Wallet',
      'Mini App',
      'Infrastructure',
      'Bridge'
    )
  )
);

create table if not exists public.app_metrics (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  tx_24h integer not null default 0,
  tx_7d integer not null default 0,
  unique_users_24h integer not null default 0,
  unique_users_7d integer not null default 0,
  volume_24h numeric not null default 0,
  volume_7d numeric not null default 0,
  growth_24h numeric,
  growth_7d numeric,
  social_mentions_24h integer not null default 0,
  social_mentions_7d integer not null default 0,
  trend_score numeric not null default 0,
  source text not null default 'mock',
  confidence text not null default 'low',
  volume_24h_usd numeric,
  fees_24h_usd numeric,
  revenue_24h_usd numeric,
  tvl_usd numeric,
  metric_origin text,
  coverage text,
  social_source text,
  social_confidence text,
  social_engagement_24h integer not null default 0,
  social_engagement_7d integer not null default 0,
  social_window text not null default '7d',
  notes text,
  measured_at timestamptz not null default now(),
  constraint app_metrics_source_check check (
    source in ('mock', 'base_rpc', 'builder_codes', 'farcaster', 'protocol_adapter')
  ),
  constraint app_metrics_confidence_check check (
    confidence in ('low', 'medium', 'high')
  ),
  constraint app_metrics_coverage_check check (
    coverage is null or coverage in ('high', 'medium', 'limited', 'experimental')
  ),
  constraint app_metrics_social_source_check check (
    social_source is null or social_source in ('farcaster')
  ),
  constraint app_metrics_social_confidence_check check (
    social_confidence is null or social_confidence in ('low', 'medium', 'high')
  ),
  constraint app_metrics_social_window_check check (
    social_window in ('24h', '7d')
  )
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  app_name text not null,
  website_url text not null,
  category text not null,
  description text not null,
  contract_addresses text[] default '{}',
  builder_code text,
  x_url text,
  farcaster_url text,
  submitter_contact text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint submissions_status_check check (status in ('pending', 'approved', 'rejected', 'spam')),
  constraint submissions_category_check check (
    category in (
      'DeFi',
      'Social',
      'NFT',
      'Gaming',
      'AI Agent',
      'Wallet',
      'Mini App',
      'Infrastructure',
      'Bridge'
    )
  )
);

create table if not exists public.builder_code_attributions (
  id uuid primary key default gen_random_uuid(),
  transaction_hash text unique not null,
  builder_code text not null,
  from_address text,
  to_address text,
  confidence text not null default 'low',
  raw_suffix text,
  detected_at timestamptz not null default now(),
  constraint builder_code_attributions_confidence_check check (
    confidence in ('low', 'medium', 'high')
  )
);

create table if not exists public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  processed_apps integer not null default 0,
  base_rpc_metrics_inserted integer not null default 0,
  builder_code_metrics_inserted integer not null default 0,
  attributions_inserted integer not null default 0,
  token_snapshots_inserted integer not null default 0,
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

create table if not exists public.candidate_apps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  category text,
  website_url text,
  source text,
  source_url text,
  confidence text,
  status text not null default 'review',
  notes text,
  detected_at timestamptz not null default now(),
  constraint candidate_apps_confidence_check check (
    confidence is null or confidence in ('low', 'medium', 'high')
  ),
  constraint candidate_apps_status_check check (
    status in ('review', 'approved', 'rejected', 'hidden')
  )
);

create table if not exists public.base_token_trends (
  id uuid primary key default gen_random_uuid(),
  token_symbol text,
  token_name text,
  contract_address text,
  pair_address text,
  dex_id text,
  url text,
  source text,
  price_usd numeric,
  volume_24h_usd numeric,
  liquidity_usd numeric,
  volume_liquidity_ratio numeric,
  velocity_score numeric,
  price_change_24h numeric,
  txns_24h integer,
  buys_24h integer,
  sells_24h integer,
  fdv_usd numeric,
  market_cap_usd numeric,
  pair_created_at timestamptz,
  safety_status text default 'unknown',
  risk_level text default 'unknown',
  risk_reasons text[] default '{}',
  security_source text default 'dexscreener',
  honeypot_is_honeypot boolean,
  honeypot_risk text,
  honeypot_risk_level numeric,
  simulation_success boolean,
  buy_tax numeric,
  sell_tax numeric,
  transfer_tax numeric,
  bucket text,
  mentions_7d integer not null default 0,
  confidence text,
  detected_at timestamptz not null default now(),
  constraint base_token_trends_confidence_check check (
    confidence is null or confidence in ('low', 'medium', 'high')
  ),
  constraint base_token_trends_safety_status_check check (
    safety_status in ('passed', 'watch', 'excluded', 'unknown')
  ),
  constraint base_token_trends_risk_level_check check (
    risk_level in ('low', 'medium', 'high', 'unknown')
  ),
  constraint base_token_trends_bucket_check check (
    bucket is null or bucket in (
      'volume',
      'velocity',
      'liquidity',
      'gainers',
      'fresh',
      'new',
      'early',
      'meme',
      'smart'
    )
  ),
  constraint base_token_trends_security_source_check check (
    security_source in ('dexscreener', 'honeypot.is', 'dexscreener+honeypot.is')
  )
);

create table if not exists public.token_radar_snapshots (
  id uuid primary key default gen_random_uuid(),
  refresh_run_id uuid references public.refresh_runs(id) on delete set null,
  bucket text not null,
  token_symbol text,
  token_name text,
  contract_address text not null,
  pair_address text,
  dex_id text,
  url text,
  source text,
  price_usd numeric,
  volume_24h_usd numeric default 0,
  liquidity_usd numeric default 0,
  volume_liquidity_ratio numeric default 0,
  velocity_score numeric default 0,
  price_change_24h numeric default 0,
  txns_24h integer default 0,
  buys_24h integer default 0,
  sells_24h integer default 0,
  fdv_usd numeric,
  market_cap_usd numeric,
  pair_created_at timestamptz,
  safety_status text default 'unknown',
  risk_level text default 'unknown',
  risk_reasons text[] default '{}',
  security_source text default 'dexscreener',
  honeypot_is_honeypot boolean,
  honeypot_risk text,
  honeypot_risk_level numeric,
  simulation_success boolean,
  buy_tax numeric,
  sell_tax numeric,
  transfer_tax numeric,
  onchain_fresh boolean default false,
  onchain_pool_source text,
  onchain_pool_address text,
  onchain_pool_block text,
  onchain_pool_detected_at timestamptz,
  confidence text,
  detected_at timestamptz not null default now(),
  constraint token_radar_snapshots_bucket_check check (
    bucket in ('velocity', 'fresh')
  ),
  constraint token_radar_snapshots_confidence_check check (
    confidence is null or confidence in ('low', 'medium', 'high')
  ),
  constraint token_radar_snapshots_safety_status_check check (
    safety_status in ('passed', 'watch', 'excluded', 'unknown')
  ),
  constraint token_radar_snapshots_risk_level_check check (
    risk_level in ('low', 'medium', 'high', 'unknown')
  ),
  constraint token_radar_snapshots_security_source_check check (
    security_source in ('dexscreener', 'honeypot.is', 'dexscreener+honeypot.is')
  )
);

alter table public.apps add column if not exists logo_url text;
alter table public.apps add column if not exists x_url text;
alter table public.apps add column if not exists farcaster_url text;
alter table public.apps add column if not exists builder_code text;
alter table public.apps add column if not exists contract_addresses text[] default '{}';
alter table public.apps add column if not exists status text not null default 'approved';
alter table public.submissions add column if not exists contract_addresses text[] default '{}';
alter table public.submissions add column if not exists builder_code text;
alter table public.submissions add column if not exists x_url text;
alter table public.submissions add column if not exists farcaster_url text;
alter table public.submissions add column if not exists status text not null default 'pending';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'apps'
      and column_name = 'is_approved'
  ) then
    update public.apps
    set status = case when is_approved then 'approved' else 'hidden' end
    where status is null or status = 'approved';
  end if;
end;
$$;

create index if not exists apps_category_idx on public.apps(category);
create index if not exists apps_status_category_idx on public.apps(status, category);
create index if not exists apps_slug_idx on public.apps(slug);
create index if not exists app_metrics_app_id_measured_at_idx
  on public.app_metrics(app_id, measured_at desc);
create unique index if not exists app_metrics_app_id_source_measured_at_unique
  on public.app_metrics(app_id, source, measured_at);
create index if not exists app_metrics_trend_score_idx
  on public.app_metrics(trend_score desc);
create index if not exists app_metrics_source_measured_at_idx
  on public.app_metrics(source, measured_at desc);
create index if not exists app_metrics_metric_origin_measured_at_idx
  on public.app_metrics(metric_origin, measured_at desc);
create index if not exists app_metrics_coverage_measured_at_idx
  on public.app_metrics(coverage, measured_at desc);
create index if not exists app_metrics_social_source_measured_at_idx
  on public.app_metrics(social_source, measured_at desc);
create index if not exists app_metrics_fees_24h_usd_idx
  on public.app_metrics(fees_24h_usd desc);
create index if not exists app_metrics_social_mentions_7d_idx
  on public.app_metrics(social_mentions_7d desc);
create index if not exists submissions_status_created_at_idx
  on public.submissions(status, created_at desc);
create unique index if not exists builder_code_attributions_transaction_hash_unique
  on public.builder_code_attributions(transaction_hash);
create index if not exists builder_code_attributions_builder_code_idx
  on public.builder_code_attributions(builder_code);
create index if not exists builder_code_attributions_detected_at_idx
  on public.builder_code_attributions(detected_at desc);
create index if not exists refresh_runs_started_at_idx
  on public.refresh_runs(started_at desc);
create index if not exists refresh_runs_status_started_at_idx
  on public.refresh_runs(status, started_at desc);
create index if not exists refresh_runs_trigger_started_at_idx
  on public.refresh_runs(trigger_type, started_at desc);
create index if not exists base_social_trends_detected_at_idx
  on public.base_social_trends(detected_at desc);
create index if not exists base_social_trends_keyword_detected_at_idx
  on public.base_social_trends(keyword, detected_at desc);
create index if not exists base_social_trends_mentions_7d_idx
  on public.base_social_trends(mentions_7d desc);
create index if not exists candidate_apps_status_detected_at_idx
  on public.candidate_apps(status, detected_at desc);
create index if not exists candidate_apps_source_detected_at_idx
  on public.candidate_apps(source, detected_at desc);
create unique index if not exists candidate_apps_source_url_unique
  on public.candidate_apps(source_url);
create index if not exists base_token_trends_detected_at_idx
  on public.base_token_trends(detected_at desc);
create index if not exists base_token_trends_volume_24h_usd_idx
  on public.base_token_trends(volume_24h_usd desc);
create index if not exists base_token_trends_contract_detected_at_idx
  on public.base_token_trends(contract_address, detected_at desc);
create index if not exists base_token_trends_bucket_detected_at_idx
  on public.base_token_trends(bucket, detected_at desc);
create index if not exists base_token_trends_price_change_24h_idx
  on public.base_token_trends(price_change_24h desc);
create index if not exists base_token_trends_safety_status_idx
  on public.base_token_trends(safety_status);
create index if not exists base_token_trends_honeypot_risk_idx
  on public.base_token_trends(honeypot_risk);
create index if not exists base_token_trends_sell_tax_idx
  on public.base_token_trends(sell_tax);
create index if not exists token_radar_snapshots_bucket_detected_at_idx
  on public.token_radar_snapshots(bucket, detected_at desc);
create index if not exists token_radar_snapshots_contract_bucket_detected_at_idx
  on public.token_radar_snapshots(contract_address, bucket, detected_at desc);
create index if not exists token_radar_snapshots_volume_ratio_idx
  on public.token_radar_snapshots(volume_liquidity_ratio desc);
create index if not exists token_radar_snapshots_velocity_score_idx
  on public.token_radar_snapshots(velocity_score desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists apps_set_updated_at on public.apps;
create trigger apps_set_updated_at
before update on public.apps
for each row
execute function public.set_updated_at();

alter table public.apps enable row level security;
alter table public.app_metrics enable row level security;
alter table public.submissions enable row level security;
alter table public.builder_code_attributions enable row level security;
alter table public.refresh_runs enable row level security;
alter table public.base_social_trends enable row level security;
alter table public.candidate_apps enable row level security;
alter table public.base_token_trends enable row level security;
alter table public.token_radar_snapshots enable row level security;

grant usage on schema public to anon, authenticated;
revoke all on table public.apps from anon, authenticated;
revoke all on table public.app_metrics from anon, authenticated;
revoke all on table public.submissions from anon, authenticated;
revoke all on table public.builder_code_attributions from anon, authenticated;
revoke all on table public.refresh_runs from anon, authenticated;
revoke all on table public.base_social_trends from anon, authenticated;
revoke all on table public.candidate_apps from anon, authenticated;
revoke all on table public.base_token_trends from anon, authenticated;
revoke all on table public.token_radar_snapshots from anon, authenticated;
grant select on table public.apps to anon, authenticated;
grant select on table public.app_metrics to anon, authenticated;
grant insert on table public.submissions to anon, authenticated;
grant select on table public.builder_code_attributions to anon, authenticated;
grant all on table public.refresh_runs to service_role;
grant select on table public.base_social_trends to anon, authenticated;
grant all on table public.base_social_trends to service_role;
grant select on table public.candidate_apps to anon, authenticated;
grant select on table public.base_token_trends to anon, authenticated;
grant select on table public.token_radar_snapshots to anon, authenticated;
grant all on table public.candidate_apps to service_role;
grant all on table public.base_token_trends to service_role;
grant all on table public.token_radar_snapshots to service_role;

drop policy if exists "Public can read apps" on public.apps;
drop policy if exists "Public can read approved apps" on public.apps;
create policy "Public can read approved apps"
  on public.apps
  for select
  using (status = 'approved');

drop policy if exists "Public can read app metrics" on public.app_metrics;
drop policy if exists "Public can read approved app metrics" on public.app_metrics;
create policy "Public can read approved app metrics"
  on public.app_metrics
  for select
  using (
    exists (
      select 1
      from public.apps
      where apps.id = app_metrics.app_id
        and apps.status = 'approved'
    )
  );

drop policy if exists "Public can create submissions" on public.submissions;
drop policy if exists "Public can insert submissions" on public.submissions;
create policy "Public can insert submissions"
  on public.submissions
  for insert
  with check (status = 'pending');

drop policy if exists "Public can read builder code attributions"
  on public.builder_code_attributions;
create policy "Public can read builder code attributions"
  on public.builder_code_attributions
  for select
  using (true);

drop policy if exists "Public can read base social trends" on public.base_social_trends;
create policy "Public can read base social trends"
  on public.base_social_trends
  for select
  using (true);

drop policy if exists "Public can read approved candidate apps" on public.candidate_apps;
create policy "Public can read approved candidate apps"
  on public.candidate_apps
  for select
  using (status = 'approved');

drop policy if exists "Public can read base token trends" on public.base_token_trends;
create policy "Public can read base token trends"
  on public.base_token_trends
  for select
  using (true);

drop policy if exists "Public can read token radar snapshots" on public.token_radar_snapshots;
create policy "Public can read token radar snapshots"
  on public.token_radar_snapshots
  for select
  using (true);

-- No public update/delete policies are created for apps, app_metrics, or submissions.
-- No public select policy is created for submissions.
-- No public insert/update/delete policies are created for builder_code_attributions.
-- No public read/write policy is created for refresh_runs.
-- No public insert/update/delete policies are created for base_social_trends.
-- No public insert/update/delete policies are created for candidate_apps,
-- base_token_trends, or token_radar_snapshots.
-- Moderation, approved app writes, and metrics refreshes must run server-side with
-- SUPABASE_SERVICE_ROLE_KEY. That key must never be prefixed with NEXT_PUBLIC_.
