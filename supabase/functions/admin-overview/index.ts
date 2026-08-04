// Supabase Edge Function — requires a logged-in session (verify_jwt
// stays on) AND profiles.is_platform_admin = true for that user.
// Deploy with: supabase functions deploy admin-overview
//
// This is the ONLY place in the whole app that deliberately reads
// across every tenant at once. Everywhere else, Phase 1's RLS
// policies enforce isolation at the database level automatically.
// Here, isolation is bypassed on purpose (service role), which is
// exactly why the two checks below aren't optional — this
// function is the single point where a bug would leak every
// company's data to every other company.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const adminClient = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_platform_admin) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenants, error: tenantsErr } = await adminClient
      .from("tenants")
      .select("id, name, created_at, subscription_status, plan, current_period_end")
      .order("created_at", { ascending: false });
    if (tenantsErr) throw tenantsErr;

    const { data: leadCounts } = await adminClient.from("leads").select("tenant_id");
    const { data: userCounts } = await adminClient.from("profiles").select("tenant_id");

    const leadCountByTenant: Record<string, number> = {};
    for (const row of leadCounts ?? []) {
      leadCountByTenant[row.tenant_id] = (leadCountByTenant[row.tenant_id] ?? 0) + 1;
    }
    const userCountByTenant: Record<string, number> = {};
    for (const row of userCounts ?? []) {
      userCountByTenant[row.tenant_id] = (userCountByTenant[row.tenant_id] ?? 0) + 1;
    }

    const result = (tenants ?? []).map((t: any) => ({
      ...t,
      lead_count: leadCountByTenant[t.id] ?? 0,
      user_count: userCountByTenant[t.id] ?? 0,
    }));

    return new Response(JSON.stringify({ tenants: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
