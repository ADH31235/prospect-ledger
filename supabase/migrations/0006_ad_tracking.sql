-- ============================================================
-- AD TRACKING
-- A single JSONB column rather than a dozen narrow ones — new
-- ad platforms add new parameters over time (Meta, Google, TikTok
-- all differ slightly), and this way capturing a new one never
-- needs a schema migration, just a small edge function update.
-- ============================================================

alter table leads add column if not exists ad_tracking jsonb;

create index if not exists idx_leads_ad_tracking on leads using gin (ad_tracking);
