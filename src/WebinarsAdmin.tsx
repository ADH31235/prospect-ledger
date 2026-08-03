import React, { useCallback, useEffect, useState } from "react";
import { Plus, Users, ExternalLink, Copy } from "lucide-react";
import { supabase } from "./supabaseClient";

const TOKENS = {
  bg: "#0E141C", surface: "#161E29", surfaceRaised: "#1C2733",
  border: "#2A3644", borderFaint: "#212B37", textPrimary: "#E7ECF2",
  textMuted: "#8B98AC", textFaint: "#5C6879", gold: "#C9A227", riskLow: "#4C9E76", riskBlocked: "#BD5A47",
};

const STATUS_META = {
  upcoming: { label: "Upcoming", color: TOKENS.riskLow },
  completed: { label: "Completed", color: TOKENS.textMuted },
  cancelled: { label: "Cancelled", color: TOKENS.riskBlocked },
};

export default function WebinarsAdmin() {
  const [webinars, setWebinars] = useState([]);
  const [registrationCounts, setRegistrationCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", scheduled_at: "", location_or_link: "" });
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: webinarData } = await supabase
      .from("webinars")
      .select("*")
      .order("scheduled_at", { ascending: false });
    setWebinars(webinarData ?? []);

    const { data: regData } = await supabase
      .from("webinar_registrations")
      .select("webinar_id");
    const counts = {};
    for (const r of regData ?? []) counts[r.webinar_id] = (counts[r.webinar_id] ?? 0) + 1;
    setRegistrationCounts(counts);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_at) return;
    await supabase.from("webinars").insert({
      title: form.title,
      description: form.description || null,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      location_or_link: form.location_or_link || null,
    });
    setForm({ title: "", description: "", scheduled_at: "", location_or_link: "" });
    setShowCreate(false);
    await load();
  }

  async function updateStatus(id, status) {
    await supabase.from("webinars").update({ status }).eq("id", id);
    await load();
  }

  function signupLink(id) {
    return `${window.location.origin}/webinar?id=${id}`;
  }

  function copyLink(id) {
    navigator.clipboard.writeText(signupLink(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const inputStyle = {
    width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
    padding: "8px 10px", fontSize: 13, color: TOKENS.textPrimary,
  };
  const labelStyle = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 5, display: "block" };

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-baseline justify-between border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <div>
            <h1 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28 }}>
              Webinars
            </h1>
            <p style={{ color: TOKENS.textMuted, fontSize: 13, marginTop: 2 }}>
              Create an event, share the link, registrations become real leads automatically.
            </p>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Create event
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <div className="mb-3">
              <label style={labelStyle}>Title *</label>
              <input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Navigating a Liquidity Event: What Comes Next" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label style={labelStyle}>Date & time *</label>
                <input type="datetime-local" style={inputStyle} value={form.scheduled_at} onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Zoom link / location</label>
                <input style={inputStyle} value={form.location_or_link} onChange={(e) => setForm((f) => ({ ...f, location_or_link: e.target.value }))} placeholder="https://zoom.us/..." />
              </div>
            </div>
            <div className="mb-3">
              <label style={labelStyle}>Description</label>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <button type="submit" style={{ background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Save event
            </button>
          </form>
        )}

        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13 }}>Loading…</div>
          ) : webinars.length === 0 ? (
            <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13, textAlign: "center" }}>
              No events yet — click "Create event" to set one up.
            </div>
          ) : (
            webinars.map((w, i) => {
              const meta = STATUS_META[w.status] ?? { label: w.status, color: TOKENS.textFaint };
              return (
                <div key={w.id} className="px-4 py-3" style={{
                  background: i % 2 === 0 ? TOKENS.surface : "transparent",
                  borderBottom: i < webinars.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div style={{ fontSize: 14 }}>{w.title}</div>
                      <div style={{ fontSize: 11.5, color: TOKENS.textFaint, marginTop: 2 }}>
                        {new Date(w.scheduled_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1" style={{ fontSize: 12.5, color: TOKENS.textMuted }}>
                        <Users size={12} /> {registrationCounts[w.id] ?? 0}
                      </div>
                      <select
                        value={w.status}
                        onChange={(e) => updateStatus(w.id, e.target.value)}
                        style={{ background: TOKENS.surfaceRaised, border: `1px solid ${meta.color}55`, color: meta.color, borderRadius: 6, fontSize: 11.5, padding: "3px 8px" }}
                      >
                        {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code style={{ fontSize: 11, color: TOKENS.textFaint, background: TOKENS.surfaceRaised, padding: "3px 8px", borderRadius: 4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {signupLink(w.id)}
                    </code>
                    <button onClick={() => copyLink(w.id)} title="Copy signup link" style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.textMuted, display: "flex" }}>
                      <Copy size={13} />
                    </button>
                    <a href={signupLink(w.id)} target="_blank" rel="noopener noreferrer" title="Open signup page" style={{ color: TOKENS.textMuted, display: "flex" }}>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                  {copiedId === w.id && <div style={{ fontSize: 11, color: TOKENS.riskLow, marginTop: 4 }}>Copied</div>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
