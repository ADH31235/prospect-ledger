// Supabase Edge Function — requires a logged-in session AND
// profiles.is_platform_admin = true. Safe to call as many times as
// you want — it checks Paddle for existing products by name first
// and reuses them rather than creating duplicates, so the Admin
// Console can call this on every page load to show accurate status
// instead of relying on temporary browser state.
// Deploy with: supabase functions deploy setup-subscription-tiers
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

async function paddleRequest(path: string, body: any, method = "POST") {
  const res = await fetch(`${PADDLE_API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${PADDLE_API_KEY}`, "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Paddle ${path} failed: ${JSON.stringify(json)}`);
  return json.data;
}

async function findExistingProductByName(name: string) {
  // Paddle's list endpoint doesn't filter by name server-side, so
  // this lists everything and matches client-side — fine at
  // catalog sizes this small. This is what makes the whole
  // function idempotent: call it as many times as you want, it
  // only ever creates each product once.
  const list = await paddleRequest("/products?per_page=100", null, "GET");
  return (Array.isArray(list) ? list : []).find((p: any) => p.name === name) ?? null;
}

async function findPriceForProduct(productId: string) {
  const list = await paddleRequest(`/prices?product_id=${productId}`, null, "GET");
  return (Array.isArray(list) ? list : [])[0] ?? null;
}

async function getOrCreateTier(name: string, description: string, unitPriceCents: string, taxCategory: string) {
  const existingProduct = await findExistingProductByName(name);
  if (existingProduct) {
    const existingPrice = await findPriceForProduct(existingProduct.id);
    if (existingPrice) {
      return { product_id: existingProduct.id, price_id: existingPrice.id, created: false };
    }
  }
  const product = existingProduct ?? await paddleRequest("/products", { name, tax_category: taxCategory, description });
  const price = await paddleRequest("/prices", {
    product_id: product.id,
    description: `${name} — per seat, monthly`,
    name: `${name} (per seat)`,
    unit_price: { amount: unitPriceCents, currency_code: "USD" },
    billing_cycle: { interval: "month", frequency: 1 },
    quantity: { minimum: 1, maximum: 50 },
  });
  return { product_id: product.id, price_id: price.id, created: true };
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

    results.starter = await getOrCreateTier(
      "Trivara Hub — Starter",
      "Ledger and basic jurisdiction-based compliance gating.",
      "4900",
      TAX_CATEGORY
    );
    results.professional = await getOrCreateTier(
      "Trivara Hub — Professional",
      "Full compliance workflow, sequences, newsletter, webinars, content library, and fee/revenue analytics.",
      "7900",
      TAX_CATEGORY
    );

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
