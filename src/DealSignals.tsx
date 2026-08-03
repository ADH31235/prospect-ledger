import React, { useCallback, useEffect, useState } from "react";
import { Plus, ArrowRight, ExternalLink } from "lucide-react";
import { supabase } from "./supabaseClient";

const TOKENS = {
  bg: "#0E141C", surface: "#161E29", surfaceRaised: "#1C2733",
  border: "#2A3644", borderFaint: "#212B37", textPrimary: "#E7ECF2",
  textMuted: "#8B98AC", textFaint: "#5C6879", gold: "#C9A227", riskLow: "#4C9E76",
};

const EVENT_LABELS: Record<string, string> = {
  exit: "Exit", funding_round: "Funding round", ipo: "IPO", acquisition: "Acquisition", other: "Other",
};

export default function DealSignals({ jurisdictions, onAddLead }: { jurisdictions: Record<string, any>; onAddLead: (data: any) => Promise<any> }) {
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  const [form, setForm] = useState({
    company_name: "", event_type: "exit", event_date: "", source_url: "", source_name: "", jurisdiction_id: "", notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("deal_signals")
      .select("*")
      .order("created_at", { ascending: false });
    setSignals(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) return;
    await supabase.from("deal_signals").insert({
      company_name: form.company_name,
      event_type: form.event_type,
      event_date: form.event_date || null,
      source_url: form.source_url || null,
      source_name: form.source_name || null,
      jurisdiction_id: form.jurisdiction_id || null,
      notes: form.notes || null,
    });
    setForm({ company_name: "", event_type: "exit", event_date: "", source_url: "", source_name: "", jurisdiction_id: "", notes: "" });
    setShowAdd(false);
    await load();
  }

  async function handleConvert(signal: any) {
    const name = window.prompt(`Who's the person at ${signal.company_name}? (e.g. their name from LinkedIn)`);
    if (!name || !name.trim()) return;
    setConverting(signal.id);
    try {
      const lead = await onAddLead({
        full_name: name.trim(),
        company: signal.company_name,
        jurisdiction_id: signal.jurisdiction_id,
        liquidity_event: signal.event_type === "other" ? "none" : signal.event_type,
        liquidity_event_date: signal.event_date,
        net_worth_signal: "exited_founder",
        source: "deal_signal",
        notes: `Sourced from ${signal.source_name || "deal signal"}${signal.source_url ? " — " + signal.source_url : ""}`,
      });
      await supabase.from("deal_signals").update({ converted_to_lead_id: lead.id }).eq("id", signal.id);
      await load();
    } finally {
      setConverting(null);
    }
  }

  const inputStyle = {
    width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
    padding: "8px 10px", fontSize: 13, color: TOKENS.textPrimary,
  };
  const labelStyle = { fontSize: 10.5, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 5, display: "block" };

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-baseline justify-between border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <div>
            <h1 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28 }}>
              Deal Signals
            </h1>
            <p style={{ color: TOKENS.textMuted, fontSize: 13, marginTop: 2 }}>
              Companies with a spotted liquidity event — log first, identify the person, convert when ready.
            </p>
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Log signal
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label style={labelStyle}>Company name *</label>
                <input style={inputStyle} value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Event type</label>
                <select style={inputStyle} value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}>
                  {Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Event date</label>
                <input type="date" style={inputStyle} value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Jurisdiction</label>
                <select style={inputStyle} value={form.jurisdiction_id} onChange={(e) => setForm((f) => ({ ...f, jurisdiction_id: e.target.value }))}>
                  <option value="">Unknown</option>
                  {Object.entries(jurisdictions || {}).sort((a: any, b: any) => a[1].country.localeCompare(b[1].country)).map(([id, j]: any) => (
                    <option key={id} value={id}>{j.country}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Source name</label>
                <input style={inputStyle} placeholder="Crunchbase, TechCrunch, Google Alert…" value={form.source_name} onChange={(e) => setForm((f) => ({ ...f, source_name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Source URL</label>
                <input style={inputStyle} value={form.source_url} onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <button type="submit" style={{ background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Save signal
            </button>
          </form>
        )}

        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13 }}>Loading…</div>
          ) : signals.length === 0 ? (
            <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13, textAlign: "center" }}>
              Nothing logged yet. Add a signal from Crunchbase, a press release, or a Google Alert.
            </div>
          ) : (
            signals.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3" style={{
                background: i % 2 === 0 ? TOKENS.surface : "transparent",
                borderBottom: i < signals.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
              }}>
                <div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14 }}>{s.company_name}</span>
                    <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: TOKENS.surfaceRaised, color: TOKENS.textMuted }}>
                      {EVENT_LABELS[s.event_type]}
                    </span>
                    {s.source_url && (
                      <a href={s.source_url} target="_blank" rel="noopener noreferrer" style={{ color: TOKENS.textFaint }}>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: TOKENS.textFaint, marginTop: 2 }}>
                    {s.source_name || "—"} {s.event_date ? `· ${s.event_date}` : ""}
                  </div>
                </div>
                {s.converted_to_lead_id ? (
                  <span style={{ fontSize: 12, color: TOKENS.riskLow }}>Converted</span>
                ) : (
                  <button
                    onClick={() => handleConvert(s)}
                    disabled={converting === s.id}
                    className="flex items-center gap-1"
                    style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 6, cursor: "pointer", background: TOKENS.surfaceRaised, color: TOKENS.textPrimary, border: `1px solid ${TOKENS.border}` }}
                  >
                    {converting === s.id ? "Converting…" : <>Convert to lead <ArrowRight size={12} /></>}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
