create table if not exists public.base_contract_scan_windows (
  id uuid primary key default gen_random_uuid(),
  from_block bigint not null check (from_block >= 0),
  to_block bigint not null check (to_block >= from_block),
  contract_set_hash text not null check (contract_set_hash ~ '^[0-9a-f]{64}$'),
  app_samples jsonb not null default '{}'::jsonb check (jsonb_typeof(app_samples) = 'object'),
  gap_before_blocks bigint check (gap_before_blocks >= 0),
  log_count integer not null default 0 check (log_count >= 0),
  scanned_at timestamptz not null default now(),
  constraint base_contract_scan_windows_unique_tip unique (contract_set_hash, to_block)
);

create index if not exists base_contract_scan_windows_latest_idx
  on public.base_contract_scan_windows(contract_set_hash, to_block desc);

alter table public.base_contract_scan_windows enable row level security;
revoke all on table public.base_contract_scan_windows from anon, authenticated;
grant all on table public.base_contract_scan_windows to service_role;

-- Private operational samples only. No public policies and no daily metric claims.
