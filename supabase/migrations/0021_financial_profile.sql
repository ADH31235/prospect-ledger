-- ============================================================
-- FINANCIAL PROFILE
--
-- Replaces a single "Est. Assets" number with an actual
-- breakdown across asset classes — the kind of detail a real
-- fact-find needs. Repeatable categories (bank accounts,
-- properties, pensions, other investments, other liabilities)
-- use jsonb arrays rather than separate tables — each holds
-- multiple entries like [{ "label": "...", "value": 120000 }],
-- or for properties [{ "location": "...", "value": 450000 }].
-- This keeps the schema simple while still allowing someone to
-- have, say, three properties or two pensions.
--
-- estimated_investable_assets (the old single figure) is left
-- untouched for backward compatibility with existing data — the
-- new Portfolio Value shown in the Ledger is computed in the
-- frontend from the fields below, not stored separately, so it
-- can never drift out of sync with its components.
-- ============================================================

alter table leads add column if not exists bank_accounts jsonb not null default '[]';
alter table leads add column if not exists properties jsonb not null default '[]';
alter table leads add column if not exists pensions jsonb not null default '[]';
alter table leads add column if not exists other_investments jsonb not null default '[]';
alter table leads add column if not exists other_liabilities jsonb not null default '[]';

alter table leads add column if not exists mortgage_value numeric;

alter table leads add column if not exists annual_income numeric;
alter table leads add column if not exists annual_expenditure numeric;
-- Disposable income is deliberately NOT a stored column — it's
-- income minus expenditure, computed live in the UI wherever it's
-- shown, so it's never stale relative to the two figures it
-- depends on.

alter table leads add column if not exists insurance_details text;
alter table leads add column if not exists retirement_age integer;
alter table leads add column if not exists desired_retirement_income numeric;
alter table leads add column if not exists location text;

-- ------------------------------------------------------------
-- Client fees — only meaningful once someone is actually a
-- client, but stored on the same row rather than a separate
-- table since it's a 1:1 relationship with no history requirement
-- (unlike, say, stage changes, which do need a history).
-- ------------------------------------------------------------
alter table leads add column if not exists fee_amount numeric;
alter table leads add column if not exists fee_periodicity text;
alter table leads add column if not exists fee_basis text;
alter table leads add column if not exists fee_payment_method text;
alter table leads add column if not exists next_fee_review_date date;
