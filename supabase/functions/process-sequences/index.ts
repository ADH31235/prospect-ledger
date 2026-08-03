// Supabase Edge Function — deploy with:
//   supabase functions deploy process-sequences
// Then schedule it (see README) to run every 15 minutes.
//
// Required secrets (supabase secrets set KEY=value):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, FROM_EMAIL, FROM_NAME

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // service role — this runs server-side only
);

function renderTemplate(template: string, lead: any): string {
  const siteUrl = Deno.env.get("SITE_URL") ?? "";
  const subscribeLink = `${siteUrl}/subscribe?lead_id=${lead.id ?? ""}`;
  return template
    .replace(/\{\{first_name\}\}/g, lead.full_name?.split(" ")[0] ?? "")
    .replace(/\{\{full_name\}\}/g, lead.full_name ?? "")
    .replace(/\{\{company\}\}/g, lead.company ?? "")
    .replace(/\{\{job_title\}\}/g, lead.job_title ?? "")
    .replace(/\{\{subscribe_link\}\}/g, subscribeLink);
}

async function checkOptOutGate(leadId: string) {
  const { data: lead } = await supabase.from("leads").select("opted_out").eq("id", leadId).single();
  if (lead?.opted_out) return { ok: false, reason: "lead has opted out" };
  return { ok: true };
}

async function checkProvenanceGate(leadId: string) {
  const { data: lead } = await supabase.from("leads").select("provenance_unknown").eq("id", leadId).single();
  if (lead?.provenance_unknown) return { ok: false, reason: "data provenance unresolved" };
  return { ok: true };
}

async function checkJurisdictionGate(leadId: string) {
  const { data: lead } = await supabase
    .from("leads")
    .select("jurisdictions(solicitation_risk)")
    .eq("id", leadId)
    .single();
  const risk = (lead as any)?.jurisdictions?.solicitation_risk;
  if (risk === "do_not_contact") return { ok: false, reason: "jurisdiction blocked" };
  if (risk === "review_required") return { ok: false, reason: "jurisdiction review pending" };
  return { ok: true };
}

async function checkComplianceGate(step: any) {
  if (!step.requires_compliance_review) return { ok: true };
  if (!step.approved_template_version) return { ok: false, reason: "no approved template version" };
  const { data: approval } = await supabase
    .from("template_approvals")
    .select("id")
    .eq("step_id", step.id)
    .eq("template_version", step.approved_template_version)
    .maybeSingle();
  if (!approval) return { ok: false, reason: "current template version not approved" };
  return { ok: true };
}

async function sendEmail(toEmail: string, subject: string, body: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${Deno.env.get("FROM_NAME")} <${Deno.env.get("FROM_EMAIL")}>`,
      to: [toEmail],
      subject,
      text: body,
    }),
  });
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  return { ok: true, messageId: res.headers.get("x-message-id") ?? undefined };
}

Deno.serve(async () => {
  const { data: due, error } = await supabase
    .from("scheduled_sends")
    .select(`*, sequence_steps(*), sequence_enrollments(lead_id, status)`)
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(50);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!due?.length) return new Response(JSON.stringify({ processed: 0 }));

  let processed = 0;

  for (const row of due) {
    const step = (row as any).sequence_steps;
    const enrollment = (row as any).sequence_enrollments;
    const leadId = enrollment.lead_id;

    if (enrollment.status !== "active") {
      await supabase.from("scheduled_sends").update({ status: "skipped" }).eq("id", row.id);
      continue;
    }

    const oGate = await checkOptOutGate(leadId);
    if (!oGate.ok) {
      await supabase.from("scheduled_sends")
        .update({ status: "blocked_opted_out", block_reason: oGate.reason }).eq("id", row.id);
      await supabase.from("sequence_enrollments").update({ status: "stopped" }).eq("id", enrollment.id);
      continue;
    }

    const pGate = await checkProvenanceGate(leadId);
    if (!pGate.ok) {
      await supabase.from("scheduled_sends")
        .update({ status: "blocked_provenance", block_reason: pGate.reason }).eq("id", row.id);
      continue;
    }

    const jGate = await checkJurisdictionGate(leadId);
    if (!jGate.ok) {
      await supabase.from("scheduled_sends")
        .update({ status: "blocked_jurisdiction", block_reason: jGate.reason }).eq("id", row.id);
      continue;
    }

    const cGate = await checkComplianceGate(step);
    if (!cGate.ok) {
      await supabase.from("scheduled_sends")
        .update({ status: "blocked_compliance", block_reason: cGate.reason }).eq("id", row.id);
      continue;
    }

    const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (!lead) continue;

    if (step.channel === "linkedin_manual") {
      await supabase.from("scheduled_sends").update({ status: "task_created" }).eq("id", row.id);
      processed++;
      continue;
    }

    if (!lead.email) {
      await supabase.from("scheduled_sends")
        .update({ status: "failed", block_reason: "lead has no email" }).eq("id", row.id);
      continue;
    }

    const result = await sendEmail(
      lead.email,
      renderTemplate(step.subject_template ?? "", lead),
      renderTemplate(step.body_template, lead)
    );

    if (result.ok) {
      await supabase.from("scheduled_sends")
        .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.messageId })
        .eq("id", row.id);
      await supabase.from("leads").update({ last_contact_at: new Date().toISOString() }).eq("id", leadId);
      processed++;
    } else {
      await supabase.from("scheduled_sends")
        .update({ status: "failed", block_reason: result.error }).eq("id", row.id);
    }
  }

  return new Response(JSON.stringify({ processed, total: due.length }));
});
