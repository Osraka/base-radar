-- Growth is unknown when there is no previous measurement baseline.
-- Do not coerce missing previous-day data into +100%.
alter table public.app_metrics
  alter column growth_24h drop not null,
  alter column growth_7d drop not null,
  alter column growth_24h drop default,
  alter column growth_7d drop default;

-- Earlier refreshes used exact +100% when the previous metric row was missing
-- or zero. Treat those stale zero-baseline rows as unknown rather than growth.
update public.app_metrics
set growth_24h = null
where growth_24h = 100
  and source in ('mock', 'base_rpc', 'protocol_adapter', 'builder_codes');

update public.app_metrics
set growth_7d = null
where growth_7d = 100
  and source in ('mock', 'base_rpc', 'protocol_adapter', 'builder_codes');

-- friend.tech and Paragraph are intentionally hidden from the main radar.
-- They can remain in the database for historical/review purposes.
update public.apps
set status = 'hidden',
    updated_at = now()
where slug in ('friend-tech', 'paragraph');
