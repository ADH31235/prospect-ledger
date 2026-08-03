-- ============================================================
-- LEAD DETAIL FIELDS — ADDITIONAL COLUMNS
-- Expands the leads table with fields useful for wealth advisory
-- prospecting beyond the original set.
-- ============================================================

alter table leads add column if not exists phone text;
alter table leads add column if not exists linkedin_url text;
alter table leads add column if not exists current_investment_products text; -- free text: what they currently hold (funds, direct equities, real estate, etc.)
alter table leads add column if not exists current_provider text;           -- who they currently bank/invest with, if known
alter table leads add column if not exists risk_profile text;               -- conservative / balanced / growth / aggressive / unknown
alter table leads add column if not exists preferred_contact_method text;   -- email / phone / whatsapp / linkedin
alter table leads add column if not exists next_follow_up_date date;        -- your own reminder date, separate from sequence scheduling
alter table leads add column if not exists date_of_birth date;
