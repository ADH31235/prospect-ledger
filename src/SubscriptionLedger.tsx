import React, { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";

const STAGES = [
  { key: "new", label: "New", color: TOKENS.textFaint },
  { key: "contacted", label: "Contacted", color: "#4C8FDB" },
  { key: "demo_scheduled", label: "Demo scheduled", color: "#8B7FD9" },
  { key: "trial", label: "Trial", color: TOKENS.riskReview },
  { key: "negotiating", label: "Negotiating", color: TOKENS.riskReview },
  { key: "won", label: "Won", color: TOKENS.riskLow },
  { key: "lost", label: "Lost", color: TOKENS.riskBlocked },
];
const stageInfo = (key) => STAGES.find((s) => s.key === key) ?? STAGES[0];

const inputStyle = {
  background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
  padding: "8px 10px", fontSize: 13, color: TOKENS.textPrimary, width: "100%",
};
const labelStyle = { fontSize: 11, color: TOKENS.textFaint, display: "block", marginBottom: 4 };

const emptyForm = { company_name: "", contact_name: "", email: "", phone: "", stage: "new", interested_tier: "", source: "", notes: "" };

export default function SubscriptionLedger() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.from("subscription_prospects").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    setProspects(data ?? []);
    setLoading(false);
  }

  function startAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(p) {
    setForm({
      company_name: p.company_name || "", contact_name: p.contact_name || "", email: p.email || "",
      phone: p.phone || "", stage: p.stage || "new", interested_tier: p.interested_tier || "",
      source: p.source || "", notes: p.notes || "",
    });
    setEditingId(p.id);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.company_name.trim()) {
      alert("Company name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updated_at: new Date().toISOString() };
      if (editingId) {
        const { error } = await supabase.from("subscription_prospects").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscription_prospects").insert(payload);
        if (error) throw error;
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      alert(`Couldn't save: ${err?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleStageChange(id, stage) {
    const { error } = await supabase.from("subscription_prospects").update({ stage, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      alert(`Couldn't update stage: ${error.message}`);
      return;
    }
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, stage } : p)));
  }

  async function handleDelete(p) {
    if (!window.confirm(`Delete ${p.company_name} from the subscription pipeline? This can't be undone.`)) return;
    const { error } = await supabase.from("subscription_prospects").delete().eq("id", p.id);
    if (error) {
      alert(`Couldn't delete: ${error.message}`);
      return;
    }
    await load();
  }

  const counts = STAGES.reduce((acc, s) => ({ ...acc, [s.key]: prospects.filter((p) => p.stage === s.key).length }), {});

  return (
    <div>
      <div className="grid grid-cols-4 gap-px mb-6" style={{ background: TOKENS.border }}>
        {[
          { label: "Total prospects", value: prospects.length },
          { label: "In trial", value: counts.trial ?? 0 },
          { label: "Negotiating", value: counts.negotiating ?? 0 },
          { label: "Won", value: counts.won ?? 0 },
        ].map((s) => (
          <div key={s.label} style={{ background: TOKENS.surface, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-end mb-3">
        <button
          onClick={startAdd}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: TOKENS.ivory, color: TOKENS.bg, border: "none", borderRadius: 6,
            padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={14} /> Add prospect
        </button>
      </div>

      {error && <div style={{ color: TOKENS.riskBlocked, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden", background: TOKENS.surface }}>
        <div
          className="grid px-4 py-2.5"
          style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 0.9fr 0.8fr", gap: 12, background: "#F4F1E8", borderBottom: `1px solid ${TOKENS.border}` }}
        >
          {["Company", "Contact", "Stage", "Interested in", "Source", ""].map((h) => (
            <div key={h} style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: TOKENS.textFaint }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13 }}>Loading…</div>
        ) : prospects.length === 0 ? (
          <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13, textAlign: "center" }}>
            No subscription prospects logged yet.
          </div>
        ) : (
          prospects.map((p, i) => {
            const info = stageInfo(p.stage);
            return (
              <div
                key={p.id}
                className="grid items-center px-4"
                style={{
                  gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 0.9fr 0.8fr", gap: 12, padding: "10px 16px",
                  background: i % 2 === 0 ? TOKENS.surface : "#F4F1E8",
                  borderBottom: i < prospects.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5 }}>{p.company_name}</div>
                  {p.email && <div style={{ fontSize: 11.5, color: TOKENS.textFaint }}>{p.email}</div>}
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted }}>
                  {p.contact_name || "—"}
                  {p.phone && <div style={{ fontSize: 11.5, color: TOKENS.textFaint }}>{p.phone}</div>}
                </div>
                <div>
                  <select
                    value={p.stage}
                    onChange={(e) => handleStageChange(p.id, e.target.value)}
                    style={{
                      fontSize: 11.5, padding: "3px 8px", borderRadius: 999, border: `1px solid ${info.color}55`,
                      background: `${info.color}18`, color: info.color, cursor: "pointer",
                    }}
                  >
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, textTransform: "capitalize" }}>{p.interested_tier || "—"}</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted }}>{p.source || "—"}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(p)} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.textMuted, display: "flex" }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(p)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.riskBlocked, display: "flex" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {formOpen && (
        <div
          onClick={() => setFormOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(6,9,13,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 440, maxWidth: "90vw", background: TOKENS.surface, borderRadius: 10, padding: 24, maxHeight: "85vh", overflow: "auto" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: 16, fontWeight: 700 }}>{editingId ? "Edit prospect" : "Add subscription prospect"}</div>
              <button onClick={() => setFormOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.textFaint, display: "flex" }}>
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label style={labelStyle}>Company name *</label>
                <input style={inputStyle} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Contact name</label>
                <input style={inputStyle} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Stage</label>
                <select style={inputStyle} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Interested in</label>
                <select style={inputStyle} value={form.interested_tier} onChange={(e) => setForm({ ...form, interested_tier: e.target.value })}>
                  <option value="">—</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Source</label>
                <input style={inputStyle} placeholder="e.g. referral, LinkedIn, inbound" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setFormOpen(false)} style={{ flex: 1, background: "none", border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "9px 0", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1, background: TOKENS.ivory, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Add prospect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
