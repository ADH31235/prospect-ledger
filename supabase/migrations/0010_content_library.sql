-- ============================================================
-- CONTENT LIBRARY
-- Doesn't duplicate the ad_tracking capture already built —
-- content pieces just get a unique slug that you paste into a
-- link's utm_content param. Reports matches leads back to a
-- content piece by that slug, giving conversion-per-post instead
-- of just conversion-per-campaign.
-- ============================================================

create table content_pieces (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content_type text not null default 'linkedin_post'
    check (content_type in ('linkedin_post', 'webinar_announcement', 'newsletter_issue', 'ad', 'other')),
  slug text not null unique,
  body_preview text,
  published_at date,
  created_at timestamptz default now()
);

alter table content_pieces enable row level security;

create policy "authenticated manage content_pieces" on content_pieces for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table content_pieces;
