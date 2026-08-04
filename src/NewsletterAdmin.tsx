import React, { useCallback, useEffect, useState } from "react";
import { Send, Users } from "lucide-react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";


export default function NewsletterAdmin() {
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: subs } = await supabase
      .from("newsletter_subscribers")
      .select("*")
      .order("created_at", { ascending: false });
    setSubscribers(subs ?? []);

    const { data: iss } = await supabase
      .from("newsletter_issues")
      .select("*")
      .order("created_at", { ascending: false });
    setIssues(iss ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const confirmedCount = subscribers.filter((s) => s.status === "confirmed").length;
  const pendingCount = subscribers.filter((s) => s.status === "pending").length;

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    if (!window.confirm(`Send this to ${confirmedCount} confirmed subscriber${confirmedCount === 1 ? "" : "s"}? This can't be undone.`)) return;

    setSending(true);
    try {
      const { data: issue, error } = await supabase
        .from("newsletter_issues")
        .insert({ subject, body })
        .select()
        .single();
      if (error) throw error;

      const { data, error: sendErr } = await supabase.functions.invoke("send-newsletter", {
        body: { issue_id: issue.id },
      });
      if (sendErr) throw sendErr;

      alert(`Sent to ${data.sent} of ${data.total} subscribers.`);
      setSubject(""); setBody("");
      await loadAll();
    } catch (err: any) {
      alert(`Failed to send: ${err?.message ?? err}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-baseline justify-between border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <div>
            <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 28, color: TOKENS.ivory }}>
              Newsletter
            </h1>
            <p style={{ color: TOKENS.ivoryMuted, fontSize: 13, marginTop: 2 }}>
              Opt-in only — nobody here was added except by their own confirmation.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px mb-7" style={{ background: TOKENS.border }}>
          {[
            { label: "Confirmed subscribers", value: confirmedCount },
            { label: "Pending confirmation", value: pendingCount },
            { label: "Issues sent", value: issues.filter((i) => i.status === "sent").length },
          ].map((s) => (
            <div key={s.label} style={{ background: TOKENS.surface, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <div className="flex items-center gap-2 mb-4">
            <Send size={15} color={TOKENS.gold} />
            <div style={{ fontSize: 14 }}>Compose new issue</div>
          </div>
          <input
            value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
            style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "9px 10px", color: TOKENS.textPrimary, fontSize: 13, marginBottom: 10 }}
          />
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the issue here — an unsubscribe link is added automatically for each recipient."
            rows={8}
            style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "9px 10px", color: TOKENS.textPrimary, fontSize: 13, marginBottom: 12, resize: "vertical" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim() || confirmedCount === 0}
            style={{
              background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "9px 16px",
              fontSize: 13, fontWeight: 600, cursor: sending ? "default" : "pointer",
              opacity: sending || confirmedCount === 0 ? 0.6 : 1,
            }}
          >
            {sending ? "Sending…" : confirmedCount === 0 ? "No confirmed subscribers yet" : `Send to ${confirmedCount} subscriber${confirmedCount === 1 ? "" : "s"}`}
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Users size={14} color={TOKENS.textFaint} />
          <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em" }}>Subscribers</div>
        </div>
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 20, color: TOKENS.textFaint, fontSize: 13 }}>Loading…</div>
          ) : subscribers.length === 0 ? (
            <div style={{ padding: 20, color: TOKENS.textFaint, fontSize: 13, textAlign: "center" }}>No subscribers yet.</div>
          ) : (
            subscribers.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5" style={{
                background: i % 2 === 0 ? TOKENS.surface : "transparent",
                borderBottom: i < subscribers.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
              }}>
                <div>
                  <div style={{ fontSize: 13 }}>{s.full_name || s.email}</div>
                  {s.full_name && <div style={{ fontSize: 11.5, color: TOKENS.textFaint }}>{s.email}</div>}
                </div>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 999,
                  background: s.status === "confirmed" ? `${TOKENS.riskLow}18` : TOKENS.surfaceRaised,
                  color: s.status === "confirmed" ? TOKENS.riskLow : TOKENS.textFaint,
                }}>
                  {s.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
