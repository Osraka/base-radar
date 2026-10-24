-- Expired, unused challenges must not permanently block a new request.
alter table public.builder_claims
  drop constraint builder_claims_status_check;

alter table public.builder_claims
  add constraint builder_claims_status_check check (
    status in ('pending', 'proof_checked', 'approved', 'rejected', 'disputed', 'revoked', 'expired')
  );
