// Supabase Edge Function — requires a logged-in session AND
// profiles.is_platform_admin = true, same gate as admin-overview.
// Deploy with: supabase functions deploy admin-invite-user
//
// The normal /signup flow always creates a brand-new company for
// whoever signs up — there's no self-service way for a company to
// add a second person to their own existing account. This is that
// path, but deliberately admin-only for now rather than
// self-service, so a company can ask you to add a teammate rather
// than everyone needing their own invite UI built out yet.
//
// Uses Supabase's Admin API to send a real invite email (via
// whatever SMTP is configured — should be the same Resend setup
// already used for password resets) containing a link that lets
// the invitee set their own password. A profiles row is created
// immediately, pointed at the EXISTING tenant_id — this is what
// skips provision-tenant's "create a new company" behavior.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const siteUrl = Deno.env.get("SITE_URL") ?? "https://hub.trivaraservices.com";

const adminClient = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const { tenant_id, email, full_name, role } = await req.json();
    if (!tenant_id || !email) {
      return new Response(JSON.stringify({ error: "tenant_id and email are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await adminClient.from("tenants").select("id, name").eq("id", tenant_id).maybeSingle();
    if (!tenant) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
      data: { full_name: full_name || "", company_name: tenant.name },
    });
    if (inviteErr) throw inviteErr;

    const { error: profileErr } = await adminClient.from("profiles").insert({
      id: invited.user.id,
      tenant_id,
      role: role === "admin" ? "admin" : "member",
      full_name: full_name || null,
    });
    if (profileErr) throw profileErr;

    return new Response(JSON.stringify({ ok: true, userId: invited.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
