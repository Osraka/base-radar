alter table public.base_token_trends
  add column if not exists volume_liquidity_ratio numeric,
  add column if not exists velocity_score numeric;

alter table public.base_token_trends
  drop constraint if exists base_token_trends_bucket_check;

alter table public.base_token_trends
  add constraint base_token_trends_bucket_check
  check (
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

alter table public.refresh_runs
  add column if not exists token_snapshots_inserted integer default 0;

create index if not exists token_radar_snapshots_bucket_detected_at_idx
  on public.token_radar_snapshots(bucket, detected_at desc);

create index if not exists token_radar_snapshots_contract_bucket_detected_at_idx
  on public.token_radar_snapshots(contract_address, bucket, detected_at desc);

create index if not exists token_radar_snapshots_volume_ratio_idx
  on public.token_radar_snapshots(volume_liquidity_ratio desc);

create index if not exists token_radar_snapshots_velocity_score_idx
  on public.token_radar_snapshots(velocity_score desc);

alter table public.token_radar_snapshots enable row level security;

revoke all on table public.token_radar_snapshots from anon, authenticated;
grant select on table public.token_radar_snapshots to anon, authenticated;
grant all on table public.token_radar_snapshots to service_role;

drop policy if exists "Public can read token radar snapshots" on public.token_radar_snapshots;
create policy "Public can read token radar snapshots"
  on public.token_radar_snapshots
  for select
  to anon, authenticated
  using (true);

-- Public writes are intentionally not allowed. Cron refresh writes snapshots
-- server-side with the service role key after token safety filters pass.
