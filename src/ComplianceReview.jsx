import React, { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, RotateCcw, FileText, Globe2, AlertTriangle } from "lucide-react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";

// Same ledger palette as LeadDashboard.jsx, kept local so this
// screen doesn't depend on that file — it's a standalone admin
// view you'd route to separately (e.g. /compliance).

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500;1,400&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');`;

const TABS = [
  { key: "jurisdictions", label: "Jurisdictions", icon: Globe2 },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "blocked", label: "Blocked sends", icon: ShieldX },
  { key: "provenance", label: "Provenance", icon: AlertTriangle },
];

function Badge({ children, color }) {
  return (
    <span style={{
      fontSize: 11.5, padding: "2px 8px", borderRadius: 999,
      background: `${color}18`, color, border: `1px solid ${color}55`,
    }}>
      {children}
    </span>
  );
}

export default function ComplianceReview() {
  const [tab, setTab] = useState("jurisdictions");
  const [jurisdictions, setJurisdictions] = useState([]);
  const [pendingTemplates, setPendingTemplates] = useState([]);
  const [blockedSends, setBlockedSends] = useState([]);
  const [provenanceLeads, setProvenanceLeads] = useState([]);
  const [selectedProvenanceLead, setSelectedProvenanceLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [reviewerName, setReviewerName] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);

    const { data: jData } = await supabase
      .from("jurisdictions")
      .select("*")
      .order("solicitation_risk", { ascending: true });
    setJurisdictions(jData ?? []);

    const { data: stepsData } = await supabase
      .from("sequence_steps")
      .select("*, sequences(name)")
      .eq("requires_compliance_review", true);

    const pending = [];
    for (const step of stepsData ?? []) {
      if (!step.approved_template_version) {
        pending.push(step);
        continue;
      }
      const { data: approval } = await supabase
        .from("template_approvals")
        .select("id")
        .eq("step_id", step.id)
        .eq("template_version", step.approved_template_version)
        .maybeSingle();
      if (!approval) pending.push(step);
    }
    setPendingTemplates(pending);

    const { data: blockedData } = await supabase
      .from("scheduled_sends")
      .select("*, sequence_steps(subject_template, sequences(name)), sequence_enrollments(lead_id, leads(full_name, company))")
      .in("status", ["blocked_compliance", "blocked_jurisdiction", "blocked_provenance"])
      .order("scheduled_for", { ascending: true });
    setBlockedSends(blockedData ?? []);

    const { data: provenanceData } = await supabase
      .from("leads")
      .select("*")
      .eq("provenance_unknown", true)
      .order("created_at", { ascending: true });
    setProvenanceLeads(provenanceData ?? []);

    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function submitJurisdictionDecision(outcome) {
    if (!selectedJurisdiction || !reviewerName.trim()) return;
    const riskMap = { cleared: "low", blocked: "do_not_contact", needs_counsel: "review_required" };

    await supabase
      .from("jurisdictions")
      .update({ solicitation_risk: riskMap[outcome], last_reviewed_at: new Date().toISOString().slice(0, 10) })
      .eq("id", selectedJurisdiction.id);

    await supabase.from("compliance_reviews").insert({
      jurisdiction_id: selectedJurisdiction.id,
      reviewed_by: reviewerName,
      review_outcome: outcome,
      review_notes: decisionNotes,
    });

    setSelectedJurisdiction(null);
    setDecisionNotes("");
    await loadAll();
  }

  async function approveTemplate(step) {
    if (!reviewerName.trim()) {
      alert("Enter your name before approving a template.");
      return;
    }
    const version = (step.approved_template_version ?? 0) + 1;
    await supabase.from("sequence_steps").update({ approved_template_version: version }).eq("id", step.id);
    await supabase.from("template_approvals").insert({
      step_id: step.id,
      template_version: version,
      approved_by: reviewerName,
      notes: "Approved via compliance dashboard",
    });
    await loadAll();
  }

  async function retrySend(sendId) {
    await supabase
      .from("scheduled_sends")
      .update({ status: "pending", scheduled_for: new Date().toISOString(), block_reason: null })
      .eq("id", sendId);
    await loadAll();
  }

  async function clearProvenance(lead) {
    if (!reviewerName.trim()) {
      alert("Enter your name before clearing a provenance flag.");
      return;
    }
    await supabase.from("leads").update({ provenance_unknown: false }).eq("id", lead.id);
    await supabase.from("compliance_reviews").insert({
      lead_id: lead.id,
      reviewed_by: reviewerName,
      review_outcome: "provenance_cleared",
      review_notes: decisionNotes,
    });
    setSelectedProvenanceLead(null);
    setDecisionNotes("");
    await loadAll();
  }

  const reviewRequiredCount = jurisdictions.filter((j) => j.solicitation_risk === "review_required").length;

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <div className="max-w-5xl mx-auto px-6 py-8">

        <div className="flex items-baseline justify-between border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <div>
            <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 28, color: TOKENS.white }}>
              Compliance Review
            </h1>
            <p style={{ color: TOKENS.ivory, fontSize: 13, marginTop: 2 }}>
              {reviewRequiredCount} jurisdiction{reviewRequiredCount === 1 ? "" : "s"} awaiting decision · {pendingTemplates.length} template{pendingTemplates.length === 1 ? "" : "s"} unapproved · {provenanceLeads.length} provenance flag{provenanceLeads.length === 1 ? "" : "s"}
            </p>
          </div>
          <input
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Your name (required to act)"
            style={{
              background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
              height: 32, padding: "0 10px", fontSize: 12.5, color: TOKENS.textPrimary, width: 200,
            }}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6" style={{ borderBottom: `1px solid ${TOKENS.border}` }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
                padding: "9px 14px", fontSize: 13,
                color: tab === key ? TOKENS.textPrimary : TOKENS.textFaint,
                borderBottom: tab === key ? `2px solid ${TOKENS.riskReview}` : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: TOKENS.textFaint, fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {tab === "jurisdictions" && (
              <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden", background: TOKENS.surface }}>
                {jurisdictions.map((j, i) => (
                  <div
                    key={j.id}
                    onClick={() => setSelectedJurisdiction(j)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    style={{
                      background: i % 2 === 0 ? TOKENS.surface : "#F4F1E8",
                      borderBottom: i < jurisdictions.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14 }}>{j.country}</div>
                      <div style={{ fontSize: 12, color: TOKENS.textFaint }}>
                        {j.region} {j.review_notes ? `— ${j.review_notes}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 11.5, color: TOKENS.textFaint }}>
                        {j.last_reviewed_at ? `reviewed ${j.last_reviewed_at}` : "never reviewed"}
                      </span>
                      {j.solicitation_risk === "low" && <Badge color={TOKENS.riskLow}>Cleared</Badge>}
                      {j.solicitation_risk === "review_required" && <Badge color={TOKENS.riskReview}>Review required</Badge>}
                      {j.solicitation_risk === "do_not_contact" && <Badge color={TOKENS.riskBlocked}>Blocked</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "templates" && (
              <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden", background: TOKENS.surface }}>
                {pendingTemplates.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: TOKENS.textFaint, fontSize: 13 }}>
                    Nothing waiting on approval.
                  </div>
                )}
                {pendingTemplates.map((step, i) => (
                  <div
                    key={step.id}
                    className="px-4 py-3"
                    style={{
                      background: i % 2 === 0 ? TOKENS.surface : "#F4F1E8",
                      borderBottom: i < pendingTemplates.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div style={{ fontSize: 13.5 }}>{step.sequences?.name} — step {step.step_order}</div>
                        <div style={{ fontSize: 11.5, color: TOKENS.textFaint }}>{step.channel}</div>
                      </div>
                      <button
                        onClick={() => approveTemplate(step)}
                        style={{
                          fontSize: 12.5, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                          background: `${TOKENS.riskLow}18`, color: TOKENS.riskLow, border: `1px solid ${TOKENS.riskLow}55`,
                        }}
                      >
                        Approve
                      </button>
                    </div>
                    <pre style={{
                      fontSize: 12, color: TOKENS.textMuted, whiteSpace: "pre-wrap",
                      background: TOKENS.surfaceRaised, padding: 10, borderRadius: 6, margin: 0,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {step.subject_template ? `Subject: ${step.subject_template}\n\n` : ""}{step.body_template}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {tab === "blocked" && (
              <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden", background: TOKENS.surface }}>
                {blockedSends.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: TOKENS.textFaint, fontSize: 13 }}>
                    Nothing blocked right now.
                  </div>
                )}
                {blockedSends.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-4 py-3"
                    style={{
                      background: i % 2 === 0 ? TOKENS.surface : "#F4F1E8",
                      borderBottom: i < blockedSends.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5 }}>
                        {s.sequence_enrollments?.leads?.full_name ?? "Unknown lead"} · {s.sequence_enrollments?.leads?.company ?? "—"}
                      </div>
                      <div style={{ fontSize: 11.5, color: TOKENS.textFaint }}>
                        {s.sequence_steps?.sequences?.name} — {s.block_reason ?? s.status}
                      </div>
                    </div>
                    <button
                      onClick={() => retrySend(s.id)}
                      className="flex items-center gap-1"
                      style={{
                        fontSize: 12.5, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                        background: TOKENS.surfaceRaised, color: TOKENS.textMuted, border: `1px solid ${TOKENS.border}`,
                      }}
                    >
                      <RotateCcw size={12} /> Retry
                    </button>
                  </div>
                ))}
              </div>
            )}
            {tab === "provenance" && (
              <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden", background: TOKENS.surface }}>
                {provenanceLeads.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: TOKENS.textFaint, fontSize: 13 }}>
                    Nothing flagged right now.
                  </div>
                )}
                {provenanceLeads.map((lead, i) => (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedProvenanceLead(lead)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    style={{
                      background: i % 2 === 0 ? TOKENS.surface : "#F4F1E8",
                      borderBottom: i < provenanceLeads.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14 }}>{lead.full_name}</div>
                      <div style={{ fontSize: 12, color: TOKENS.textFaint }}>
                        {lead.company ?? "—"} · source: {lead.source ?? "unknown"}
                      </div>
                    </div>
                    <Badge color={TOKENS.riskBlocked}>Unresolved</Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Jurisdiction decision drawer */}
      {selectedJurisdiction && (
        <div
          onClick={() => setSelectedJurisdiction(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(6,9,13,0.6)", display: "flex", justifyContent: "flex-end", zIndex: 40 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 380, maxWidth: "90vw", height: "100%", background: TOKENS.surface, borderLeft: `1px solid ${TOKENS.border}`, padding: 22 }}
          >
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 19, marginBottom: 4 }}>
              {selectedJurisdiction.country}
            </div>
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint, marginBottom: 18 }}>
              {selectedJurisdiction.region} · {selectedJurisdiction.review_notes}
            </div>

            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 6 }}>
              Review notes
            </div>
            <textarea
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              rows={4}
              placeholder="Reasoning, counsel reference, scope of clearance…"
              style={{
                width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                padding: 10, fontSize: 13, color: TOKENS.textPrimary, marginBottom: 16, resize: "vertical",
              }}
            />

            <div className="flex flex-col gap-2">
              <button
                onClick={() => submitJurisdictionDecision("cleared")}
                style={{ padding: "9px 0", borderRadius: 6, fontSize: 13, cursor: "pointer", background: `${TOKENS.riskLow}18`, color: TOKENS.riskLow, border: `1px solid ${TOKENS.riskLow}55` }}
              >
                <ShieldCheck size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
                Clear for outreach
              </button>
              <button
                onClick={() => submitJurisdictionDecision("needs_counsel")}
                style={{ padding: "9px 0", borderRadius: 6, fontSize: 13, cursor: "pointer", background: `${TOKENS.riskReview}18`, color: TOKENS.riskReview, border: `1px solid ${TOKENS.riskReview}55` }}
              >
                <ShieldAlert size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
                Needs counsel — keep pending
              </button>
              <button
                onClick={() => submitJurisdictionDecision("blocked")}
                style={{ padding: "9px 0", borderRadius: 6, fontSize: 13, cursor: "pointer", background: `${TOKENS.riskBlocked}18`, color: TOKENS.riskBlocked, border: `1px solid ${TOKENS.riskBlocked}55` }}
              >
                <ShieldX size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
                Block this market
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provenance clearing drawer */}
      {selectedProvenanceLead && (
        <div
          onClick={() => setSelectedProvenanceLead(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(6,9,13,0.6)", display: "flex", justifyContent: "flex-end", zIndex: 40 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 380, maxWidth: "90vw", height: "100%", background: TOKENS.surface, borderLeft: `1px solid ${TOKENS.border}`, padding: 22 }}
          >
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 19, marginBottom: 4 }}>
              {selectedProvenanceLead.full_name}
            </div>
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint, marginBottom: 18 }}>
              {selectedProvenanceLead.company ?? "—"} · source: {selectedProvenanceLead.source ?? "unknown"}
            </div>

            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 6 }}>
              How was this traced?
            </div>
            <textarea
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              rows={4}
              placeholder="e.g. confirmed this came from the Apollo export dated..., or matches a conference list from..."
              style={{
                width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                padding: 10, fontSize: 13, color: TOKENS.textPrimary, marginBottom: 16, resize: "vertical",
              }}
            />

            <button
              onClick={() => clearProvenance(selectedProvenanceLead)}
              style={{ width: "100%", padding: "9px 0", borderRadius: 6, fontSize: 13, cursor: "pointer", background: `${TOKENS.riskLow}18`, color: TOKENS.riskLow, border: `1px solid ${TOKENS.riskLow}55` }}
            >
              <ShieldCheck size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
              Clear — source confirmed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
