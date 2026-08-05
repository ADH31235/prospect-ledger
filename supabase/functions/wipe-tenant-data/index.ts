// Supabase Edge Function — requires a logged-in session AND
// profiles.is_platform_admin = true, same gate as admin-overview.
// Deploy with: supabase functions deploy wipe-tenant-data
//
// This is genuinely destructive and irreversible — there's no undo.
// It's built as a deliberate, explicitly-triggered tool (you have
// to call it on purpose, with the exact tenant name typed as
// confirmation on the frontend) rather than anything automatic.
//
// Deletes every row belonging to a tenant across every
// tenant-scoped table, in child-to-parent order so foreign keys
// never block the delete. Does NOT delete Supabase auth accounts —
// only the tenant's data and (optionally) the tenant/profile link
// itself. A user whose tenant gets fully deleted keeps their login,
// they'd just be asked to set up a new company on next sign-in.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const adminClient = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TABLES_IN_ORDER = [
  "scheduled_sends",
  "sequence_enrollments",
  "template_approvals",
  "sequence_steps",
  "sequences",
  "lead_stage_history",
  "webinar_registrations",
  "webinars",
  "content_pieces",
  "deal_signals",
  "newsletter_issues",
  "newsletter_subscribers",
  "compliance_reviews",
  "outreach_events",
  "leads",
  "scoring_criteria",
  "licenses",
  "jurisdictions",
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

    const { tenant_id, tenant_name_confirmation, also_delete_tenant } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await adminClient.from("tenants").select("id, name").eq("id", tenant_id).maybeSingle();
    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tenant_name_confirmation !== tenant.name) {
      return new Response(JSON.stringify({ error: "Confirmation text didn't match the company name" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const deletedCounts: Record<string, number> = {};
    for (const table of TABLES_IN_ORDER) {
      const { error, count } = await adminClient
        .from(table)
        .delete({ count: "exact" })
        .eq("tenant_id", tenant_id);
      if (error) throw new Error(`Failed deleting from ${table}: ${error.message}`);
      deletedCounts[table] = count ?? 0;
    }

    if (also_delete_tenant) {
      await adminClient.from("profiles").delete().eq("tenant_id", tenant_id);
      const { error: tenantErr } = await adminClient.from("tenants").delete().eq("id", tenant_id);
      if (tenantErr) throw new Error(`Failed deleting tenant: ${tenantErr.message}`);
    }

    return new Response(JSON.stringify({ ok: true, deletedCounts, tenantDeleted: !!also_delete_tenant }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
