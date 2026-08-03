// Supabase Edge Function — deploy with:
//   supabase functions deploy run-enrichment
// Schedule to run every 30-60 minutes (see README).
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APOLLO_API_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function apolloEnrich(input: { full_name: string; email?: string; company?: string }) {
  const parts = input.full_name.trim().split(/\s+/);
  const res = await fetch("https://api.apollo.io/v1/people/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": Deno.env.get("APOLLO_API_KEY")!,
    },
    body: JSON.stringify({
      first_name: parts[0],
      last_name: parts.slice(1).join(" ") || undefined,
      email: input.email,
      organization_name: input.company,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.person ?? null;
}

function inferNetWorthSignal(person: any): string {
  const seniority = (person.seniority ?? "").toLowerCase();
  if (["founder", "owner", "c_suite"].includes(seniority)) return "senior_exec";
  if (seniority === "vp" && (person.organization?.estimated_num_employees ?? 0) > 500) return "senior_exec";
  return "unknown";
}

// Mirrors src/scoring.ts's scoreLead — duplicated here rather than
// imported since this Deno function can't reach into the Vite
// frontend's src/ folder. Keep the two in sync if you change the
// scoring model.
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

Deno.serve(async () => {
  const { data: newLeads, error } = await supabase
    .from("leads")
    .select("id, full_name, email, company")
    .eq("stage", "new")
    .limit(25);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!newLeads?.length) return new Response(JSON.stringify({ processed: 0 }));

  let processed = 0;

  for (const lead of newLeads) {
    const person = await apolloEnrich(lead);

    if (!person) {
      await supabase.from("leads").update({ notes: "Apollo enrichment: no match" }).eq("id", lead.id);
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    let jurisdictionId: string | null = null;
    if (person.country) {
      const { data: j } = await supabase
        .from("jurisdictions")
        .select("id")
        .ilike("country", person.country)
        .maybeSingle();
      jurisdictionId = j?.id ?? null;
    }

    await supabase
      .from("leads")
      .update({
        email: person.email ?? lead.email,
        company: person.organization?.name ?? lead.company,
        job_title: person.title ?? null,
        linkedin_url: person.linkedin_url ?? null,
        jurisdiction_id: jurisdictionId,
        net_worth_signal: inferNetWorthSignal(person),
        stage: "enriched",
        notes: "Enriched via Apollo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    await scoreLead(lead.id);

    processed++;
    await new Promise((r) => setTimeout(r, 400)); // basic rate limiting
  }

  return new Response(JSON.stringify({ processed, total: newLeads.length }));
});
