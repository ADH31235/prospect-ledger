-- ============================================================
-- PLATFORM ADMIN BYPASS
--
-- The platform admin's own account should never be gated by its
-- own subscription status — without this, the UI checks (fixed
-- client-side already) would show full access while the actual
-- database writes still silently failed underneath, since RLS is
-- what really enforces this, not the frontend.
-- ============================================================

create or replace function has_active_access(check_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select
    exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
    or exists (
      select 1 from tenants
      where id = check_tenant_id
        and (
          subscription_status in ('active', 'trialing')
          or (trial_access_until is not null and trial_access_until >= now())
        )
    );
$$;

create or replace function has_professional_tier(check_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select
    exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
    or exists (
      select 1 from tenants
      where id = check_tenant_id
        and (
          (trial_access_until is not null and trial_access_until >= now())
          or (
            plan_tier in ('professional', 'enterprise')
            and subscription_status in ('active', 'trialing')
          )
        )
    );
$$;
