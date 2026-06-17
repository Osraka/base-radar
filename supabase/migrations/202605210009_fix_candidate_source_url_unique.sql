drop index if exists public.candidate_apps_source_url_unique;

create unique index if not exists candidate_apps_source_url_unique
  on public.candidate_apps(source_url);
