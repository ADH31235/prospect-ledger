import React, { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    } catch (err) {
      setError(err?.message ?? "Couldn't load — you may not have access to this page.");
    } finally {
      setLoading(false);
    }
  }

  const activeCount = tenants.filter((t) => t.subscription_status === "active" || t.subscription_status === "trialing").length;
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
            <div className="grid grid-cols-3 gap-px mb-6" style={{ background: TOKENS.border }}>
              {[
                { label: "Companies", value: tenants.length },
                { label: "Active subscriptions", value: activeCount },
                { label: "Total leads across all", value: totalLeads },
              ].map((s) => (
                <div key={s.label} style={{ background: TOKENS.surface, padding: "16px 18px" }}>
                  <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    {s.label}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22 }}>{s.value}</div>
                </div>
              ))}
            </div>

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
                      <div style={{ fontSize: 12.5, color: TOKENS.textMuted }}>{t.plan ?? "—"}</div>
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
