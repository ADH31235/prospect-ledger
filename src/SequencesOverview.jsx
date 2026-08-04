import React, { useCallback, useEffect, useState } from "react";
import { Square } from "lucide-react";
import { TOKENS } from "./theme";


const STATUS_META = {
  active: { label: "Active", color: TOKENS.riskLow },
  paused: { label: "Paused", color: TOKENS.riskReview },
  completed: { label: "Completed", color: TOKENS.textMuted },
  stopped: { label: "Stopped", color: TOKENS.textFaint },
  blocked_compliance: { label: "Blocked — compliance", color: TOKENS.riskBlocked },
};

function formatDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SequencesOverview({ getAllEnrollments, onStopEnrollment }) {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllEnrollments();
      setEnrollments(data);
    } finally {
      setLoading(false);
    }
  }, [getAllEnrollments]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = enrollments.filter((e) => statusFilter === "all" || e.status === statusFilter);
  const activeCount = enrollments.filter((e) => e.status === "active").length;
  const completedCount = enrollments.filter((e) => e.status === "completed").length;
  const stoppedCount = enrollments.filter((e) => e.status === "stopped").length;

  async function handleStop(enrollmentId) {
    if (!window.confirm("Stop this sequence? Any pending sends for it will be cancelled.")) return;
    await onStopEnrollment(enrollmentId);
    await load();
  }

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 28, color: TOKENS.white }}>
            Sequences
          </h1>
          <p style={{ color: TOKENS.ivory, fontSize: 13, marginTop: 2 }}>
            Every prospect currently enrolled in outreach, across all sequences.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px mb-7" style={{ background: TOKENS.border }}>
          {[
            { label: "Active", value: activeCount },
            { label: "Completed", value: completedCount },
            { label: "Stopped", value: stoppedCount },
          ].map((s) => (
            <div key={s.label} style={{ background: TOKENS.surface, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
              height: 34, padding: "0 10px", color: TOKENS.textPrimary, fontSize: 13,
            }}
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>
            Showing {filtered.length} of {enrollments.length}
          </div>
        </div>

        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden", background: TOKENS.surface }}>
          <div
            className="grid px-4 py-2.5"
            style={{
              gridTemplateColumns: "1.6fr 1.6fr 1fr 0.6fr 1fr 1fr 0.6fr",
              gap: 12, background: TOKENS.surfaceRaised, borderBottom: `1px solid ${TOKENS.border}`,
            }}
          >
            {["Prospect", "Sequence", "Status", "Step", "Enrolled", "Next send", ""].map((h) => (
              <div key={h} style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: TOKENS.textFaint }}>
                {h}
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13, textAlign: "center" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13, textAlign: "center" }}>
              Nothing here yet — enroll a prospect in a sequence from their detail drawer on the Ledger tab.
            </div>
          ) : (
            filtered.map((e, i) => {
              const meta = STATUS_META[e.status] ?? { label: e.status, color: TOKENS.textFaint };
              return (
                <div
                  key={e.id}
                  className="grid items-center px-4"
                  style={{
                    gridTemplateColumns: "1.6fr 1.6fr 1fr 0.6fr 1fr 1fr 0.6fr",
                    gap: 12, padding: "10px 16px",
                    background: i % 2 === 0 ? TOKENS.surface : "#F4F1E8",
                    borderBottom: i < filtered.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13.5 }}>{e.leads?.full_name ?? "Unknown"}</div>
                    <div style={{ fontSize: 11.5, color: TOKENS.textFaint }}>{e.leads?.company ?? "—"}</div>
                  </div>
                  <div style={{ fontSize: 13 }}>{e.sequences?.name ?? "—"}</div>
                  <div>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 999,
                      background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}55`,
                    }}>
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{e.current_step ?? 0}</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textMuted }}>{formatDateTime(e.enrolled_at)}</div>
                  <div style={{ fontSize: 12.5, color: e.nextSendAt ? TOKENS.textPrimary : TOKENS.textFaint }}>
                    {formatDateTime(e.nextSendAt)}
                  </div>
                  <div>
                    {e.status === "active" && (
                      <button
                        onClick={() => handleStop(e.id)}
                        title="Stop sequence"
                        style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.riskBlocked, display: "flex" }}
                      >
                        <Square size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
