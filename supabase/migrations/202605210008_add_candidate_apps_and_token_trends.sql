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
  source text,
  volume_24h_usd numeric,
  liquidity_usd numeric,
  price_change_24h numeric,
  mentions_7d integer not null default 0,
  confidence text,
  detected_at timestamptz not null default now(),
  constraint base_token_trends_confidence_check check (
    confidence is null or confidence in ('low', 'medium', 'high')
  )
);

create index if not exists candidate_apps_status_detected_at_idx
  on public.candidate_apps(status, detected_at desc);

create index if not exists candidate_apps_source_detected_at_idx
  on public.candidate_apps(source, detected_at desc);

create unique index if not exists candidate_apps_source_url_unique
  on public.candidate_apps(source_url)
  where source_url is not null;

create index if not exists base_token_trends_detected_at_idx
  on public.base_token_trends(detected_at desc);

create index if not exists base_token_trends_volume_24h_usd_idx
  on public.base_token_trends(volume_24h_usd desc);

create index if not exists base_token_trends_contract_detected_at_idx
  on public.base_token_trends(contract_address, detected_at desc);

alter table public.candidate_apps enable row level security;
alter table public.base_token_trends enable row level security;

revoke all on table public.candidate_apps from anon, authenticated;
revoke all on table public.base_token_trends from anon, authenticated;
grant select on table public.candidate_apps to anon, authenticated;
grant select on table public.base_token_trends to anon, authenticated;
grant all on table public.candidate_apps to service_role;
grant all on table public.base_token_trends to service_role;

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

-- Public writes are intentionally not allowed. Candidate promotion and token
-- trend insertion must be handled by trusted server-side jobs or admin scripts.
