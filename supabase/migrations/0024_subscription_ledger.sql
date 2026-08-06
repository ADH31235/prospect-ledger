-- ============================================================
-- SUBSCRIPTION LEDGER
--
-- Tracks companies who are prospects for SUBSCRIBING to Trivara
-- Hub itself — your own SaaS sales pipeline. Deliberately separate
-- from the `leads` table, which is each tenant's own book of
-- wealth-advisory clients/prospects. This table isn't tenant-scoped
-- at all — it belongs to the platform, not to any one company, and
-- only you (platform admin) can see or touch it.
-- ============================================================

create table if not exists subscription_prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  stage text not null default 'new' check (
    stage in ('new', 'contacted', 'demo_scheduled', 'trial', 'negotiating', 'won', 'lost')
  ),
  interested_tier text check (interested_tier in ('starter', 'professional', 'enterprise')),
  source text,
  notes text,
  converted_tenant_id uuid references tenants(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table subscription_prospects enable row level security;

create policy "platform admin manages subscription prospects" on subscription_prospects for all
  using (
    exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true)
  );
