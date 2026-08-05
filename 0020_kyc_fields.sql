-- ============================================================
-- Standard KYC/client-onboarding fields for a regulated wealth
-- advisory practice — nationality, marital status, ID/passport,
-- home address, and expanded current-provider scheme details
-- (type, account number, start/maturity dates), alongside the
-- existing provider name field.
--
-- These are sensitive personal fields — same tenant-scoped access
-- control as everything else on leads already applies (Phase 1
-- RLS), no additional exposure beyond what the table already has.
-- ============================================================

alter table leads add column if not exists nationality text;
alter table leads add column if not exists gender text;
alter table leads add column if not exists number_of_children integer;
alter table leads add column if not exists marital_status text;
alter table leads add column if not exists spouse_partner_name text;
alter table leads add column if not exists country_of_residence text;
alter table leads add column if not exists id_passport_number text;
alter table leads add column if not exists home_address text;
alter table leads add column if not exists trustee text;

alter table leads add column if not exists current_provider_scheme_type text;
alter table leads add column if not exists current_provider_account_no text;
alter table leads add column if not exists current_provider_start_date date;
alter table leads add column if not exists current_provider_maturity_date date;
