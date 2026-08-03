// ============================================================
// OUTREACH SEQUENCING ENGINE
// Email sends automatically via Resend. LinkedIn steps never
// send anything — they create a task row so you message
// manually through LinkedIn's own interface.
// ============================================================

import { supabase } from "./supabaseClient";

// ------------------------------------------------------------
// ENROLLMENT
// ------------------------------------------------------------

/**
 * Enrolls a lead in a sequence and schedules all steps up front
 * (each `scheduled_for` = enrollment time + cumulative delay_days).
 * Refuses to enroll leads in a blocked jurisdiction at all — no
 * point scheduling sends that will never clear the gate.
 */
export async function enrollLead(leadId: string, sequenceId: string) {
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, jurisdiction_id, jurisdictions(solicitation_risk)")
    .eq("id", leadId)
    .single();
  if (leadErr || !lead) throw leadErr ?? new Error("Lead not found");

  if ((lead as any).jurisdictions?.solicitation_risk === "do_not_contact") {
    throw new Error(
      `Cannot enroll lead ${leadId}: jurisdiction is flagged do-not-contact`
    );
  }

  const { data: enrollment, error: enrollErr } = await supabase
    .from("sequence_enrollments")
    .insert({ lead_id: leadId, sequence_id: sequenceId })
    .select()
    .single();
  if (enrollErr) throw enrollErr;

  const { data: steps, error: stepsErr } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true });
  if (stepsErr) throw stepsErr;

  let cumulativeDays = 0;
  const scheduledRows = (steps ?? []).map((step: any) => {
    cumulativeDays += step.delay_days;
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + cumulativeDays);
    return {
      enrollment_id: enrollment.id,
      step_id: step.id,
      scheduled_for: scheduledFor.toISOString(),
      status: "pending",
    };
  });

  if (scheduledRows.length) {
    const { error: schedErr } = await supabase.from("scheduled_sends").insert(scheduledRows);
    if (schedErr) throw schedErr;
  }

  return enrollment;
}

// ------------------------------------------------------------
// TEMPLATE RENDERING
// ------------------------------------------------------------
function renderTemplate(template: string, lead: any): string {
  const siteUrl = (import.meta as any).env?.VITE_SITE_URL ?? "";
  const subscribeLink = `${siteUrl}/subscribe?lead_id=${lead.id ?? ""}`;
  return template
    .replace(/\{\{first_name\}\}/g, lead.full_name?.split(" ")[0] ?? "")
    .replace(/\{\{full_name\}\}/g, lead.full_name ?? "")
    .replace(/\{\{company\}\}/g, lead.company ?? "")
    .replace(/\{\{job_title\}\}/g, lead.job_title ?? "")
    .replace(/\{\{subscribe_link\}\}/g, subscribeLink);
}

// ------------------------------------------------------------
// GATES
// Both must pass before an email actually goes out.
// ------------------------------------------------------------
async function checkOptOutGate(leadId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: lead } = await supabase
    .from("leads")
    .select("opted_out")
    .eq("id", leadId)
    .single();
  if (lead?.opted_out) return { ok: false, reason: "lead has opted out" };
  return { ok: true };
}

