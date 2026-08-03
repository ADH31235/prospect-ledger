-- ============================================================
-- PROVENANCE GATE
-- For data of unknown origin — same pattern as the jurisdiction
-- and opt-out gates: blocks any enrollment/send until someone
-- explicitly reviews and clears it. Reuses compliance_reviews
-- for the audit trail (lead_id already supported there).
-- ============================================================

alter table leads add column if not exists provenance_unknown boolean not null default false;
alter table leads add column if not exists provenance_note text;

alter table scheduled_sends drop constraint if exists scheduled_sends_status_check;
alter table scheduled_sends add constraint scheduled_sends_status_check
  check (status in ('pending','sent','task_created','failed','blocked_compliance','blocked_jurisdiction','blocked_opted_out','blocked_provenance','skipped'));
