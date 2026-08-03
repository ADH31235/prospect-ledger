import React, { useMemo } from "react";

const TOKENS = {
  bg: "#0E141C", surface: "#161E29", surfaceRaised: "#1C2733",
  border: "#2A3644", borderFaint: "#212B37", textPrimary: "#E7ECF2",
  textMuted: "#8B98AC", textFaint: "#5C6879", gold: "#C9A227",
  riskLow: "#4C9E76", riskReview: "#D9A441", riskBlocked: "#BD5A47",
};

const STAGE_ORDER = ["new", "enriched", "contacted", "engaged", "qualified", "client"];
const STAGE_LABELS = {
  new: "New", enriched: "Enriched", contacted: "Contacted",
  engaged: "Engaged", qualified: "Qualified", client: "Client",
};

function formatMoney(n) {
  if (!n) return "£0.0M";
  return "£" + (n / 1_000_000).toFixed(1) + "M";
}

// Buckets lead creation dates into the last N weeks (Monday-start),
// including weeks with zero leads, so the chart shows real gaps
// rather than silently skipping them.
function weeklyBuckets(leads, weeks = 12) {
  const now = new Date();
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1 - i * 7); // Monday of that week
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    buckets.push({ start: weekStart, end: weekEnd, count: 0 });
  }
  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const created = new Date(lead.createdAt);
    for (const bucket of buckets) {
      if (created >= bucket.start && created < bucket.end) {
        bucket.count++;
        break;
      }
    }
  }
  return buckets;
}

