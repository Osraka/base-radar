alter table public.candidate_apps
  add column if not exists logo_url text,
  add column if not exists contract_addresses text[] not null default '{}',
  add column if not exists discovery_reason text,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists verification_status text not null default 'needs_review';

alter table public.candidate_apps
  drop constraint if exists candidate_apps_status_check;

alter table public.candidate_apps
  add constraint candidate_apps_status_check check (
    status in ('review', 'approved', 'rejected', 'hidden', 'pending', 'verified', 'needs_review')
  );

alter table public.candidate_apps
  drop constraint if exists candidate_apps_verification_status_check;

alter table public.candidate_apps
  add constraint candidate_apps_verification_status_check check (
    verification_status in ('pending', 'verified', 'rejected', 'needs_review')
  );

create index if not exists candidate_apps_website_url_idx
  on public.candidate_apps(website_url);

create index if not exists candidate_apps_contract_addresses_idx
  on public.candidate_apps using gin(contract_addresses);

create table if not exists public.base_coins (
  id uuid primary key default gen_random_uuid(),
  chain_id text not null default 'base',
  token_address text not null unique,
  name text not null,
  symbol text not null,
  decimals integer,
  logo_url text,
  website text,
  twitter text,
  farcaster text,
  pair_address text,
  dex text,
  url text,
  price_usd numeric,
  liquidity_usd numeric,
  volume_24h numeric,
  volume_6h numeric,
  volume_1h numeric,
  txns_24h integer,
  buys_24h integer,
  sells_24h integer,
  market_cap numeric,
  fdv numeric,
  price_change_1h numeric,
  price_change_6h numeric,
  price_change_24h numeric,
  holders integer,
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
  updated_at timestamptz not null default now(),
  constraint base_coins_chain_check check (chain_id = 'base'),
  constraint base_coins_token_address_format check (token_address ~* '^0x[a-f0-9]{40}$'),
  constraint base_coins_pair_address_format check (
    pair_address is null or pair_address ~* '^0x[a-f0-9]{40}$'
  ),
  constraint base_coins_confidence_check check (confidence in ('low', 'medium', 'high')),
  constraint base_coins_coverage_check check (coverage in ('high', 'medium', 'limited', 'experimental')),
  constraint base_coins_source_check check (
    source in ('dexscreener', 'base_rpc', 'manual_seed', 'snapshot', 'fallback')
  ),
  constraint base_coins_verification_status_check check (
    verification_status in ('pending', 'verified', 'rejected', 'needs_review')
  )
);

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

-- Public writes are intentionally blocked. Discovery and refresh jobs must use
-- server-only service role access, with scam-risk flags kept visible to users.
