create extension if not exists "pgcrypto";

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

create unique index if not exists builder_code_attributions_transaction_hash_unique
  on public.builder_code_attributions(transaction_hash);
create index if not exists builder_code_attributions_builder_code_idx
  on public.builder_code_attributions(builder_code);
create index if not exists builder_code_attributions_detected_at_idx
  on public.builder_code_attributions(detected_at desc);

alter table public.builder_code_attributions enable row level security;

revoke all on table public.builder_code_attributions from anon, authenticated;
grant select on table public.builder_code_attributions to anon, authenticated;

drop policy if exists "Public can read builder code attributions"
  on public.builder_code_attributions;
create policy "Public can read builder code attributions"
  on public.builder_code_attributions
  for select
  using (true);

-- No public insert/update/delete policies are created. Attribution writes must
-- use SUPABASE_SERVICE_ROLE_KEY from trusted server-only refresh/indexer jobs.
