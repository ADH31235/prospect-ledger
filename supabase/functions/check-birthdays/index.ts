// Supabase Edge Function — runs on a daily schedule via pg_cron,
// not user-triggered. Deploy with: supabase functions deploy check-birthdays
//
// Deliberately checks two specific points, not a rolling window —
// "exactly 7 days out" (one advance heads-up) and "today" (a
// same-day reminder) — rather than "next 7 days" re-evaluated
// daily, which would re-send the same reminder every day leading
// up to the date.
//
// Loops across every tenant that has a notify_email set — each
// company only ever gets emailed about its own leads, never
// anyone else's, since everything here is scoped by tenant_id.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function daysUntilNextOccurrence(dobStr: string, today: Date): number {
  const dob = new Date(dobStr);
  let next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  next.setHours(0, 0, 0, 0);
  let diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) {
    next = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
    diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }
  return diff;
}

async function sendDigest(toEmail: string, fromName: string, fromEmail: string, upcoming: any[], today: any[]) {
  const lines: string[] = [];
  if (today.length) {
    lines.push("Today:");
    for (const l of today) lines.push(`  - ${l.full_name}`);
    lines.push("");
  }
  if (upcoming.length) {
    lines.push("In 7 days:");
    for (const l of upcoming) lines.push(`  - ${l.full_name}`);
  }

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [toEmail],
        subject: `Birthday reminder — ${today.length + upcoming.length} coming up`,
        text: lines.join("\n"),
      }),
    });
  } catch {
    // Best-effort — a failed email shouldn't crash the whole run.
  }
}

Deno.serve(async (_req) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, notify_email")
      .not("notify_email", "is", null);

    const fromEmail = Deno.env.get("FROM_EMAIL") ?? "noreply@trivaraservices.com";
    const fromName = Deno.env.get("FROM_NAME") ?? "Trivara";

    let tenantsNotified = 0;

    for (const tenant of tenants ?? []) {
      const { data: leads } = await supabase
        .from("leads")
        .select("full_name, date_of_birth")
        .eq("tenant_id", tenant.id)
        .not("date_of_birth", "is", null)
        .not("stage", "eq", "disqualified");

      const todayMatches: any[] = [];
      const upcomingMatches: any[] = [];

      for (const lead of leads ?? []) {
        const diff = daysUntilNextOccurrence(lead.date_of_birth, today);
        if (diff === 0) todayMatches.push(lead);
        else if (diff === 7) upcomingMatches.push(lead);
      }

      if (todayMatches.length || upcomingMatches.length) {
        await sendDigest(tenant.notify_email, fromName, fromEmail, upcomingMatches, todayMatches);
        tenantsNotified++;
      }
    }

    return new Response(JSON.stringify({ ok: true, tenantsChecked: tenants?.length ?? 0, tenantsNotified }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
