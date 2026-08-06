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
const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY")!;
const PADDLE_API_BASE_URL = Deno.env.get("PADDLE_API_BASE_URL") || "https://sandbox-api.paddle.com";

// Cheap in-memory cache within one function invocation — several
// tenants usually share the same plan, no need to hit Paddle's
// API once per tenant.
async function getPriceDetails(priceId: string, cache: Map<string, any>) {
  if (cache.has(priceId)) return cache.get(priceId);
  try {
    const res = await fetch(`${PADDLE_API_BASE_URL}/prices/${priceId}`, {
      headers: { Authorization: `Bearer ${PADDLE_API_KEY}` },
    });
    if (!res.ok) {
      cache.set(priceId, null);
      return null;
    }
    const json = await res.json();
    const details = {
      name: json.data?.name || json.data?.description || priceId,
      amountMinor: parseInt(json.data?.unit_price?.amount ?? "0", 10),
      currency: json.data?.unit_price?.currency_code ?? "USD",
    };
    cache.set(priceId, details);
    return details;
  } catch {
    cache.set(priceId, null);
    return null;
  }
}

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
      .select("id, name, created_at, subscription_status, plan, plan_tier, seat_count, current_period_end")
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

    const priceCache = new Map<string, any>();
    const distinctPlans = [...new Set((tenants ?? []).map((t: any) => t.plan).filter(Boolean))];
    await Promise.all(distinctPlans.map((p) => getPriceDetails(p as string, priceCache)));

    const result = (tenants ?? []).map((t: any) => {
      const priceInfo = t.plan ? priceCache.get(t.plan) : null;
      return {
        ...t,
        lead_count: leadCountByTenant[t.id] ?? 0,
        user_count: userCountByTenant[t.id] ?? 0,
        plan_name: priceInfo?.name ?? t.plan,
        plan_currency: priceInfo?.currency ?? null,
      };
    });

    // ------------------------------------------------------------
    // KPIs — computed from what we actually have data for. Note:
    // this is a current snapshot plus a this-month-vs-last-month
    // comparison on new signups (real, from tenants.created_at).
    // A true revenue trend over time would need a lightweight
    // billing-events history table — not built yet, flagged as a
    // natural next addition if that's wanted later, same pattern
    // as lead_stage_history.
    // ------------------------------------------------------------
    const statusCounts: Record<string, number> = {};
    for (const t of result) {
      statusCounts[t.subscription_status] = (statusCounts[t.subscription_status] ?? 0) + 1;
    }

    const billableStatuses = ["active", "trialing"];
    const mrrByCurrency: Record<string, number> = {};
    for (const t of result) {
      if (billableStatuses.includes(t.subscription_status) && t.plan) {
        const priceInfo = priceCache.get(t.plan);
        if (priceInfo) {
          mrrByCurrency[priceInfo.currency] = (mrrByCurrency[priceInfo.currency] ?? 0) + priceInfo.amountMinor;
        }
      }
    }
    const mrr = Object.entries(mrrByCurrency).map(([currency, amountMinor]) => ({
      currency, amount: amountMinor / 100,
    }));

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const newThisMonth = result.filter((t) => new Date(t.created_at) >= startOfThisMonth).length;
    const newLastMonth = result.filter((t) => {
      const d = new Date(t.created_at);
      return d >= startOfLastMonth && d < startOfThisMonth;
    }).length;

    const totalTenants = result.length;
    const payingCount = (statusCounts.active ?? 0) + (statusCounts.trialing ?? 0);
    const conversionRate = totalTenants ? Math.round((payingCount / totalTenants) * 100) : 0;

    const kpis = {
      mrr,
      statusCounts,
      newThisMonth,
      newLastMonth,
      conversionRate,
      churnedCount: statusCounts.canceled ?? 0,
    };

    return new Response(JSON.stringify({ tenants: result, kpis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
