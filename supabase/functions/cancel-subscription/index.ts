// Supabase Edge Function — requires a logged-in session.
// Deploy with: supabase functions deploy cancel-subscription
//
// Cancels at the end of the current billing period by default —
// not immediately — so someone doesn't lose access to something
// they already paid for mid-cycle. The actual subscription_status
// change gets reflected via the paddle-webhook once Paddle applies
// the scheduled cancellation, same as every other status update.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY")!;
const PADDLE_API_BASE_URL = Deno.env.get("PADDLE_API_BASE_URL") || "https://sandbox-api.paddle.com";

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
      .select("tenant_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No workspace found for this account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await adminClient
      .from("tenants")
      .select("paddle_subscription_id, subscription_status")
      .eq("id", profile.tenant_id)
      .maybeSingle();

    if (!tenant?.paddle_subscription_id) {
      return new Response(JSON.stringify({ error: "No subscription to cancel" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (tenant.subscription_status === "canceled") {
      return new Response(JSON.stringify({ error: "Already canceled" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paddleRes = await fetch(
      `${PADDLE_API_BASE_URL}/subscriptions/${tenant.paddle_subscription_id}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ effective_from: "next_billing_period" }),
      }
    );

    if (!paddleRes.ok) {
      const errBody = await paddleRes.text();
      throw new Error(`Paddle rejected cancellation: ${errBody}`);
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
