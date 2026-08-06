// Supabase Edge Function — requires a logged-in session AND
// profiles.is_platform_admin = true, same gate as admin-overview.
// Deploy with: supabase functions deploy admin-manage-subscription
//
// Two actions:
//   "cancel" — sets subscription_status to 'canceled' directly in
//     our own database. This is an ACCESS override, not a real
//     Paddle cancellation — if the tenant has a genuine live Paddle
//     subscription, it will keep billing them until actually
//     canceled through Paddle (or until their next webhook event
//     resyncs the status). Intended for accounts that never
//     properly subscribed, test accounts, or immediate access
//     removal while a real cancellation is sorted out separately.
//   "grant_trial" — sets trial_access_until to 7 days from now,
//     giving full access without requiring subscription_status to
//     change at all.

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

    const { tenant_id, action } = await req.json();
    if (!tenant_id || !["cancel", "grant_trial"].includes(action)) {
      return new Response(JSON.stringify({ error: "tenant_id and a valid action are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel") {
      const { error } = await adminClient
        .from("tenants")
        .update({ subscription_status: "canceled" })
        .eq("id", tenant_id);
      if (error) throw error;
    } else if (action === "grant_trial") {
      const trialUntil = new Date();
      trialUntil.setDate(trialUntil.getDate() + 7);
      const { error } = await adminClient
        .from("tenants")
        .update({ trial_access_until: trialUntil.toISOString() })
        .eq("id", tenant_id);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
