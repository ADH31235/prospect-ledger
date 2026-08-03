# Prospect Ledger

Personal lead-gen and outreach system for building the book across MM Private (EU) and Mondial Dubai licenses, with jurisdiction and compliance gating built into the data model.

## Stack
- React + Vite (frontend)
- Supabase (Postgres, Auth, Realtime, Edge Functions)
- SendGrid (email sending)
- Apollo (enrichment) — swap for Clay/Cognism later, see `src/enrichment.ts`

## 1. Supabase project

1. Create a project at supabase.com.
2. Run the migrations in order (SQL editor, or `supabase db push` if using the CLI):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed_sequences.sql`
3. Note your Project URL and anon key (Settings → API) — you'll need these for `.env`.
4. Enable email/password auth (Authentication → Providers) — this app assumes a single authenticated user (you).

## 2. Frontend

```bash
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Visit `http://localhost:5173`. You'll need to sign in (create a user under Authentication → Users in the Supabase dashboard, or add a simple sign-in screen — not included here since it's just you for now).

## 3. Deploy the frontend (Vercel)

```bash
npm install -g vercel
vercel
```

In the Vercel project settings, add the same two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) under Environment Variables, then redeploy.

## 4. Edge Functions (enrichment + sequencing)

Install the Supabase CLI, then:

```bash
supabase login
supabase link --project-ref <your-project-ref>

# Secrets — backend only, never in the frontend .env
supabase secrets set SUPABASE_URL=https://<ref>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
supabase secrets set SENDGRID_API_KEY=<key>
supabase secrets set FROM_EMAIL=you@yourdomain.com
supabase secrets set FROM_NAME="Angela Duarte Henriques"
supabase secrets set APOLLO_API_KEY=<key>

supabase functions deploy run-enrichment
supabase functions deploy process-sequences
```

## 5. Scheduling the functions

Edge Functions don't run on their own — trigger them on a schedule via `pg_cron` + `pg_net` (both available by default on Supabase). In the SQL editor:

```sql
select cron.schedule(
  'run-enrichment-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/run-enrichment',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
  );
  $$
);

select cron.schedule(
  'process-sequences-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/process-sequences',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
  );
  $$
);
```

Check scheduled runs anytime with `select * from cron.job_run_details order by start_time desc limit 20;`.

## 6. Before sending anything for real

- Every jurisdiction in `jurisdictions` defaults to `review_required` — go through the Compliance tab and clear (or block) each market you actually plan to contact. Treat the seeded `solicitation_risk` values as placeholders, not legal conclusions.
- Every sequence step defaults to `requires_compliance_review = true` with no approval — review the actual copy in the Compliance → Templates tab and approve before the sequencing function will send it.
- Confirm with MM Private's and Mondial's compliance functions what marketing communications you're permitted to issue under each license before running real outreach.

## Project structure

```
src/
  App.tsx                    — nav shell (Ledger / Compliance)
  LeadDashboard.jsx          — presentational lead table + detail drawer
  LeadDashboardConnected.jsx — wires LeadDashboard to live Supabase data
  ComplianceReview.jsx       — jurisdiction + template approval queues
  useLeads.ts                — data hook (fetch, realtime, mutations)
  supabaseClient.ts          — Supabase client init
  scoring.ts                 — weighted lead scoring model
  enrichment.ts              — Apollo enrichment (client-callable version)
  sequenceEngine.ts          — outreach sequencing (client-callable version)
supabase/
  migrations/                — full schema, run in order
  functions/
    run-enrichment/          — scheduled Edge Function version of enrichment.ts
    process-sequences/       — scheduled Edge Function version of sequenceEngine.ts
```
