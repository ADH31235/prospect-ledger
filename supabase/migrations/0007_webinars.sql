-- ============================================================
-- WEBINARS / EVENTS
-- webinars: public read (title/date/description aren't sensitive
-- and need to be visible on the public signup page), full manage
-- access for you.
-- webinar_registrations: contains PII, so read is authenticated-
-- only — inserts happen exclusively through the register-webinar
-- edge function (service role), same pattern as every other
-- public-facing capture point.
-- ============================================================

create table webinars (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  scheduled_at timestamptz not null,
  location_or_link text,          -- Zoom link, venue address, etc.
  status text not null default 'upcoming' check (status in ('upcoming', 'completed', 'cancelled')),
  created_at timestamptz default now()
);

create table webinar_registrations (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references webinars(id) on delete cascade,
  lead_id uuid references leads(id),
  full_name text not null,
  email text not null,
  phone text,
  country_text text,
  ad_tracking jsonb,
  attended boolean,
  created_at timestamptz default now()
);

create index idx_webinar_registrations_webinar_id on webinar_registrations(webinar_id);

alter table webinars enable row level security;
alter table webinar_registrations enable row level security;

create policy "public read on webinars" on webinars for select
  using (true);

create policy "authenticated manage webinars" on webinars for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated read on webinar_registrations" on webinar_registrations for select
  using (auth.role() = 'authenticated');

alter publication supabase_realtime add table webinars;
alter publication supabase_realtime add table webinar_registrations;
