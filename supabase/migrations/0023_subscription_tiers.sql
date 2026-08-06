-- ============================================================
-- SUBSCRIPTION TIERS
--
-- plan_tier is separate from subscription_status — status says
-- whether they're paying at all, tier says which package. Starter
-- gets the Ledger and basic jurisdiction gating only. Professional
-- and above unlock sequences, newsletter, webinars, content
-- library, deal signals, and fee/revenue analytics.
-- ============================================================

alter table tenants add column if not exists plan_tier text default 'starter'
  check (plan_tier in ('starter', 'professional', 'enterprise'));
alter table tenants add column if not exists seat_count integer default 1;

create or replace function has_professional_tier(check_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from tenants
    where id = check_tenant_id
      and (
        -- An admin-granted trial shows the full product, not just
        -- Starter — the whole point is to demonstrate everything
        -- before someone commits to a paid tier.
        (trial_access_until is not null and trial_access_until >= now())
        or (
          plan_tier in ('professional', 'enterprise')
          and subscription_status in ('active', 'trialing')
        )
      )
  );
$$;

-- ------------------------------------------------------------
-- Professional-only tables — Starter doesn't get these at all,
-- not even read access. Jurisdictions, licenses, scoring_criteria,
-- outreach_events, compliance_reviews, and lead_stage_history stay
-- on the broader has_active_access() check from the previous
-- migration, since jurisdiction-based compliance gating is
-- explicitly part of what Starter includes.
-- ------------------------------------------------------------
drop policy if exists "tenant access on sequences" on sequences;
create policy "tenant access on sequences" on sequences for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on sequence_steps" on sequence_steps;
create policy "tenant access on sequence_steps" on sequence_steps for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on sequence_enrollments" on sequence_enrollments;
create policy "tenant access on sequence_enrollments" on sequence_enrollments for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on scheduled_sends" on scheduled_sends;
create policy "tenant access on scheduled_sends" on scheduled_sends for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on template_approvals" on template_approvals;
create policy "tenant access on template_approvals" on template_approvals for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on newsletter_subscribers" on newsletter_subscribers;
create policy "tenant access on newsletter_subscribers" on newsletter_subscribers for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on newsletter_issues" on newsletter_issues;
create policy "tenant access on newsletter_issues" on newsletter_issues for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on deal_signals" on deal_signals;
create policy "tenant access on deal_signals" on deal_signals for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant manage webinars" on webinars;
create policy "tenant manage webinars" on webinars for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on webinar_registrations" on webinar_registrations;
create policy "tenant access on webinar_registrations" on webinar_registrations for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));

drop policy if exists "tenant access on content_pieces" on content_pieces;
create policy "tenant access on content_pieces" on content_pieces for all
  using (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_professional_tier(tenant_id));
