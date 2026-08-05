import React, { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useStageHistory } from "./useStageHistory";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";


const STAGE_ORDER = ["new", "enriched", "contacted", "engaged", "qualified", "client"];
const STAGE_LABELS = {
  new: "New", enriched: "Enriched", contacted: "Contacted",
  engaged: "Engaged", qualified: "Qualified", client: "Client",
};

const CURRENCY_SYMBOLS = { GBP: "£", USD: "$", EUR: "€", AED: "AED ", CHF: "CHF " };

function formatMoney(n, currency = "GBP") {
  if (!n) return `${CURRENCY_SYMBOLS[currency] ?? currency + " "}0.0M`;
  return (CURRENCY_SYMBOLS[currency] ?? currency + " ") + (n / 1_000_000).toFixed(1) + "M";
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
  const { getRecentChanges, getAllHistory } = useStageHistory();
  const [recentChanges, setRecentChanges] = useState([]);
  const [allHistory, setAllHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [contentPieces, setContentPieces] = useState([]);

  // Shared with the Ledger tab's currency picker (same localStorage
  // keys, read fresh here) — so switching between tabs always shows
  // a consistent pipeline total, rather than each screen quietly
  // assuming GBP. This component fully remounts each time you
  // switch to the Reports tab, so this lazy read always picks up
  // whatever was most recently chosen on Ledger.
  const [assetsDisplayCurrency] = useState(
    () => localStorage.getItem("ledger_assets_display_currency") || "GBP"
  );
  const [assetsManualRates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ledger_assets_manual_rates") || "{}");
    } catch {
      return {};
    }
  });

  const [dateRange, setDateRange] = useState("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (dateRange !== "all") {
      const days = parseInt(dateRange, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      result = result.filter((l) => l.createdAt && new Date(l.createdAt) >= cutoff);
    }
    if (jurisdictionFilter !== "all") {
      result = result.filter((l) => {
        const j = jurisdictions?.[l.jurisdiction];
        return (j?.country ?? "Not set") === jurisdictionFilter;
      });
    }
    if (sourceFilter !== "all") {
      result = result.filter((l) => (l.source || "unknown") === sourceFilter);
    }
    return result;
  }, [leads, jurisdictions, dateRange, jurisdictionFilter, sourceFilter]);

  const filteredLeadIds = useMemo(() => new Set(filteredLeads.map((l) => l.id)), [filteredLeads]);


  useEffect(() => {
    supabase.from("content_pieces").select("slug, title, content_type").then(({ data }) => {
      setContentPieces(data ?? []);
    });
  }, []);

  useEffect(() => {
    (async () => {
      setHistoryLoading(true);
      try {
        const [recent, all] = await Promise.all([getRecentChanges(12), getAllHistory()]);
        setRecentChanges(recent);
        setAllHistory(all);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [getRecentChanges, getAllHistory]);

  // "Ever reached" counts — how many distinct leads have ever
  // touched each stage, even if they later moved on or were
  // disqualified. This is the actual historical funnel, distinct
  // from the current-snapshot funnel below (which only counts
  // where a lead sits right now).
  const everReachedCounts = useMemo(() => {
    const reached = {};
    for (const stage of STAGE_ORDER) reached[stage] = new Set();
    for (const row of allHistory) {
      if (!filteredLeadIds.has(row.lead_id)) continue;
      if (reached[row.to_stage]) reached[row.to_stage].add(row.lead_id);
    }
    const counts = {};
    for (const stage of STAGE_ORDER) counts[stage] = reached[stage].size;
    return counts;
  }, [allHistory, filteredLeadIds]);

  // Average days from a lead's first "new" entry to its first
  // "qualified" or "client" entry, across leads that have reached
  // one of those stages.
  const avgDaysToQualify = useMemo(() => {
    const firstNewByLead = {};
    const firstQualifiedByLead = {};
    for (const row of allHistory) {
      if (!filteredLeadIds.has(row.lead_id)) continue;
      if (row.to_stage === "new" && !firstNewByLead[row.lead_id]) {
        firstNewByLead[row.lead_id] = new Date(row.changed_at);
      }
      if ((row.to_stage === "qualified" || row.to_stage === "client") && !firstQualifiedByLead[row.lead_id]) {
        firstQualifiedByLead[row.lead_id] = new Date(row.changed_at);
      }
    }
    const diffs = [];
    for (const leadId of Object.keys(firstQualifiedByLead)) {
      if (firstNewByLead[leadId]) {
        const days = (firstQualifiedByLead[leadId] - firstNewByLead[leadId]) / (1000 * 60 * 60 * 24);
        if (days >= 0) diffs.push(days);
      }
    }
    if (!diffs.length) return null;
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  }, [allHistory, filteredLeadIds]);

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const stats = useMemo(() => {
    const stageCounts = {};
    for (const stage of [...STAGE_ORDER, "disqualified", "do_not_contact"]) stageCounts[stage] = 0;
    for (const l of filteredLeads) stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;

    const sourceCounts = {};
    const sourceQualified = {};
    for (const l of filteredLeads) {
      const s = l.source || "unknown";
      sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
      if (l.stage === "qualified" || l.stage === "client") sourceQualified[s] = (sourceQualified[s] ?? 0) + 1;
    }

    const jurisdictionCounts = {};
    const jurisdictionQualified = {};
    for (const l of filteredLeads) {
      const j = jurisdictions?.[l.jurisdiction];
      const label = j?.country ?? "Not set";
      jurisdictionCounts[label] = (jurisdictionCounts[label] ?? 0) + 1;
      if (l.stage === "qualified" || l.stage === "client") jurisdictionQualified[label] = (jurisdictionQualified[label] ?? 0) + 1;
    }

    const campaignCounts = {};
    for (const l of filteredLeads) {
      const campaign = l.adTracking?.campaign_name;
      if (campaign) campaignCounts[campaign] = (campaignCounts[campaign] ?? 0) + 1;
    }

    const contentCounts = {};
    for (const l of filteredLeads) {
      const slug = l.adTracking?.utm_content;
      if (slug) contentCounts[slug] = (contentCounts[slug] ?? 0) + 1;
    }

    const pipelineValueByCurrency = filteredLeads
      .filter((l) => l.stage !== "disqualified")
      .reduce((acc, l) => {
        if (l.assets) {
          const cur = l.currency || "GBP";
          acc[cur] = (acc[cur] ?? 0) + l.assets;
        }
        return acc;
      }, {});

    const avgScore = filteredLeads.length
      ? Math.round(filteredLeads.reduce((sum, l) => sum + (l.score ?? 0), 0) / filteredLeads.length)
      : 0;

    const qualifiedOrClient = (stageCounts.qualified ?? 0) + (stageCounts.client ?? 0);
    const conversionRate = filteredLeads.length ? Math.round((qualifiedOrClient / filteredLeads.length) * 100) : 0;

    // Score distribution — five equal buckets across the 0-100
    // range. Useful for sanity-checking whether the scoring model
    // is actually spreading leads out, or bunching everyone into
    // one band.
    const scoreBuckets = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
    for (const l of filteredLeads) {
      const s = l.score ?? 0;
      if (s <= 20) scoreBuckets["0-20"]++;
      else if (s <= 40) scoreBuckets["21-40"]++;
      else if (s <= 60) scoreBuckets["41-60"]++;
      else if (s <= 80) scoreBuckets["61-80"]++;
      else scoreBuckets["81-100"]++;
    }

    return {
      stageCounts, sourceCounts, sourceQualified, jurisdictionCounts, jurisdictionQualified,
      campaignCounts, contentCounts, pipelineValueByCurrency, avgScore, conversionRate, scoreBuckets,
    };
  }, [filteredLeads, jurisdictions]);

  // Stage velocity — average days spent between consecutive stage
  // transitions, computed per lead then averaged. Only counts
  // history entries for leads that pass the current filter, so
  // this stays consistent with everything else on the page.
  const stageVelocity = useMemo(() => {
    const byLead = {};
    for (const row of allHistory) {
      if (!filteredLeadIds.has(row.lead_id)) continue;
      (byLead[row.lead_id] ??= []).push(row);
    }
    const transitionDiffs = {};
    for (const rows of Object.values(byLead)) {
      const sorted = [...rows].sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));
      for (let i = 1; i < sorted.length; i++) {
        const key = `${sorted[i - 1].to_stage} → ${sorted[i].to_stage}`;
        const days = (new Date(sorted[i].changed_at) - new Date(sorted[i - 1].changed_at)) / (1000 * 60 * 60 * 24);
        if (days >= 0) (transitionDiffs[key] ??= []).push(days);
      }
    }
    return Object.entries(transitionDiffs)
      .map(([key, diffs]) => ({ key, avgDays: Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length), count: diffs.length }))
      .sort((a, b) => b.count - a.count);
  }, [allHistory, filteredLeadIds]);

  const weekly = useMemo(() => weeklyBuckets(filteredLeads), [filteredLeads]);
  const maxWeekly = Math.max(1, ...weekly.map((w) => w.count));
  const maxStage = Math.max(1, ...STAGE_ORDER.map((s) => stats.stageCounts[s] ?? 0));

  const topSources = Object.entries(stats.sourceCounts).sort((a, b) => b[1] - a[1]);
  const topJurisdictions = Object.entries(stats.jurisdictionCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxSource = Math.max(1, ...topSources.map(([, c]) => c));
  const maxJurisdiction = Math.max(1, ...topJurisdictions.map(([, c]) => c));
  const topCampaigns = Object.entries(stats.campaignCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCampaign = Math.max(1, ...topCampaigns.map(([, c]) => c));

  const contentBySlug = Object.fromEntries(contentPieces.map((c) => [c.slug, c]));
  const topContent = Object.entries(stats.contentCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxContent = Math.max(1, ...topContent.map(([, c]) => c));

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 28, color: TOKENS.white }}>
            Reports
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-6">
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", fontSize: 12.5, color: TOKENS.textPrimary }}>
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <select value={jurisdictionFilter} onChange={(e) => setJurisdictionFilter(e.target.value)} style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", fontSize: 12.5, color: TOKENS.textPrimary }}>
            <option value="all">All jurisdictions</option>
            {[...new Set(leads.map((l) => jurisdictions?.[l.jurisdiction]?.country ?? "Not set"))].sort().map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", fontSize: 12.5, color: TOKENS.textPrimary }}>
            <option value="all">All sources</option>
            {[...new Set(leads.map((l) => l.source || "unknown"))].sort().map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          {(dateRange !== "all" || jurisdictionFilter !== "all" || sourceFilter !== "all") && (
            <button
              onClick={() => { setDateRange("all"); setJurisdictionFilter("all"); setSourceFilter("all"); }}
              style={{ background: "none", border: "none", color: TOKENS.ivory, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-5 gap-px mb-8" style={{ background: TOKENS.border }}>
          {[
            { label: "Total prospects", value: filteredLeads.length },
            { label: "Qualified + Client", value: (stats.stageCounts.qualified ?? 0) + (stats.stageCounts.client ?? 0) },
            { label: "Conversion rate", value: `${stats.conversionRate}%` },
            { label: "Pipeline value (est.)", value: formatMoney(
                Object.keys(stats.pipelineValueByCurrency).reduce((sum, cur) => {
                  const rate = cur === assetsDisplayCurrency ? 1 : (assetsManualRates[cur] ?? 1);
                  return sum + stats.pipelineValueByCurrency[cur] * rate;
                }, 0),
                assetsDisplayCurrency
              ) },
            { label: "Avg days to qualify", value: avgDaysToQualify != null ? avgDaysToQualify : "—" },
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
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "18px 20px", marginBottom: 32, background: TOKENS.surface }}>
          {STAGE_ORDER.map((stage) => {
            const count = stats.stageCounts[stage] ?? 0;
            const pct = filteredLeads.length ? Math.round((count / filteredLeads.length) * 100) : 0;
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
          Historical funnel — ever reached this stage
        </div>
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "18px 20px", marginBottom: 32, background: TOKENS.surface }}>
          {historyLoading ? (
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>Loading…</div>
          ) : (
            STAGE_ORDER.map((stage) => {
              const count = everReachedCounts[stage] ?? 0;
              const maxEver = Math.max(1, ...STAGE_ORDER.map((s) => everReachedCounts[s] ?? 0));
              return (
                <div key={stage} className="flex items-center gap-3" style={{ marginBottom: 14 }}>
                  <div style={{ width: 90, fontSize: 12.5, color: TOKENS.textMuted, flexShrink: 0 }}>{STAGE_LABELS[stage]}</div>
                  <div style={{ flex: 1, background: TOKENS.surfaceRaised, borderRadius: 4, height: 22, position: "relative", overflow: "hidden" }}>
                    <div style={{
                      width: `${(count / maxEver) * 100}%`, height: "100%",
                      background: "#4C8FDB", borderRadius: 4, transition: "width 0.3s",
                    }} />
                  </div>
                  <div style={{ width: 40, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, flexShrink: 0 }}>
                    {count}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Stage velocity — average days per transition
        </div>
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "18px 20px", marginBottom: 32, background: TOKENS.surface }}>
          {historyLoading ? (
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>Loading…</div>
          ) : stageVelocity.length === 0 ? (
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>Not enough stage changes yet to compute this.</div>
          ) : (
            stageVelocity.map(({ key, avgDays, count }) => (
              <div key={key} className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, color: TOKENS.textMuted }}>{key}</span>
                <span style={{ fontSize: 12.5 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{avgDays}d</span>
                  <span style={{ color: TOKENS.textFaint }}> avg · {count} lead{count === 1 ? "" : "s"}</span>
                </span>
              </div>
            ))
          )}
        </div>

        <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          New prospects per week
        </div>
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "20px 20px 12px", marginBottom: 32, background: TOKENS.surface }}>
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
            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "16px 18px", background: TOKENS.surface }}>
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
            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "16px 18px", background: TOKENS.surface }}>
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

        <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Score distribution
        </div>
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "18px 20px", marginBottom: 32, background: TOKENS.surface }}>
          <div className="flex items-end gap-2" style={{ height: 100 }}>
            {Object.entries(stats.scoreBuckets).map(([bucket, count]) => {
              const maxBucket = Math.max(1, ...Object.values(stats.scoreBuckets));
              return (
                <div key={bucket} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <span style={{ fontSize: 11, color: TOKENS.textFaint, marginBottom: 4 }}>{count}</span>
                  <div style={{ width: "100%", background: "#8B7FD9", borderRadius: "3px 3px 0 0", height: `${Math.max(3, (count / maxBucket) * 100)}%` }} />
                  <span style={{ fontSize: 10.5, color: TOKENS.textFaint, marginTop: 6 }}>{bucket}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Conversion by source
            </div>
            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "16px 18px", background: TOKENS.surface }}>
              {topSources.length === 0 ? (
                <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>No prospects yet.</div>
              ) : (
                topSources.map(([source, count]) => {
                  const converted = stats.sourceQualified[source] ?? 0;
                  const rate = count ? Math.round((converted / count) * 100) : 0;
                  return (
                    <div key={source} className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                      <div style={{ width: 100, fontSize: 12, color: TOKENS.textMuted, flexShrink: 0, textTransform: "capitalize" }}>
                        {source.replace(/_/g, " ")}
                      </div>
                      <div style={{ flex: 1, background: TOKENS.surfaceRaised, borderRadius: 4, height: 16 }}>
                        <div style={{ width: `${rate}%`, height: "100%", background: TOKENS.riskLow, borderRadius: 4 }} />
                      </div>
                      <div style={{ width: 60, textAlign: "right", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{rate}% <span style={{ color: TOKENS.textFaint }}>({converted}/{count})</span></div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Conversion by jurisdiction
            </div>
            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "16px 18px", background: TOKENS.surface }}>
              {topJurisdictions.length === 0 ? (
                <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>No prospects yet.</div>
              ) : (
                topJurisdictions.map(([country, count]) => {
                  const converted = stats.jurisdictionQualified[country] ?? 0;
                  const rate = count ? Math.round((converted / count) * 100) : 0;
                  return (
                    <div key={country} className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                      <div style={{ width: 100, fontSize: 12, color: TOKENS.textMuted, flexShrink: 0 }}>{country}</div>
                      <div style={{ flex: 1, background: TOKENS.surfaceRaised, borderRadius: 4, height: 16 }}>
                        <div style={{ width: `${rate}%`, height: "100%", background: TOKENS.riskLow, borderRadius: 4 }} />
                      </div>
                      <div style={{ width: 60, textAlign: "right", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{rate}% <span style={{ color: TOKENS.textFaint }}>({converted}/{count})</span></div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {topCampaigns.length > 0 && (
          <>
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              By ad campaign
            </div>
            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "16px 18px", marginBottom: 32, background: TOKENS.surface }}>
              {topCampaigns.map(([campaign, count]) => (
                <div key={campaign} className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                  <div style={{ width: 220, fontSize: 12, color: TOKENS.textMuted, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {campaign}
                  </div>
                  <div style={{ flex: 1, background: TOKENS.surfaceRaised, borderRadius: 4, height: 16 }}>
                    <div style={{ width: `${(count / maxCampaign) * 100}%`, height: "100%", background: TOKENS.gold, borderRadius: 4 }} />
                  </div>
                  <div style={{ width: 24, textAlign: "right", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{count}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {topContent.length > 0 && (
          <>
            <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              By content piece
            </div>
            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: "16px 18px", marginBottom: 32, background: TOKENS.surface }}>
              {topContent.map(([slug, count]) => {
                const piece = contentBySlug[slug];
                return (
                  <div key={slug} className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                    <div style={{ width: 260, fontSize: 12, color: TOKENS.textMuted, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {piece ? piece.title : slug}
                    </div>
                    <div style={{ flex: 1, background: TOKENS.surfaceRaised, borderRadius: 4, height: 16 }}>
                      <div style={{ width: `${(count / maxContent) * 100}%`, height: "100%", background: "#8B7FD9", borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 24, textAlign: "right", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ fontSize: 12.5, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Recent activity
        </div>
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden", background: TOKENS.surface }}>
          {historyLoading ? (
            <div style={{ padding: 20, fontSize: 12.5, color: TOKENS.textFaint }}>Loading…</div>
          ) : recentChanges.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12.5, color: TOKENS.textFaint, textAlign: "center" }}>
              No stage changes recorded yet.
            </div>
          ) : (
            recentChanges.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-2.5"
                style={{
                  background: i % 2 === 0 ? TOKENS.surface : "#F4F1E8",
                  borderBottom: i < recentChanges.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13 }}>{c.leads?.full_name ?? "Unknown"}</span>
                  <span style={{ fontSize: 12, color: TOKENS.textFaint }}>
                    {c.from_stage ? `${STAGE_LABELS[c.from_stage] ?? c.from_stage} → ` : "entered as "}
                    {STAGE_LABELS[c.to_stage] ?? c.to_stage}
                  </span>
                </div>
                <div className="flex items-center gap-1" style={{ fontSize: 11.5, color: TOKENS.textFaint }}>
                  <Clock size={11} />
                  {timeAgo(c.changed_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
