-- first_seen_at is when Base Radar discovered a token, not its launch date.
-- These nullable fields preserve pool provenance and explicit safety evidence.
alter table public.base_coins
  add column if not exists pair_created_at timestamptz,
  add column if not exists honeypot_flagged boolean;

create index if not exists base_coins_pair_created_at_idx
  on public.base_coins(pair_created_at desc)
  where pair_created_at is not null;
