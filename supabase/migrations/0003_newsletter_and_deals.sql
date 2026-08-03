-- ============================================================
-- NEWSLETTER / OPT-IN CONTENT SYSTEM
-- Genuinely separate from the leads table on purpose. A lead
-- from Apollo/import is NOT a subscriber. Someone only enters
-- this table by actively submitting the subscribe form, and
-- only becomes 'confirmed' by clicking a link in their own inbox
-- (double opt-in) — never by being added from anywhere else.
-- ============================================================

create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  confirmation_token uuid not null default gen_random_uuid(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  source text,                          -- 'cold_outreach_cta', 'website', 'referral', etc.
  lead_id uuid references leads(id),    -- optional: links back to the outbound lead who converted, if any
  created_at timestamptz default now()
);

create index idx_newsletter_subscribers_status on newsletter_subscribers(status);
create index idx_newsletter_subscribers_token on newsletter_subscribers(confirmation_token);

create table newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,                   -- plain text; {{unsubscribe_link}} gets substituted per-recipient at send time
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent')),
  sent_at timestamptz,
  sent_count int default 0,
  created_at timestamptz default now()
);

-- RLS: subscribers can only be inserted by the public subscribe
-- flow (via the edge function's service-role key, not the anon
-- key directly) and only read/managed by you as the authenticated
-- app user. The public 'subscribe' and 'newsletter-action' edge
-- functions run with the service role, bypassing RLS entirely by
-- design — this table is deliberately NOT writable by the anon key.
alter table newsletter_subscribers enable row level security;
alter table newsletter_issues enable row level security;

create policy "authenticated read/write on newsletter_subscribers" on newsletter_subscribers for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write on newsletter_issues" on newsletter_issues for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- DEAL SIGNALS
-- Lightweight tracker for manually-sourced liquidity-event leads
-- (spotted via Crunchbase, PitchBook, press releases, Google
-- Alerts, etc). Logging the event first, then converting to a
-- lead once you've identified the actual person, keeps a record
-- of where the signal came from even before you have a name.
-- ============================================================
create table deal_signals (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  event_type text not null check (event_type in ('exit', 'funding_round', 'ipo', 'acquisition', 'other')),
  event_date date,
  source_url text,
  source_name text,                     -- 'Crunchbase', 'TechCrunch', 'Google Alert', etc.
  jurisdiction_id uuid references jurisdictions(id),
  notes text,
  converted_to_lead_id uuid references leads(id),  -- set once you've converted this into a real lead
  created_at timestamptz default now()
);

alter table deal_signals enable row level security;
create policy "authenticated read/write on deal_signals" on deal_signals for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table newsletter_subscribers;
alter publication supabase_realtime add table deal_signals;
