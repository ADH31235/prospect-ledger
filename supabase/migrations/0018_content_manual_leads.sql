-- ============================================================
-- The lead count on Content Library was purely automatic — only
-- counting leads that clicked a tracked link. Real conversions
-- from a post (a DM, someone mentioning it on a call) never show
-- up that way. This adds a separate manually-editable count you
-- can log yourself, shown alongside the automatic one rather than
-- replacing it — both are real signal, just from different sources.
-- ============================================================

alter table content_pieces add column if not exists manual_lead_count integer not null default 0;