export default function ReportsView({ leads, jurisdictions }) {
  const stats = useMemo(() => {
    const stageCounts = {};
    for (const stage of [...STAGE_ORDER, "disqualified", "do_not_contact"]) stageCounts[stage] = 0;
    for (const l of leads) stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;

    const sourceCounts = {};
    for (const l of leads) {
      const s = l.source || "unknown";
      sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
    }

    const jurisdictionCounts = {};
    for (const l of leads) {
      const j = jurisdictions?.[l.jurisdiction];
      const label = j?.country ?? "Not set";
      jurisdictionCounts[label] = (jurisdictionCounts[label] ?? 0) + 1;
    }

    const totalPipelineValue = leads
      .filter((l) => l.stage !== "disqualified")
      .reduce((sum, l) => sum + (l.assets ?? 0), 0);

    const avgScore = leads.length
      ? Math.round(leads.reduce((sum, l) => sum + (l.score ?? 0), 0) / leads.length)
      : 0;

    const qualifiedOrClient = (stageCounts.qualified ?? 0) + (stageCounts.client ?? 0);
    const conversionRate = leads.length ? Math.round((qualifiedOrClient / leads.length) * 100) : 0;

    return { stageCounts, sourceCounts, jurisdictionCounts, totalPipelineValue, avgScore, conversionRate };
  }, [leads, jurisdictions]);

  const weekly = useMemo(() => weeklyBuckets(leads), [leads]);
  const maxWeekly = Math.max(1, ...weekly.map((w) => w.count));
  const maxStage = Math.max(1, ...STAGE_ORDER.map((s) => stats.stageCounts[s] ?? 0));

  const topSources = Object.entries(stats.sourceCounts).sort((a, b) => b[1] - a[1]);
  const topJurisdictions = Object.entries(stats.jurisdictionCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxSource = Math.max(1, ...topSources.map(([, c]) => c));
  const maxJurisdiction = Math.max(1, ...topJurisdictions.map(([, c]) => c));

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <h1 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28 }}>
            Reports
          </h1>
          <p style={{ color: TOKENS.textMuted, fontSize: 13, marginTop: 2 }}>
            Where your book stands right now — this is a snapshot, not a historical trend (stage-change dates aren't tracked yet).
          </p>
        </div>

        <div className="grid grid-cols-4 gap-px mb-8" style={{ background: TOKENS.border }}>
          {[
            { label: "Total prospects", value: leads.length },
            { label: "Qualified + Client", value: (stats.stageCounts.qualified ?? 0) + (stats.stageCounts.client ?? 0) },
            { label: "Conversion rate", value: `${stats.conversionRate}%` },
            { label: "Pipeline value (est.)", value: formatMoney(stats.totalPipelineValue) },
          ].map((s) => (
            <div key={s.label} style={{ background: TOKENS.surface, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Stage funnel
        </div>
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "18px 20px", marginBottom: 32 }}>
          {STAGE_ORDER.map((stage) => {
            const count = stats.stageCounts[stage] ?? 0;
            const pct = leads.length ? Math.round((count / leads.length) * 100) : 0;
            return (
              <div key={stage} className="flex items-center gap-3" style={{ marginBottom: 14 }}>
                <div style={{ width: 90, fontSize: 12.5, color: TOKENS.textMuted, flexShrink: 0 }}>{STAGE_LABELS[stage]}</div>
                <div style={{ flex: 1, background: TOKENS.surfaceRaised, borderRadius: 4, height: 22, position: "relative", overflow: "hidden" }}>
                  <div style={{
                    width: `${(count / maxStage) * 100}%`, height: "100%",
                    background: stage === "client" ? TOKENS.riskLow : stage === "qualified" ? TOKENS.gold : TOKENS.textFaint,
                    borderRadius: 4, transition: "width 0.3s",
                  }} />
                </div>
                <div style={{ width: 90, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: TOKENS.textPrimary, flexShrink: 0 }}>
                  {count} <span style={{ color: TOKENS.textFaint }}>({pct}%)</span>
                </div>
              </div>
            );
          })}
          {(stats.stageCounts.disqualified > 0 || stats.stageCounts.do_not_contact > 0) && (
            <div style={{ fontSize: 11.5, color: TOKENS.textFaint, marginTop: 6, paddingTop: 12, borderTop: `1px solid ${TOKENS.borderFaint}` }}>
              {stats.stageCounts.disqualified ?? 0} disqualified · {stats.stageCounts.do_not_contact ?? 0} blocked (do not contact) — excluded from the funnel above
            </div>
          )}
        </div>

        <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          New prospects per week
        </div>
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "20px 20px 12px", marginBottom: 32 }}>
          <div className="flex items-end gap-1.5" style={{ height: 120 }}>
            {weekly.map((w, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div
                  title={`${w.count} new — week of ${w.start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`}
                  style={{
                    width: "100%", background: w.count > 0 ? TOKENS.gold : TOKENS.surfaceRaised,
                    height: `${Math.max(4, (w.count / maxWeekly) * 100)}%`, borderRadius: "3px 3px 0 0",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between" style={{ marginTop: 8 }}>
            <span style={{ fontSize: 10.5, color: TOKENS.textFaint }}>
              {weekly[0].start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </span>
            <span style={{ fontSize: 10.5, color: TOKENS.textFaint }}>Today</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              By source
            </div>
            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "16px 18px" }}>
              {topSources.length === 0 ? (
                <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>No prospects yet.</div>
              ) : (
                topSources.map(([source, count]) => (
                  <div key={source} className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                    <div style={{ width: 100, fontSize: 12, color: TOKENS.textMuted, flexShrink: 0, textTransform: "capitalize" }}>
                      {source.replace(/_/g, " ")}
                    </div>
                    <div style={{ flex: 1, background: TOKENS.surfaceRaised, borderRadius: 4, height: 16 }}>
                      <div style={{ width: `${(count / maxSource) * 100}%`, height: "100%", background: TOKENS.gold, borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 24, textAlign: "right", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{count}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              By jurisdiction
            </div>
            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "16px 18px" }}>
              {topJurisdictions.length === 0 ? (
                <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>No prospects yet.</div>
              ) : (
                topJurisdictions.map(([country, count]) => (
                  <div key={country} className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                    <div style={{ width: 100, fontSize: 12, color: TOKENS.textMuted, flexShrink: 0 }}>{country}</div>
                    <div style={{ flex: 1, background: TOKENS.surfaceRaised, borderRadius: 4, height: 16 }}>
                      <div style={{ width: `${(count / maxJurisdiction) * 100}%`, height: "100%", background: "#4C8FDB", borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 24, textAlign: "right", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{count}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
