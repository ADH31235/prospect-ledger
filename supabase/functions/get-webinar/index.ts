// Supabase Edge Function — PUBLIC (no auth). Deploy with:
// supabase functions deploy get-webinar --no-verify-jwt
//
// This replaces a direct client-side table read of `webinars`.
// The old approach needed a public RLS policy allowing SELECT,
// which — since RLS can't distinguish "queried by a known id"
// from "queried with no filter at all" — meant anyone with the
// anon key could list every company's events, not just the one
// a specific signup link points to. An edge function that only
// ever returns one record, looked up by an id the caller already
// has, closes that gap: there's no way to enumerate — you can
// only see what you already have a specific link to.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("webinars")
    .select("id, title, description, scheduled_at, location_or_link, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ webinar: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
