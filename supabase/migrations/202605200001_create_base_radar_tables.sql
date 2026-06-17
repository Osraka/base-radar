create extension if not exists "pgcrypto";

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  category text not null,
  description text not null,
  website_url text not null,
  x_url text,
  farcaster_url text,
  builder_code text,
  contract_addresses text[] default '{}',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apps_status_check check (status in ('approved', 'pending', 'rejected', 'hidden')),
  constraint apps_category_check check (
    category in (
      'DeFi',
      'Social',
      'NFT',
      'Gaming',
      'AI Agent',
      'Wallet',
      'Mini App',
      'Infrastructure'
    )
  )
);

create table if not exists public.app_metrics (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  tx_24h integer not null default 0,
  tx_7d integer not null default 0,
  unique_users_24h integer not null default 0,
  unique_users_7d integer not null default 0,
  volume_24h numeric not null default 0,
  volume_7d numeric not null default 0,
  growth_24h numeric not null default 0,
  growth_7d numeric not null default 0,
  social_mentions_24h integer not null default 0,
  trend_score numeric not null default 0,
  measured_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  app_name text not null,
  website_url text not null,
  category text not null,
  description text not null,
  contract_addresses text[] default '{}',
  builder_code text,
  x_url text,
  farcaster_url text,
  submitter_contact text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint submissions_status_check check (status in ('pending', 'approved', 'rejected', 'spam')),
  constraint submissions_category_check check (
    category in (
      'DeFi',
      'Social',
      'NFT',
      'Gaming',
      'AI Agent',
      'Wallet',
      'Mini App',
      'Infrastructure'
    )
  )
);

alter table public.apps add column if not exists logo_url text;
alter table public.apps add column if not exists x_url text;
alter table public.apps add column if not exists farcaster_url text;
alter table public.apps add column if not exists builder_code text;
alter table public.apps add column if not exists contract_addresses text[] default '{}';
alter table public.apps add column if not exists status text not null default 'approved';
alter table public.submissions add column if not exists contract_addresses text[] default '{}';
alter table public.submissions add column if not exists builder_code text;
alter table public.submissions add column if not exists x_url text;
alter table public.submissions add column if not exists farcaster_url text;
alter table public.submissions add column if not exists status text not null default 'pending';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'apps'
      and column_name = 'is_approved'
  ) then
    update public.apps
    set status = case when is_approved then 'approved' else 'hidden' end
    where status is null or status = 'approved';
  end if;
end;
$$;

create index if not exists apps_category_idx on public.apps(category);
create index if not exists apps_status_category_idx on public.apps(status, category);
create index if not exists apps_slug_idx on public.apps(slug);
create index if not exists app_metrics_app_id_measured_at_idx
  on public.app_metrics(app_id, measured_at desc);
create unique index if not exists app_metrics_app_id_measured_at_unique
  on public.app_metrics(app_id, measured_at);
create index if not exists app_metrics_trend_score_idx
  on public.app_metrics(trend_score desc);
create index if not exists submissions_status_created_at_idx
  on public.submissions(status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists apps_set_updated_at on public.apps;
create trigger apps_set_updated_at
before update on public.apps
for each row
execute function public.set_updated_at();

alter table public.apps enable row level security;
alter table public.app_metrics enable row level security;
alter table public.submissions enable row level security;

grant usage on schema public to anon, authenticated;
revoke all on table public.apps from anon, authenticated;
revoke all on table public.app_metrics from anon, authenticated;
revoke all on table public.submissions from anon, authenticated;
grant select on table public.apps to anon, authenticated;
grant select on table public.app_metrics to anon, authenticated;
grant insert on table public.submissions to anon, authenticated;

drop policy if exists "Public can read apps" on public.apps;
drop policy if exists "Public can read approved apps" on public.apps;
create policy "Public can read approved apps"
  on public.apps
  for select
  using (status = 'approved');

drop policy if exists "Public can read app metrics" on public.app_metrics;
drop policy if exists "Public can read approved app metrics" on public.app_metrics;
create policy "Public can read approved app metrics"
  on public.app_metrics
  for select
  using (
    exists (
      select 1
      from public.apps
      where apps.id = app_metrics.app_id
        and apps.status = 'approved'
    )
  );

drop policy if exists "Public can create submissions" on public.submissions;
drop policy if exists "Public can insert submissions" on public.submissions;
create policy "Public can insert submissions"
  on public.submissions
  for insert
  with check (status = 'pending');

-- No public update/delete policies are created for apps, app_metrics, or submissions.
-- No public select policy is created for submissions.
-- Moderation, approved app writes, and metrics refreshes must run server-side with
-- SUPABASE_SERVICE_ROLE_KEY. That key must never be prefixed with NEXT_PUBLIC_.