async function checkJurisdictionGate(leadId: string): Promise<{ ok: boolean; reason?: string }> {
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

async function checkComplianceGate(step: any): Promise<{ ok: boolean; reason?: string }> {
  if (!step.requires_compliance_review) return { ok: true };
  if (!step.approved_template_version) {
    return { ok: false, reason: "no approved template version set on step" };
  }
  const { data: approval } = await supabase
    .from("template_approvals")
    .select("id")
    .eq("step_id", step.id)
    .eq("template_version", step.approved_template_version)
    .maybeSingle();
  if (!approval) return { ok: false, reason: "current template version not approved" };
  return { ok: true };
}

// ------------------------------------------------------------
// SENDING (email only)
// Docs: https://resend.com/docs/api-reference/emails/send-email
// ------------------------------------------------------------
async function sendEmail(params: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${params.fromName} <${params.fromEmail}>`,
      to: [params.toEmail],
      subject: params.subject,
      text: params.body,
    }),
  });

  if (!res.ok) {
    return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, messageId: data.id };
}

// ------------------------------------------------------------
// PROCESSOR
// Run this on a schedule (e.g. every 15 minutes via a Supabase
// Edge Function + cron, or a simple Node script + system cron).
// ------------------------------------------------------------
export async function processDueSends(emailConfig: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}) {
  const { data: due, error } = await supabase
    .from("scheduled_sends")
    .select(
      `*, sequence_steps(*), sequence_enrollments(lead_id, status)`
    )
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(50);

  if (error) throw error;
  if (!due?.length) return { processed: 0 };

  let processed = 0;

  for (const row of due) {
    const step = (row as any).sequence_steps;
    const enrollment = (row as any).sequence_enrollments;
    const leadId = enrollment.lead_id;

    if (enrollment.status !== "active") {
      await supabase.from("scheduled_sends").update({ status: "skipped" }).eq("id", row.id);
      continue;
    }

    // Gate 1: opt-out — checked first and unconditionally. An
    // opted-out lead is never contacted again, full stop, regardless
    // of jurisdiction or template approval status.
    const oGate = await checkOptOutGate(leadId);
    if (!oGate.ok) {
      await supabase
        .from("scheduled_sends")
        .update({ status: "blocked_opted_out", block_reason: oGate.reason })
        .eq("id", row.id);
      // Also stop the whole enrollment, not just this one send —
      // no point leaving future steps pending for someone who opted out.
      await supabase
        .from("sequence_enrollments")
        .update({ status: "stopped" })
        .eq("id", enrollment.id);
      continue;
    }

    // Gate 2: jurisdiction
    const jGate = await checkJurisdictionGate(leadId);
    if (!jGate.ok) {
      await supabase
        .from("scheduled_sends")
        .update({ status: "blocked_jurisdiction", block_reason: jGate.reason })
        .eq("id", row.id);
      continue;
    }

    // Gate 3: compliance approval on the template
    const cGate = await checkComplianceGate(step);
    if (!cGate.ok) {
      await supabase
        .from("scheduled_sends")
        .update({ status: "blocked_compliance", block_reason: cGate.reason })
        .eq("id", row.id);
      continue;
    }

    const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (!lead) continue;

    if (step.channel === "linkedin_manual") {
      // No automated sending — just surface a task.
      await supabase
        .from("scheduled_sends")
        .update({ status: "task_created" })
        .eq("id", row.id);
      processed++;
      continue;
    }

    // channel === 'email'
    if (!lead.email) {
      await supabase
        .from("scheduled_sends")
        .update({ status: "failed", block_reason: "lead has no email" })
        .eq("id", row.id);
      continue;
    }

    const result = await sendEmail({
      apiKey: emailConfig.apiKey,
      fromEmail: emailConfig.fromEmail,
      fromName: emailConfig.fromName,
      toEmail: lead.email,
      subject: renderTemplate(step.subject_template ?? "", lead),
      body: renderTemplate(step.body_template, lead),
    });

    if (result.ok) {
      await supabase
        .from("scheduled_sends")
        .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.messageId })
        .eq("id", row.id);

      await supabase
        .from("leads")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", leadId);

      processed++;
    } else {
      await supabase
        .from("scheduled_sends")
        .update({ status: "failed", block_reason: result.error })
        .eq("id", row.id);
    }
  }

  return { processed, total: due.length };
}

/**
 * Fetches pending manual LinkedIn tasks so you can work through
 * them yourself — e.g. render as a simple checklist view.
 */
export async function getManualLinkedInTasks() {
  const { data, error } = await supabase
    .from("scheduled_sends")
    .select(`*, sequence_steps(body_template), sequence_enrollments(lead_id)`)
    .eq("status", "task_created")
    .order("scheduled_for", { ascending: true });
  if (error) throw error;
  return data;
}
