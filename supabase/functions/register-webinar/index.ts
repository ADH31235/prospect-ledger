// Supabase Edge Function — PUBLIC (no auth required).
// Deploy with: supabase functions deploy register-webinar --no-verify-jwt
//
// Called from the public /webinar signup page. Creates a real
// lead (source: webinar_registration) AND a webinar_registrations
// row linking to it — same reasoning as capture-inquiry: someone
// registering for a specific event is a self-initiated, clean
// consent basis.
//
// Required secrets (already set):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)
//   RESEND_API_KEY, FROM_EMAIL, FROM_NAME, NOTIFY_EMAIL

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

async function sendEmail(to: string, subject: string, text: string) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${Deno.env.get("FROM_NAME")} <${Deno.env.get("FROM_EMAIL")}>`,
        to: [to],
        subject,
        text,
      }),
    });
  } catch {
    // Best-effort — never fail the registration over an email hiccup.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { webinar_id, full_name, email, phone, country_text, ad_tracking } = await req.json();

    if (!webinar_id) {
      return new Response(JSON.stringify({ error: "webinar_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!full_name || !full_name.trim()) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: webinar, error: webinarErr } = await supabase
      .from("webinars")
      .select("*")
      .eq("id", webinar_id)
      .single();
    if (webinarErr || !webinar) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .insert({
        full_name: full_name.trim(),
        email: email.trim(),
        phone: phone || null,
        jurisdiction_id: jurisdictionId,
        source: "webinar_registration",
        consent_basis: "explicit_inquiry",
        ad_tracking: ad_tracking || null,
        stage: "new",
        net_worth_signal: "unknown",
        notes: `Registered for webinar: ${webinar.title}`,
        tenant_id: "00000000-0000-0000-0000-000000000001", // TODO Phase 5: resolve from which tenant this page belongs to
      })
      .select()
      .single();
    if (leadErr) throw leadErr;

    await scoreLead(lead.id);

    const { error: regErr } = await supabase.from("webinar_registrations").insert({
      webinar_id,
      lead_id: lead.id,
      full_name: full_name.trim(),
      email: email.trim(),
      phone: phone || null,
      country_text: country_text || null,
      ad_tracking: ad_tracking || null,
      tenant_id: "00000000-0000-0000-0000-000000000001", // TODO Phase 5: resolve from which tenant this page belongs to
    });
    if (regErr) throw regErr;

    const eventDate = new Date(webinar.scheduled_at).toLocaleString("en-GB", {
      weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
    });

    await sendEmail(
      email.trim(),
      `You're registered: ${webinar.title}`,
      `Hi ${full_name.trim().split(" ")[0]},\n\nYou're confirmed for "${webinar.title}" on ${eventDate}.\n\n${webinar.location_or_link ? `Join here: ${webinar.location_or_link}\n\n` : ""}${webinar.description ?? ""}\n\nLooking forward to it.\n\nBest,\n${Deno.env.get("FROM_NAME")}`
    );

    const notifyEmail = Deno.env.get("NOTIFY_EMAIL");
    if (notifyEmail) {
      await sendEmail(
        notifyEmail,
        `New webinar registration: ${full_name.trim()}`,
        `New registration for "${webinar.title}".\n\nName: ${full_name.trim()}\nEmail: ${email.trim()}\nPhone: ${phone ?? "—"}\nCountry: ${country_text ?? "—"}\n${ad_tracking?.campaign_name ? `\nCampaign: ${ad_tracking.campaign_name}\n` : ""}\nView it in Prospect Ledger.`
      );
    }

    return new Response(JSON.stringify({ ok: true, webinar }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
