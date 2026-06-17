alter table public.base_token_trends
  add column if not exists pair_address text,
  add column if not exists dex_id text,
  add column if not exists url text,
  add column if not exists price_usd numeric,
  add column if not exists txns_24h integer,
  add column if not exists buys_24h integer,
  add column if not exists sells_24h integer,
  add column if not exists fdv_usd numeric,
  add column if not exists market_cap_usd numeric,
  add column if not exists pair_created_at timestamptz,
  add column if not exists safety_status text default 'unknown',
  add column if not exists risk_level text default 'unknown',
  add column if not exists risk_reasons text[] default '{}',
  add column if not exists bucket text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'base_token_trends_safety_status_check'
  ) then
    alter table public.base_token_trends
      add constraint base_token_trends_safety_status_check
      check (safety_status in ('passed', 'watch', 'excluded', 'unknown'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'base_token_trends_risk_level_check'
  ) then
    alter table public.base_token_trends
      add constraint base_token_trends_risk_level_check
      check (risk_level in ('low', 'medium', 'high', 'unknown'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'base_token_trends_bucket_check'
  ) then
    alter table public.base_token_trends
      add constraint base_token_trends_bucket_check
      check (bucket is null or bucket in ('volume', 'gainers', 'new', 'meme'));
  end if;
end $$;

create index if not exists base_token_trends_bucket_detected_at_idx
  on public.base_token_trends(bucket, detected_at desc);

create index if not exists base_token_trends_price_change_24h_idx
  on public.base_token_trends(price_change_24h desc);

create index if not exists base_token_trends_safety_status_idx
  on public.base_token_trends(safety_status);
