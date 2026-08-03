// Supabase Edge Function — PUBLIC (no auth required).
// Deploy with: supabase functions deploy capture-inquiry --no-verify-jwt
//
// Called from the public /inquire landing page. Creates a real
// lead (not a newsletter subscriber) — someone submitting this
// form is a self-initiated inquiry, the cleanest consent basis
// available. Still flows through the exact same pipeline as any
// other lead: default stage 'new', jurisdiction gate applies
// before any future outreach, nothing is auto-contacted.
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)
//   RESEND_API_KEY, FROM_EMAIL, FROM_NAME (already set)
// New secret needed:
//   NOTIFY_EMAIL — where to send a heads-up when a new inquiry
//   arrives. Under Resend's sandbox mode, this MUST be the same
//   email you signed up to Resend with, same restriction as the
//   newsletter confirmation emails.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Mirrors src/scoring.ts — see the note in run-enrichment/index.ts
// about why this is duplicated rather than imported.
async function scoreLead(leadId: string) {
  const { data: lead } = await supabase
    .from("leads")
    .select("*, jurisdictions(solicitation_risk)")
    .eq("id", leadId)
    .single();
  if (!lead) return;

  const { data: criteria } = await supabase
    .from("scoring_criteria")
    .select("criterion_key, weight")
    .eq("active", true);
  const weights = Object.fromEntries((criteria ?? []).map((c: any) => [c.criterion_key, c.weight]));
  const risk = lead.jurisdictions?.solicitation_risk;

  if (risk === "do_not_contact") {
    await supabase.from("leads").update({ score: 0 }).eq("id", leadId);
    return;
  }

  let score = 0;
  if (lead.liquidity_event && lead.liquidity_event !== "none" && lead.liquidity_event_date) {
    const monthsAgo = (Date.now() - new Date(lead.liquidity_event_date).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo <= 12) score += weights["liquidity_event_recent"] ?? 0;
  }
  if (
    ["exited_founder", "senior_exec", "inherited_wealth"].includes(lead.net_worth_signal) &&
    (lead.estimated_investable_assets ?? 0) >= 1_000_000
  ) {
    score += weights["net_worth_high_confidence"] ?? 0;
  }
  if (lead.existing_advisor === false) score += weights["no_existing_advisor"] ?? 0;
  if (lead.source === "referral") score += weights["warm_referral"] ?? 0;
  if (risk === "low") score += weights["jurisdiction_low_risk"] ?? 0;

  await supabase.from("leads").update({ score }).eq("id", leadId);
}

async function notifyNewInquiry(lead: any) {
  const notifyEmail = Deno.env.get("NOTIFY_EMAIL");
  if (!notifyEmail) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${Deno.env.get("FROM_NAME")} <${Deno.env.get("FROM_EMAIL")}>`,
        to: [notifyEmail],
        subject: `New inquiry: ${lead.full_name}`,
        text: `New inbound inquiry received.\n\nName: ${lead.full_name}\nEmail: ${lead.email}\nPhone: ${lead.phone ?? "—"}\nCountry: ${lead.country_text ?? "—"}\nMessage: ${lead.notes ?? "—"}\n\nView it in Prospect Ledger.`,
      }),
    });
  } catch {
    // Notification failing shouldn't fail the actual lead capture.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { full_name, email, phone, country_text, interest_note, source } = await req.json();

    if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let jurisdictionId: string | null = null;
    if (country_text) {
      const { data: j } = await supabase
        .from("jurisdictions")
        .select("id")
        .ilike("country", country_text.trim())
        .maybeSingle();
      jurisdictionId = j?.id ?? null;
    }

    const { data: created, error } = await supabase
      .from("leads")
      .insert({
        full_name: full_name.trim(),
        email: email.trim(),
        phone: phone || null,
        jurisdiction_id: jurisdictionId,
        source: source || "inbound_ad",
        consent_basis: "explicit_inquiry",
        stage: "new",
        net_worth_signal: "unknown", // deliberately not inferred from self-reported claims alone
        notes: interest_note ? `Inbound inquiry: ${interest_note}` : "Inbound inquiry via landing page",
      })
      .select()
      .single();

    if (error) throw error;

    await scoreLead(created.id);
    await notifyNewInquiry({ ...created, country_text });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
