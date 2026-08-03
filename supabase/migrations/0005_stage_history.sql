-- ============================================================
-- STAGE HISTORY TRACKING
-- Logs every stage transition automatically via a database
-- trigger — not something the app code has to remember to call.
-- This means it captures changes from the UI, CSV import,
-- enrichment jobs, or anything else that ever touches leads.stage,
-- including ones we haven't built yet.
-- ============================================================

create table lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  from_stage text,               -- null for the very first row (lead creation)
  to_stage text not null,
  changed_at timestamptz not null default now()
);

create index idx_lead_stage_history_lead_id on lead_stage_history(lead_id);
create index idx_lead_stage_history_changed_at on lead_stage_history(changed_at desc);

alter table lead_stage_history enable row level security;

-- Read-only for the app — rows are only ever written by the
-- trigger below (running as security definer), never by direct
-- client inserts, so there's deliberately no insert policy here.
create policy "authenticated read on lead_stage_history" on lead_stage_history for select
  using (auth.role() = 'authenticated');

create or replace function log_lead_stage_change() returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    insert into lead_stage_history (lead_id, from_stage, to_stage)
    values (new.id, null, new.stage);
    return new;
  elsif (TG_OP = 'UPDATE') then
    if new.stage is distinct from old.stage then
      insert into lead_stage_history (lead_id, from_stage, to_stage)
      values (new.id, old.stage, new.stage);
    end if;
    return new;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger trg_log_lead_stage_change
  after insert or update on leads
  for each row execute function log_lead_stage_change();

alter publication supabase_realtime add table lead_stage_history;

-- Backfill: existing leads predate the trigger, so without this
-- they'd show zero history until their next stage change. This
-- gives each one a starting entry at their creation date — not
-- perfectly accurate for any that already changed stage before
-- today, but a reasonable baseline rather than an empty history.
insert into lead_stage_history (lead_id, from_stage, to_stage, changed_at)
select id, null, stage, created_at
from leads
where not exists (
  select 1 from lead_stage_history where lead_stage_history.lead_id = leads.id
);
