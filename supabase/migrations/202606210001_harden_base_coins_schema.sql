create table if not exists public.base_coins (
  id uuid primary key default gen_random_uuid(),
  token_address text not null unique,
  name text not null,
  symbol text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  measured_at timestamptz not null default now(),
  source text not null default 'dexscreener',
  confidence text not null default 'low',
  coverage text not null default 'limited',
  risk_flags text[] not null default '{}',
  labels text[] not null default '{}',
  verification_status text not null default 'pending',
  score numeric not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.base_coins
  add column if not exists chain_id text not null default 'base',
  add column if not exists token_address text,
  add column if not exists name text not null default 'Unknown Base token',
  add column if not exists symbol text not null default 'UNKNOWN',
  add column if not exists decimals integer,
  add column if not exists logo_url text,
  add column if not exists website text,
  add column if not exists twitter text,
  add column if not exists farcaster text,
  add column if not exists pair_address text,
  add column if not exists dex text,
  add column if not exists url text,
  add column if not exists price_usd numeric,
  add column if not exists liquidity_usd numeric,
  add column if not exists volume_24h numeric,
  add column if not exists volume_6h numeric,
  add column if not exists volume_1h numeric,
  add column if not exists txns_24h integer,
  add column if not exists buys_24h integer,
  add column if not exists sells_24h integer,
  add column if not exists market_cap numeric,
  add column if not exists fdv numeric,
  add column if not exists price_change_1h numeric,
  add column if not exists price_change_6h numeric,
  add column if not exists price_change_24h numeric,
  add column if not exists holders integer,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists measured_at timestamptz not null default now(),
  add column if not exists source text not null default 'dexscreener',
  add column if not exists confidence text not null default 'low',
  add column if not exists coverage text not null default 'limited',
  add column if not exists risk_flags text[] not null default '{}',
  add column if not exists labels text[] not null default '{}',
  add column if not exists verification_status text not null default 'pending',
  add column if not exists score numeric not null default 0,
  add column if not exists score_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists base_coins_token_address_key
  on public.base_coins(token_address);

create index if not exists base_coins_score_idx
  on public.base_coins(score desc);

create index if not exists base_coins_measured_at_idx
  on public.base_coins(measured_at desc);

create index if not exists base_coins_first_seen_at_idx
  on public.base_coins(first_seen_at desc);

create index if not exists base_coins_liquidity_idx
  on public.base_coins(liquidity_usd desc);

create index if not exists base_coins_volume_24h_idx
  on public.base_coins(volume_24h desc);

create index if not exists base_coins_pair_address_idx
  on public.base_coins(pair_address)
  where pair_address is not null;

create index if not exists base_coins_risk_flags_idx
  on public.base_coins using gin(risk_flags);

alter table public.base_coins enable row level security;

revoke all on table public.base_coins from anon, authenticated;
grant select on table public.base_coins to anon, authenticated;
grant all on table public.base_coins to service_role;

drop policy if exists "Public can read tracked Base coins" on public.base_coins;
create policy "Public can read tracked Base coins"
  on public.base_coins
  for select
  using (verification_status <> 'rejected');

-- This migration is intentionally additive and safe to rerun. It fixes
-- partially-created base_coins schemas without deleting or rewriting rows.
