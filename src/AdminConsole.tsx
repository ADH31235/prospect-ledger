import React, { useEffect, useState } from "react";
import { Building2, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";

const STATUS_META = {
  none: { label: "No subscription", color: TOKENS.textFaint },
  trialing: { label: "Trial", color: TOKENS.riskReview },
  active: { label: "Active", color: TOKENS.riskLow },
  past_due: { label: "Past due", color: TOKENS.riskBlocked },
  canceled: { label: "Canceled", color: TOKENS.textFaint },
  paused: { label: "Paused", color: TOKENS.riskReview },
};

export default function AdminConsole() {
  const [tenants, setTenants] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState(null);
  const [manualRates, setManualRates] = useState({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("admin-overview");
      if (error) throw error;
      setTenants(data?.tenants ?? []);
      setKpis(data?.kpis ?? null);
      if (data?.kpis?.mrr?.length) {
        setDisplayCurrency((prev) => prev ?? data.kpis.mrr[0].currency);
        setManualRates((prev) => {
          const next = { ...prev };
          for (const m of data.kpis.mrr) {
            if (!(m.currency in next)) next[m.currency] = 1;
          }
          return next;
        });
      }
    } catch (err) {
      setError(err?.message ?? "Couldn't load — you may not have access to this page.");
    } finally {
      setLoading(false);
    }
  }

  const totalLeads = tenants.reduce((sum, t) => sum + (t.lead_count ?? 0), 0);

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 28, color: TOKENS.white }}>
            Admin
          </h1>
          <p style={{ color: TOKENS.ivory, fontSize: 13, marginTop: 2 }}>
            Every company on the platform — visible only to you.
          </p>
        </div>

        {error ? (
          <div style={{ background: TOKENS.surface, borderRadius: 10, padding: 20, color: TOKENS.riskBlocked, fontSize: 13.5 }}>
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-px mb-3" style={{ background: TOKENS.border }}>
              {[
                {
                  label: "MRR",
                  value: kpis?.mrr?.length
                    ? kpis.mrr.map((m) => `${m.currency} ${m.amount.toLocaleString()}`).join(" + ")
                    : "—",
                },
                { label: "Companies", value: tenants.length },
                { label: "Paying now", value: (kpis?.statusCounts?.active ?? 0) + (kpis?.statusCounts?.trialing ?? 0) },
                { label: "Conversion rate", value: `${kpis?.conversionRate ?? 0}%` },
              ].map((s) => (
                <div key={s.label} style={{ background: TOKENS.surface, padding: "16px 18px" }}>
                  <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    {s.label}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-px mb-6" style={{ background: TOKENS.border }}>
              <div style={{ background: TOKENS.surface, padding: "16px 18px" }}>
                <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  New this month
                </div>
                <div className="flex items-center gap-2">
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20 }}>{kpis?.newThisMonth ?? 0}</div>
                  {kpis && kpis.newThisMonth !== kpis.newLastMonth && (
                    <span className="flex items-center gap-1" style={{ fontSize: 11.5, color: kpis.newThisMonth >= kpis.newLastMonth ? TOKENS.riskLow : TOKENS.riskBlocked }}>
                      {kpis.newThisMonth >= kpis.newLastMonth ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      vs {kpis.newLastMonth} last month
                    </span>
                  )}
                </div>
              </div>
              <div style={{ background: TOKENS.surface, padding: "16px 18px" }}>
                <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Churned
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20 }}>{kpis?.churnedCount ?? 0}</div>
              </div>
              <div style={{ background: TOKENS.surface, padding: "16px 18px" }}>
                <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Total leads across all
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20 }}>{totalLeads}</div>
              </div>
            </div>

            {kpis?.mrr?.length > 1 && (
              <div style={{ background: TOKENS.surface, borderRadius: 10, padding: 16, marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                  Combined total — manual exchange rates
                </div>
                <p style={{ fontSize: 12, color: TOKENS.textMuted, marginBottom: 12 }}>
                  You're billing in more than one currency. There's no live exchange-rate feed connected, so enter your own rates below (relative to your chosen display currency) to see a combined estimate.
                </p>
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <label style={{ fontSize: 12.5, color: TOKENS.textMuted }}>Show total in</label>
                  <select
                    value={displayCurrency ?? ""}
                    onChange={(e) => setDisplayCurrency(e.target.value)}
                    style={{ background: "#F4F1E8", border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 12.5 }}
                  >
                    {kpis.mrr.map((m) => <option key={m.currency} value={m.currency}>{m.currency}</option>)}
                  </select>
                </div>
                {kpis.mrr.filter((m) => m.currency !== displayCurrency).map((m) => (
                  <div key={m.currency} className="flex items-center gap-2 mb-2">
                    <span style={{ fontSize: 12.5, color: TOKENS.textMuted, width: 100 }}>1 {m.currency} =</span>
                    <input
                      type="number" step="0.0001" value={manualRates[m.currency] ?? 1}
                      onChange={(e) => setManualRates((prev) => ({ ...prev, [m.currency]: parseFloat(e.target.value) || 0 }))}
                      style={{ width: 90, background: "#F4F1E8", border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 12.5 }}
                    />
                    <span style={{ fontSize: 12.5, color: TOKENS.textMuted }}>{displayCurrency}</span>
                  </div>
                ))}
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, marginTop: 8 }}>
                  {displayCurrency} {kpis.mrr.reduce((sum, m) => {
                    const rate = m.currency === displayCurrency ? 1 : (manualRates[m.currency] ?? 1);
                    return sum + m.amount * rate;
                  }, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            )}

            <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden", background: TOKENS.surface }}>
              <div
                className="grid px-4 py-2.5"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 0.8fr 0.8fr 1fr", gap: 12, background: "#F4F1E8", borderBottom: `1px solid ${TOKENS.border}` }}
              >
                {["Company", "Status", "Plan", "Users", "Leads", "Joined"].map((h) => (
                  <div key={h} style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: TOKENS.textFaint }}>{h}</div>
                ))}
              </div>

              {loading ? (
                <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13 }}>Loading…</div>
              ) : tenants.length === 0 ? (
                <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13, textAlign: "center" }}>No companies yet.</div>
              ) : (
                tenants.map((t, i) => {
                  const meta = STATUS_META[t.subscription_status] ?? STATUS_META.none;
                  return (
                    <div
                      key={t.id}
                      className="grid items-center px-4"
                      style={{
                        gridTemplateColumns: "2fr 1fr 1fr 0.8fr 0.8fr 1fr", gap: 12, padding: "10px 16px",
                        background: i % 2 === 0 ? TOKENS.surface : "#F4F1E8",
                        borderBottom: i < tenants.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 size={14} color={TOKENS.textFaint} />
                        <span style={{ fontSize: 13.5 }}>{t.name}</span>
                      </div>
                      <div>
                        <span style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 999,
                          background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}55`,
                        }}>
                          {meta.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: TOKENS.textMuted }}>
                        {t.plan_name ?? t.plan ?? "—"}
                        {t.plan_currency && <span style={{ color: TOKENS.textFaint }}> · {t.plan_currency}</span>}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{t.user_count}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{t.lead_count}</div>
                      <div style={{ fontSize: 12.5, color: TOKENS.textMuted }}>
                        {new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
