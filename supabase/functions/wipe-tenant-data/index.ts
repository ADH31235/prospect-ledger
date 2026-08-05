// Supabase Edge Function — requires a logged-in session AND
// profiles.is_platform_admin = true, same gate as admin-overview.
// Deploy with: supabase functions deploy wipe-tenant-data
//
// Deliberately category-based, not all-or-nothing — clearing out
// dummy test leads shouldn't force you to also lose real
// configuration work (jurisdictions, sequence templates, webinar
// events themselves). Each category is independently selectable.
//
// Categories never touch: jurisdictions, sequences/steps/templates,
// scoring_criteria, licenses, webinars (the events), newsletter_issues,
// or jurisdiction-only compliance_reviews (lead_id null) — all of
// that is configuration and audit history, not "data."
//
// Cascade rules already do most of the work: deleting a lead
// automatically cleans up its stage history, outreach log, and
// sequence enrollments (all ON DELETE CASCADE), and safely
// *unlinks* rather than deletes newsletter subscribers, webinar
// registrations, and deal-signal conversions (all ON DELETE SET
// NULL, fixed back in migration 0008). The one exception —
// compliance_reviews.lead_id has no cascade — is handled
// explicitly below before leads are deleted, so it doesn't block
// anything.

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

const ALL_TENANT_TABLES_IN_ORDER = [
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

    const { tenant_id, tenant_name_confirmation, categories, also_delete_tenant } = await req.json();
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

    async function deleteFrom(table: string) {
      const { error, count } = await adminClient
        .from(table)
        .delete({ count: "exact" })
        .eq("tenant_id", tenant_id);
      if (error) throw new Error(`Failed deleting from ${table}: ${error.message}`);
      deletedCounts[table] = (deletedCounts[table] ?? 0) + (count ?? 0);
    }

    if (also_delete_tenant) {
      // Deleting the whole company — every table goes, regardless
      // of which categories were checked, since leaving orphaned
      // configuration behind for a company that no longer exists
      // wouldn't make sense.
      for (const table of ALL_TENANT_TABLES_IN_ORDER) {
        await deleteFrom(table);
      }
      await adminClient.from("profiles").delete().eq("tenant_id", tenant_id);
      const { error: tenantErr } = await adminClient.from("tenants").delete().eq("id", tenant_id);
      if (tenantErr) throw new Error(`Failed deleting tenant: ${tenantErr.message}`);
    } else {
      // Selective clear — only the categories actually checked.
      if (!Array.isArray(categories) || categories.length === 0) {
        return new Response(JSON.stringify({ error: "Select at least one category" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (categories.includes("leads")) {
        const { error, count } = await adminClient
          .from("compliance_reviews")
          .delete({ count: "exact" })
          .eq("tenant_id", tenant_id)
          .not("lead_id", "is", null);
        if (error) throw new Error(`Failed deleting compliance_reviews: ${error.message}`);
        deletedCounts["compliance_reviews (lead-specific only)"] = count ?? 0;

        await deleteFrom("leads");
      }

      if (categories.includes("deal_signals")) await deleteFrom("deal_signals");
      if (categories.includes("newsletter_subscribers")) await deleteFrom("newsletter_subscribers");
      if (categories.includes("webinar_registrations")) await deleteFrom("webinar_registrations");
      if (categories.includes("content_pieces")) await deleteFrom("content_pieces");
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
