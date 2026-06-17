alter table public.base_token_trends
  add column if not exists security_source text default 'dexscreener',
  add column if not exists honeypot_is_honeypot boolean,
  add column if not exists honeypot_risk text,
  add column if not exists honeypot_risk_level numeric,
  add column if not exists simulation_success boolean,
  add column if not exists buy_tax numeric,
  add column if not exists sell_tax numeric,
  add column if not exists transfer_tax numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'base_token_trends_security_source_check'
  ) then
    alter table public.base_token_trends
      add constraint base_token_trends_security_source_check
      check (
        security_source in (
          'dexscreener',
          'honeypot.is',
          'dexscreener+honeypot.is'
        )
      );
  end if;
end $$;

create index if not exists base_token_trends_honeypot_risk_idx
  on public.base_token_trends(honeypot_risk);

create index if not exists base_token_trends_sell_tax_idx
  on public.base_token_trends(sell_tax);
