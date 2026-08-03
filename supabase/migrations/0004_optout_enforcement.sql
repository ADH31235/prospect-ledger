-- ============================================================
-- OPT-OUT ENFORCEMENT
-- Adds the missing status value for sends blocked by an opt-out,
-- and a timestamp so you can see when someone opted out (the
-- opted_out boolean already existed on leads from the original
-- schema, but nothing enforced it and there was no way to record
-- when it happened).
-- ============================================================

alter table scheduled_sends drop constraint if exists scheduled_sends_status_check;
alter table scheduled_sends add constraint scheduled_sends_status_check
  check (status in ('pending','sent','task_created','failed','blocked_compliance','blocked_jurisdiction','blocked_opted_out','skipped'));

alter table leads add column if not exists opted_out_at timestamptz;
