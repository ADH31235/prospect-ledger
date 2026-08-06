-- ============================================================
-- SUBSCRIPTION ACCESS CONTROL
--
-- Rule: without an active subscription (or an active admin-granted
-- trial), a tenant can still READ their leads (view-only Ledger),
-- but cannot write to leads, and cannot access anything else at
-- all — not read, not write. This is enforced here at the RLS
-- level, not just by hiding buttons in the UI, since a frontend-only
-- restriction can always be bypassed by calling the API directly.
-- ============================================================

alter table tenants add column if not exists trial_access_until timestamptz;

create or replace function has_active_access(check_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from tenants
    where id = check_tenant_id
      and (
        subscription_status in ('active', 'trialing')
        or (trial_access_until is not null and trial_access_until >= now())
      )
  );
$$;

-- ------------------------------------------------------------
-- LEADS — split into read (always allowed, tenant-scoped) and
-- write (requires active access). This is what makes the Ledger
-- view-only rather than fully blocked when unsubscribed.
-- ------------------------------------------------------------
drop policy if exists "tenant access on leads" on leads;

create policy "tenant read leads" on leads for select
  using (tenant_id = get_my_tenant_id());

create policy "tenant insert leads" on leads for insert
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

create policy "tenant update leads" on leads for update
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

create policy "tenant delete leads" on leads for delete
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

-- ------------------------------------------------------------
-- Everything else — fully gated, both read and write. These are
-- the tabs that should be completely inaccessible without an
-- active subscription, not just view-only.
-- ------------------------------------------------------------
drop policy if exists "tenant access on jurisdictions" on jurisdictions;
create policy "tenant access on jurisdictions" on jurisdictions for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on licenses" on licenses;
create policy "tenant access on licenses" on licenses for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on scoring_criteria" on scoring_criteria;
create policy "tenant access on scoring_criteria" on scoring_criteria for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on outreach_events" on outreach_events;
create policy "tenant access on outreach_events" on outreach_events for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on compliance_reviews" on compliance_reviews;
create policy "tenant access on compliance_reviews" on compliance_reviews for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on sequences" on sequences;
create policy "tenant access on sequences" on sequences for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on sequence_steps" on sequence_steps;
create policy "tenant access on sequence_steps" on sequence_steps for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on sequence_enrollments" on sequence_enrollments;
create policy "tenant access on sequence_enrollments" on sequence_enrollments for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on scheduled_sends" on scheduled_sends;
create policy "tenant access on scheduled_sends" on scheduled_sends for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on template_approvals" on template_approvals;
create policy "tenant access on template_approvals" on template_approvals for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on newsletter_subscribers" on newsletter_subscribers;
create policy "tenant access on newsletter_subscribers" on newsletter_subscribers for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on newsletter_issues" on newsletter_issues;
create policy "tenant access on newsletter_issues" on newsletter_issues for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on deal_signals" on deal_signals;
create policy "tenant access on deal_signals" on deal_signals for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on lead_stage_history" on lead_stage_history;
create policy "tenant access on lead_stage_history" on lead_stage_history for select
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant manage webinars" on webinars;
create policy "tenant manage webinars" on webinars for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on webinar_registrations" on webinar_registrations;
create policy "tenant access on webinar_registrations" on webinar_registrations for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

drop policy if exists "tenant access on content_pieces" on content_pieces;
create policy "tenant access on content_pieces" on content_pieces for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

-- Note: profiles and tenants themselves are deliberately NOT
-- gated — a user always needs to be able to read their own tenant
-- row (to see their subscription_status and know to subscribe)
-- even without an active subscription. Gating those would create
-- a lockout where someone couldn't even see why they're blocked.
