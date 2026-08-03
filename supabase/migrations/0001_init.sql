-- ============================================================
-- LEAD GEN PLATFORM SCHEMA
-- Built for solo use (MM Private EU + Dubai license context)
-- but structured so it can go multi-tenant later without a
-- painful migration. tenant_id defaults to a single value now.
-- ============================================================

-- Enable RLS-friendly extensions
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- TENANTS (you're the only row here for now)
-- ------------------------------------------------------------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

insert into tenants (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Angie - Personal Book');

-- ------------------------------------------------------------
-- LICENSES
-- The regulatory "hat" you're wearing when you contact a lead.
-- Every lead and every outreach action must be tagged with
-- exactly one license context so you always know which
-- compliance rules apply.
-- ------------------------------------------------------------
create table licenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000001',
  code text unique not null,            -- e.g. 'MM_PRIVATE_EU', 'MONDIAL_DUBAI'
  entity_name text not null,             -- e.g. 'MM Private Empresa de Investimento, S.A.'
  home_jurisdiction text not null,       -- e.g. 'Portugal', 'UAE'
  regulator text,                        -- e.g. 'CMVM', 'SCA'
  permitted_activities text,             -- free text summary, not legal advice
  notes text,
  created_at timestamptz default now()
);

insert into licenses (code, entity_name, home_jurisdiction, regulator) values
  ('MM_PRIVATE_EU', 'MM Private Empresa de Investimento, S.A.', 'Portugal', 'CMVM'),
  ('MONDIAL_DUBAI', 'Mondial Dubai LLC', 'UAE', 'SCA');

-- ------------------------------------------------------------
-- JURISDICTIONS
-- One row per country/market you might target. This is the
-- core compliance gate: is cross-border solicitation from
-- either license into this market low-risk, or does it need
-- a lawyer's sign-off before you touch it?
-- ------------------------------------------------------------
create table jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  region text not null check (region in ('Europe','Middle East','Asia','Other')),
  solicitation_risk text not null check (
    solicitation_risk in ('low','review_required','do_not_contact')
  ),
  applicable_license text references licenses(code),
  local_regulator text,
  review_notes text,                     -- e.g. "reverse solicitation only, no active marketing"
  last_reviewed_at date,
  created_at timestamptz default now()
);

-- Seed a starting set — treat solicitation_risk as a placeholder
-- until each one is actually checked with counsel. Do not rely
-- on these defaults for real outreach decisions.
insert into jurisdictions (country, region, solicitation_risk, applicable_license, review_notes) values
  ('Portugal', 'Europe', 'review_required', 'MM_PRIVATE_EU', 'Home market for MM Private license — confirm passporting scope'),
  ('United Arab Emirates', 'Middle East', 'review_required', 'MONDIAL_DUBAI', 'Home market for SCA license — confirm onshore vs DIFC/ADGM scope'),
  ('Switzerland', 'Europe', 'review_required', null, 'Non-EU, own cross-border advisory regime'),
  ('Singapore', 'Asia', 'review_required', null, 'MAS licensing regime — check reverse solicitation exemption scope'),
  ('Hong Kong', 'Asia', 'review_required', null, 'SFC regime — check Type 1/4/9 activity overlap');

-- ------------------------------------------------------------
-- LEADS
-- ------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000001',

  -- identity
  full_name text not null,
  email text,
  phone text,
  linkedin_url text,
  company text,
  job_title text,

  -- geography / compliance gate
  jurisdiction_id uuid references jurisdictions(id),
  license_id uuid references licenses(id),   -- which license context you'd approach them under

  -- qualification signals
  net_worth_signal text,          -- e.g. 'exited_founder', 'senior_exec', 'inherited_wealth', 'unknown'
  estimated_investable_assets numeric,  -- rough estimate, GBP equivalent
  liquidity_event text,           -- e.g. 'exit', 'ipo', 'inheritance', 'retirement', 'none'
  liquidity_event_date date,
  existing_advisor boolean,

  -- source
  source text,                    -- 'linkedin', 'referral', 'inbound_form', 'event', 'apollo', etc
  referred_by text,

  -- pipeline
  stage text default 'new' check (
    stage in ('new','enriched','contacted','engaged','qualified','client','disqualified','do_not_contact')
  ),
  score numeric default 0,

  -- compliance trail
  consent_basis text,             -- 'legitimate_interest', 'consent', 'referral_introduction', null
  opted_out boolean default false,
  compliance_flag text,           -- free text if something needs review before contact

  notes text,
  last_contact_at timestamptz,    -- update this whenever an outreach_event is logged
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_leads_stage on leads(stage);
create index idx_leads_jurisdiction on leads(jurisdiction_id);
create index idx_leads_score on leads(score desc);

-- ------------------------------------------------------------
-- SCORING CRITERIA (configurable, not hardcoded)
-- ------------------------------------------------------------
create table scoring_criteria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000001',
  criterion_key text unique not null,   -- e.g. 'liquidity_event_recent'
  description text,
  weight numeric not null default 1,
  active boolean default true
);

insert into scoring_criteria (criterion_key, description, weight) values
  ('liquidity_event_recent', 'Liquidity event within last 12 months', 25),
  ('net_worth_high_confidence', 'Strong signal of £1M+ investable assets', 30),
  ('no_existing_advisor', 'No existing advisor relationship', 15),
  ('warm_referral', 'Came via referral rather than cold outreach', 20),
  ('jurisdiction_low_risk', 'Jurisdiction cleared as low solicitation risk', 10);

