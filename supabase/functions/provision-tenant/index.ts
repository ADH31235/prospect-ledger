// Supabase Edge Function — requires a logged-in session (verify_jwt
// is NOT disabled for this one, unlike capture-inquiry/register-webinar/
// subscribe). Only a genuinely authenticated user can provision a
// tenant for themselves — this prevents anyone from creating a
// tenant/profile for an arbitrary user id.
//
// Deploy with: supabase functions deploy provision-tenant
//
// Called once, right after a brand-new user's first successful
// login — see ProvisionGate.tsx on the frontend for when this
// actually fires.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

// Privileged client — used only after we've confirmed who the
// caller actually is, below.
const adminClient = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SCORING_CRITERIA = [
  { criterion_key: "liquidity_event_recent", description: "Liquidity event within last 12 months", weight: 25 },
  { criterion_key: "net_worth_high_confidence", description: "Strong signal of significant investable assets", weight: 30 },
  { criterion_key: "no_existing_advisor", description: "No existing advisor relationship", weight: 15 },
  { criterion_key: "warm_referral", description: "Came via referral rather than cold outreach", weight: 20 },
  { criterion_key: "jurisdiction_low_risk", description: "Jurisdiction cleared as low solicitation risk", weight: 10 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirm who's actually calling, using THEIR token — not the
    // service role — so we can't be tricked into provisioning a
    // tenant for someone who isn't really logged in.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Don't let someone re-provision (and get a second tenant) if
    // they already have one.
    const { data: existingProfile } = await adminClient
      .from("profiles").select("id").eq("id", userId).maybeSingle();
    if (existingProfile) {
      return new Response(JSON.stringify({ error: "This account is already set up." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const companyName = (body.company_name || userData.user.user_metadata?.company_name || "").trim();
    if (!companyName) {
      return new Response(JSON.stringify({ error: "Company name is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fullName = (body.full_name || userData.user.user_metadata?.full_name || "").trim();

    const { data: tenant, error: tenantErr } = await adminClient
      .from("tenants").insert({ name: companyName }).select().single();
    if (tenantErr) throw tenantErr;

    const { error: profileErr } = await adminClient.from("profiles").insert({
      id: userId, tenant_id: tenant.id, role: "admin", full_name: fullName || null,
    });
    if (profileErr) throw profileErr;

    // Deliberately NOT seeding jurisdictions or sequences — those
    // encode real regulatory/compliance assumptions specific to
    // one business, and guessing wrong here is worse than leaving
    // it empty for the new company to set up themselves.
    const { error: criteriaErr } = await adminClient
      .from("scoring_criteria")
      .insert(DEFAULT_SCORING_CRITERIA.map((c) => ({ ...c, tenant_id: tenant.id })));
    if (criteriaErr) throw criteriaErr;

    return new Response(JSON.stringify({ ok: true, tenant_id: tenant.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? err?.details ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
