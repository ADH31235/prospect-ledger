// Supabase Edge Function — requires a logged-in session AND
// profiles.is_platform_admin = true. Run this ONCE to set up the
// Paddle catalog; re-running is safe (Paddle just gets duplicate
// products if you do — check the response and don't re-run
// unless you actually want that).
// Deploy with: supabase functions deploy setup-subscription-tiers
// Then call it once from the browser console or Admin Console.
//
// Creates two products, each with one recurring monthly price that
// has a quantity range — this is what makes it per-seat: Paddle's
// checkout lets the customer pick how many seats they want, and
// bills unit_price × quantity. Enterprise is deliberately NOT
// created here — it's sales-assisted (a "Contact us" flow), not
// self-serve checkout, so it doesn't need a Paddle price at all.

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

async function paddleRequest(path: string, body: any) {
  const res = await fetch(`${PADDLE_API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PADDLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Paddle ${path} failed: ${JSON.stringify(json)}`);
  return json.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await adminClient.from("profiles").select("is_platform_admin").eq("id", userData.user.id).maybeSingle();
    if (!profile?.is_platform_admin) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, any> = {};

    // "saas" as a tax category requires Paddle's approval first and
    // isn't available by default — using it here could make this
    // whole call fail. "standard" is the default every account has
    // access to immediately, no approval needed.
    const TAX_CATEGORY = "standard";

    // Starter — $49/user/month
    const starterProduct = await paddleRequest("/products", {
      name: "Trivara Hub — Starter", tax_category: TAX_CATEGORY,
      description: "Ledger and basic jurisdiction-based compliance gating.",
    });
    const starterPrice = await paddleRequest("/prices", {
      product_id: starterProduct.id,
      description: "Starter — per seat, monthly",
      name: "Starter (per seat)",
      unit_price: { amount: "4900", currency_code: "USD" },
      billing_cycle: { interval: "month", frequency: 1 },
      quantity: { minimum: 1, maximum: 50 },
    });
    results.starter = { product_id: starterProduct.id, price_id: starterPrice.id };

    // Professional — $79/user/month
    const proProduct = await paddleRequest("/products", {
      name: "Trivara Hub — Professional", tax_category: TAX_CATEGORY,
      description: "Full compliance workflow, sequences, newsletter, webinars, content library, and fee/revenue analytics.",
    });
    const proPrice = await paddleRequest("/prices", {
      product_id: proProduct.id,
      description: "Professional — per seat, monthly",
      name: "Professional (per seat)",
      unit_price: { amount: "7900", currency_code: "USD" },
      billing_cycle: { interval: "month", frequency: 1 },
      quantity: { minimum: 1, maximum: 50 },
    });
    results.professional = { product_id: proProduct.id, price_id: proPrice.id };

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
