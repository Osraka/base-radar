-- Private review records only. No public builder verification is enabled by this migration.
create table if not exists public.builder_claims (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete restrict,
  claimant_contact text not null,
  canonical_hostname text not null,
  token_digest text not null unique,
  challenge_issued_at timestamptz not null default now(),
  challenge_expires_at timestamptz not null,
  challenge_used_at timestamptz,
  proof_checked_at timestamptz,
  status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint builder_claims_status_check check (
    status in ('pending', 'proof_checked', 'approved', 'rejected', 'disputed', 'revoked')
  ),
  constraint builder_claims_token_digest_check check (token_digest ~ '^[a-f0-9]{64}$'),
  constraint builder_claims_contact_check check (
    claimant_contact = btrim(claimant_contact) and char_length(claimant_contact) between 3 and 240
  ),
  constraint builder_claims_hostname_check check (
    canonical_hostname = lower(btrim(canonical_hostname)) and
    char_length(canonical_hostname) between 4 and 253
  ),
  constraint builder_claims_challenge_window_check check (
    challenge_expires_at > challenge_issued_at and
    challenge_expires_at <= challenge_issued_at + interval '15 minutes'
  ),
  constraint builder_claims_used_time_check check (
    challenge_used_at is null or (
      challenge_used_at >= challenge_issued_at and
      challenge_used_at <= challenge_expires_at
    )
  ),
  constraint builder_claims_proof_time_check check (
    proof_checked_at is null or (
      proof_checked_at >= challenge_issued_at and
      proof_checked_at <= challenge_expires_at and
      challenge_used_at is not null and
      proof_checked_at >= challenge_used_at
    )
  ),
  constraint builder_claims_approval_check check (
    status <> 'approved' or (
      proof_checked_at is not null and reviewed_at >= proof_checked_at and
      reviewed_by is not null and revoked_at is null
    )
  ),
  constraint builder_claims_revocation_check check (
    status <> 'revoked' or revoked_at is not null
  )
);

-- Concurrent requests cannot create duplicate active claims for one contact or
-- two approved owners for one listing.
create unique index if not exists builder_claims_active_contact_idx
  on public.builder_claims (app_id, lower(claimant_contact))
  where status in ('pending', 'proof_checked', 'approved', 'disputed');
create unique index if not exists builder_claims_one_approved_per_app_idx
  on public.builder_claims (app_id) where status = 'approved';
create index if not exists builder_claims_status_created_idx
  on public.builder_claims (status, created_at desc);

create schema if not exists base_radar_private;
revoke all on schema base_radar_private from public, anon, authenticated, service_role;

-- This table deliberately contains no contact, token, digest, DNS response or
-- free-form text. App code must not log those values either.
create table if not exists public.builder_claim_audit (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.builder_claims(id) on delete restrict,
  event_type text not null,
  old_status text,
  new_status text not null,
  reviewer_id text,
  recorded_at timestamptz not null default now(),
  constraint builder_claim_audit_event_type_check check (
    event_type in ('created', 'status_changed', 'proof_updated', 'review_updated', 'revocation_updated')
  )
);
create index if not exists builder_claim_audit_claim_recorded_idx
  on public.builder_claim_audit (claim_id, recorded_at desc);

create or replace function base_radar_private.record_builder_claim_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare previous_status text;
declare audit_event text;
begin
  if tg_op = 'UPDATE' then
    previous_status := old.status;
    if old.status is distinct from new.status then
      audit_event := 'status_changed';
    elsif old.revoked_at is distinct from new.revoked_at then
      audit_event := 'revocation_updated';
    elsif old.proof_checked_at is distinct from new.proof_checked_at then
      audit_event := 'proof_updated';
    else
      audit_event := 'review_updated';
    end if;
  else
    audit_event := 'created';
  end if;
  insert into public.builder_claim_audit (claim_id, event_type, old_status, new_status, reviewer_id)
  values (new.id, audit_event, previous_status, new.status, new.reviewed_by);
  return new;
end;
$$;

drop trigger if exists builder_claim_transition_audit on public.builder_claims;
create trigger builder_claim_transition_audit
after insert or update of status, proof_checked_at, reviewed_at, reviewed_by, revoked_at
on public.builder_claims
for each row execute function base_radar_private.record_builder_claim_transition();

alter table public.builder_claims enable row level security;
alter table public.builder_claim_audit enable row level security;
revoke all on table public.builder_claims from public, anon, authenticated, service_role;
revoke all on table public.builder_claim_audit from public, anon, authenticated, service_role;
revoke all on function base_radar_private.record_builder_claim_transition() from public, anon, authenticated, service_role;

-- No anon/authenticated policies are created. Only server-side moderation using
-- the service role may create/update claims; audit writes happen in the trigger.
grant select, insert, update on table public.builder_claims to service_role;
grant select on table public.builder_claim_audit to service_role;
