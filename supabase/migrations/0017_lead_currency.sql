-- ============================================================
-- Each lead's estimated_investable_assets figure needs its own
-- currency, since prospects across Portugal, UAE, and elsewhere
-- won't all be quoted in GBP. Defaults to GBP for existing rows,
-- matching what the £ symbol hardcoded in the UI already assumed.
-- ============================================================

alter table leads add column if not exists currency text not null default 'GBP';
