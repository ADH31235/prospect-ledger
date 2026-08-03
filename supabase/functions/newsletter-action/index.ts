// Supabase Edge Function — PUBLIC (no auth required).
// Deploy with: supabase functions deploy newsletter-action --no-verify-jwt
//
// Handles both confirmation links and unsubscribe links, since
// they're the same shape (token in, status change out).
// Called as: /newsletter-action?type=confirm&token=xxx
//        or: /newsletter-action?type=unsubscribe&token=xxx

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const token = url.searchParams.get("token");

  if (!token || (type !== "confirm" && type !== "unsubscribe")) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: subscriber } = await supabase
    .from("newsletter_subscribers")
    .select("id, status")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!subscriber) {
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (type === "confirm") {
    await supabase
      .from("newsletter_subscribers")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", subscriber.id);
    return new Response(JSON.stringify({ ok: true, result: "confirmed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // unsubscribe
  await supabase
    .from("newsletter_subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", subscriber.id);
  return new Response(JSON.stringify({ ok: true, result: "unsubscribed" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
