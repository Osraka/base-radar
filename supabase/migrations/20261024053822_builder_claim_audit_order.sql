-- Preserve transition order even when several changes share one transaction timestamp.
alter table public.builder_claim_audit
  add column audit_seq bigint generated always as identity;

alter table public.builder_claim_audit
  alter column recorded_at set default clock_timestamp();

create unique index builder_claim_audit_seq_idx
  on public.builder_claim_audit (audit_seq);