-- ------------------------------------------------------------
-- OUTREACH LOG (your compliance audit trail lives here)
-- ------------------------------------------------------------
create table outreach_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  license_id uuid references licenses(id),
  channel text,                   -- 'email','linkedin','phone','event'
  direction text check (direction in ('outbound','inbound')),
  content_summary text,           -- what was actually sent/said, for audit purposes
  sent_at timestamptz default now()
);

-- ------------------------------------------------------------
-- COMPLIANCE REVIEW LOG
-- Every time you decide a jurisdiction or lead is clear to
-- contact, log it here with a date and reasoning. This is your
-- evidence trail if MM Private or SCA compliance ever asks.
-- ------------------------------------------------------------
create table compliance_reviews (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid references jurisdictions(id),
  lead_id uuid references leads(id),
  reviewed_by text,
  review_outcome text,            -- 'cleared','blocked','needs_counsel'
  review_notes text,
  reviewed_at timestamptz default now()
);

-- ------------------------------------------------------------
-- REALTIME
-- Required once so the dashboard's live subscription (see
-- useLeads.ts) picks up changes made elsewhere, e.g. the
-- enrichment pipeline updating a lead's score.
-- ------------------------------------------------------------
alter publication supabase_realtime add table leads;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Since you're the only user today, this just locks the tables
-- to authenticated access. Tighten further (per-tenant policies)
-- if you productize this later.
-- ------------------------------------------------------------
alter table leads enable row level security;
alter table jurisdictions enable row level security;
alter table licenses enable row level security;

create policy "authenticated read/write on leads"
  on leads for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated read on jurisdictions"
  on jurisdictions for select
  using (auth.role() = 'authenticated');

create policy "authenticated read on licenses"
  on licenses for select
  using (auth.role() = 'authenticated');
-- ============================================================
-- OUTREACH SEQUENCING SCHEMA
-- Extends schema.sql. Email steps can be sent automatically;
-- LinkedIn steps are tracked as manual tasks only — no
-- automated LinkedIn messaging (violates their ToS and risks
-- account bans).
-- ============================================================

-- ------------------------------------------------------------
-- SEQUENCES
-- ------------------------------------------------------------
create table sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000001',
  name text not null,
  license_id uuid references licenses(id),  -- which license context this sequence operates under
  description text,
  active boolean default true,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- SEQUENCE STEPS
-- Templates live here. requires_compliance_review defaults to
-- true for anything mentioning investment services — flip to
-- false only after you're confident a step is pure relationship-
-- building content (e.g. "congrats on the exit" with no product
-- mention).
-- ------------------------------------------------------------
create table sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references sequences(id) on delete cascade,
  step_order int not null,
  channel text not null check (channel in ('email','linkedin_manual')),
  delay_days int not null default 0,        -- days after enrollment (or after previous step)
  subject_template text,                     -- email only
  body_template text not null,               -- merge fields like {{first_name}}, {{company}}
  requires_compliance_review boolean not null default true,
  approved_template_version int,             -- bump when template text changes; invalidates prior approval
  created_at timestamptz default now(),
  unique (sequence_id, step_order)
);

-- ------------------------------------------------------------
-- TEMPLATE APPROVALS
-- A step's current body_template is only sendable if there's an
-- approval row matching its approved_template_version. Keeps a
-- durable record of who signed off on marketing copy and when —
-- your MiFID II marketing-communication audit trail.
-- ------------------------------------------------------------
create table template_approvals (
  id uuid primary key default gen_random_uuid(),
  step_id uuid references sequence_steps(id) on delete cascade,
  template_version int not null,
  approved_by text not null,
  approved_at timestamptz default now(),
  notes text
);

-- ------------------------------------------------------------
-- ENROLLMENTS
-- ------------------------------------------------------------
create table sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  sequence_id uuid references sequences(id),
  current_step int not null default 0,
  status text not null default 'active' check (
    status in ('active','paused','completed','stopped','blocked_compliance')
  ),
  enrolled_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (lead_id, sequence_id)
);

-- ------------------------------------------------------------
-- SCHEDULED SENDS
-- One row per step per enrollment. The processor (see
-- sequenceEngine.ts) scans for rows due now, checks every gate,
-- and either sends (email) or surfaces a task (linkedin_manual).
-- ------------------------------------------------------------
create table scheduled_sends (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references sequence_enrollments(id) on delete cascade,
  step_id uuid references sequence_steps(id),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (
    status in ('pending','sent','task_created','failed','blocked_compliance','blocked_jurisdiction','skipped')
  ),
  block_reason text,
  provider_message_id text,       -- SendGrid message id, for delivery tracking
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index idx_scheduled_sends_due on scheduled_sends(scheduled_for) where status = 'pending';

-- ------------------------------------------------------------
-- REALTIME + RLS (same pattern as leads)
-- ------------------------------------------------------------
alter publication supabase_realtime add table scheduled_sends;

alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table sequence_enrollments enable row level security;
alter table scheduled_sends enable row level security;
alter table template_approvals enable row level security;

create policy "authenticated all on sequences" on sequences for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated all on sequence_steps" on sequence_steps for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated all on sequence_enrollments" on sequence_enrollments for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated all on scheduled_sends" on scheduled_sends for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated all on template_approvals" on template_approvals for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
