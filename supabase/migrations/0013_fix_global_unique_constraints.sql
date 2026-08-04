-- ============================================================
-- FIX: two constraints that were unique across ALL companies,
-- when they should only be unique WITHIN one company.
--
-- scoring_criteria.criterion_key: blocks seeding the same
-- default criteria for a new tenant, since your tenant already
-- owns those exact keys.
--
-- newsletter_subscribers.email: would wrongly reject a second
-- company's subscriber if someone happened to already be
-- subscribed to a different company's newsletter with the same
-- email address.
-- ============================================================

alter table scoring_criteria drop constraint if exists scoring_criteria_criterion_key_key;
alter table scoring_criteria add constraint scoring_criteria_tenant_key_unique unique (tenant_id, criterion_key);

alter table newsletter_subscribers drop constraint if exists newsletter_subscribers_email_key;
alter table newsletter_subscribers add constraint newsletter_subscribers_tenant_email_unique unique (tenant_id, email);
