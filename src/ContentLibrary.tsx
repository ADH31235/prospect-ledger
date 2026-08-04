import React, { useCallback, useEffect, useState } from "react";
import { Plus, Copy, ExternalLink, Users, Pencil } from "lucide-react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";


const TYPE_LABELS = {
  linkedin_post: "LinkedIn post",
  webinar_announcement: "Webinar announcement",
  newsletter_issue: "Newsletter issue",
  ad: "Paid ad",
  other: "Other",
};

const DESTINATIONS = [
  { key: "inquire", label: "Inquire page", path: "/inquire" },
  { key: "subscribe", label: "Newsletter signup", path: "/subscribe" },
  { key: "webinar", label: "Webinar signup", path: "/webinar" },
];

function slugify(title) {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "content"}-${suffix}`;
}

export default function ContentLibrary() {
  const [pieces, setPieces] = useState([]);
  const [leadCounts, setLeadCounts] = useState({});
  const [webinars, setWebinars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: "", content_type: "linkedin_post", body_preview: "", published_at: "" });
  const [linkBuilderFor, setLinkBuilderFor] = useState(null);
  const [destination, setDestination] = useState("inquire");
  const [webinarId, setWebinarId] = useState("");
  const [utmSource, setUtmSource] = useState("linkedin");
  const [copiedSlug, setCopiedSlug] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: pieceData } = await supabase
      .from("content_pieces")
      .select("*")
      .order("created_at", { ascending: false });
    setPieces(pieceData ?? []);

    const { data: webinarData } = await supabase
      .from("webinars")
      .select("id, title")
      .order("scheduled_at", { ascending: false });
    setWebinars(webinarData ?? []);

    // Pull every lead's ad_tracking and count matches per slug
    // client-side — simpler and plenty fast at this data volume
    // than a JSONB filter per content piece.
    const { data: leadsData } = await supabase.from("leads").select("ad_tracking");
    const counts = {};
    for (const lead of leadsData ?? []) {
      const contentSlug = lead.ad_tracking?.utm_content;
      if (contentSlug) counts[contentSlug] = (counts[contentSlug] ?? 0) + 1;
    }
    setLeadCounts(counts);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(piece) {
    setForm({
      title: piece.title,
      content_type: piece.content_type,
      body_preview: piece.body_preview || "",
      published_at: piece.published_at || "",
    });
    setEditingId(piece.id);
    setShowCreate(true);
  }

  function startCreate() {
    setForm({ title: "", content_type: "linkedin_post", body_preview: "", published_at: "" });
    setEditingId(null);
    setShowCreate((v) => !v);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (editingId) {
      // Editing keeps the existing slug — the tracking link
      // already posted publicly stays valid, it just now points
      // to updated title/notes in the library.
      await supabase.from("content_pieces").update({
        title: form.title,
        content_type: form.content_type,
        body_preview: form.body_preview || null,
        published_at: form.published_at || null,
      }).eq("id", editingId);
    } else {
      await supabase.from("content_pieces").insert({
        title: form.title,
        content_type: form.content_type,
        body_preview: form.body_preview || null,
        published_at: form.published_at || null,
        slug: slugify(form.title),
      });
    }
    setForm({ title: "", content_type: "linkedin_post", body_preview: "", published_at: "" });
    setEditingId(null);
    setShowCreate(false);
    await load();
  }

  function buildLink(slug) {
    const dest = DESTINATIONS.find((d) => d.key === destination);
    let url = `${window.location.origin}${dest.path}`;
    const params = new URLSearchParams({ utm_source: utmSource, utm_medium: "organic", utm_content: slug });
    if (destination === "webinar" && webinarId) params.set("id", webinarId);
    return `${url}?${params.toString()}`;
  }

  function copyLink(slug) {
    navigator.clipboard.writeText(buildLink(slug));
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1500);
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
            <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 28, color: TOKENS.ivory }}>
              Content Library
            </h1>
            <p style={{ color: TOKENS.ivoryMuted, fontSize: 13, marginTop: 2 }}>
              Log a post, get a tracking link, see how many leads it actually produced.
            </p>
          </div>
          <button
            onClick={startCreate}
            style={{ display: "flex", alignItems: "center", gap: 6, background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Log content
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleSave} style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <div className="mb-3">
              <label style={labelStyle}>Title *</label>
              <input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Liquidity event post — Aug week 1" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label style={labelStyle}>Type</label>
                <select style={inputStyle} value={form.content_type} onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value }))}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Published date</label>
                <input type="date" style={inputStyle} value={form.published_at} onChange={(e) => setForm((f) => ({ ...f, published_at: e.target.value }))} />
              </div>
            </div>
            <div className="mb-3">
              <label style={labelStyle}>Body / notes (optional)</label>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={form.body_preview} onChange={(e) => setForm((f) => ({ ...f, body_preview: e.target.value }))} placeholder="Paste the post text here for reference" />
            </div>
            <button type="submit" style={{ background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {editingId ? "Update" : "Save"}
            </button>
          </form>
        )}

        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13 }}>Loading…</div>
          ) : pieces.length === 0 ? (
            <div style={{ padding: 24, color: TOKENS.textFaint, fontSize: 13, textAlign: "center" }}>
              Nothing logged yet — click "Log content" to add your first post.
            </div>
          ) : (
            pieces.map((p, i) => (
              <div key={p.id} className="px-4 py-3" style={{
                background: i % 2 === 0 ? TOKENS.surface : "transparent",
                borderBottom: i < pieces.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
              }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div style={{ fontSize: 14 }}>{p.title}</div>
                    <div style={{ fontSize: 11.5, color: TOKENS.textFaint, marginTop: 2 }}>
                      {TYPE_LABELS[p.content_type]} {p.published_at ? `· ${p.published_at}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1" style={{ fontSize: 12.5, color: TOKENS.textMuted }}>
                      <Users size={12} /> {leadCounts[p.slug] ?? 0} leads
                    </div>
                    <button onClick={() => startEdit(p)} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.textMuted, display: "flex" }}>
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>

                {p.body_preview && (
                  <div style={{
                    fontSize: 12.5, color: TOKENS.textMuted, lineHeight: 1.5, whiteSpace: "pre-wrap",
                    background: TOKENS.surfaceRaised, borderRadius: 6, padding: "8px 10px", marginBottom: 8,
                  }}>
                    {p.body_preview}
                  </div>
                )}

                {linkBuilderFor === p.id ? (
                  <div style={{ background: TOKENS.surfaceRaised, borderRadius: 6, padding: 10, marginTop: 8 }}>
                    <div className="flex gap-2 mb-2">
                      <select value={destination} onChange={(e) => setDestination(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                        {DESTINATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                      </select>
                      {destination === "webinar" && (
                        <select value={webinarId} onChange={(e) => setWebinarId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                          <option value="">Select event…</option>
                          {webinars.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                        </select>
                      )}
                      <select value={utmSource} onChange={(e) => setUtmSource(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                        <option value="linkedin">LinkedIn</option>
                        <option value="instagram">Instagram</option>
                        <option value="email">Email</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <code style={{ fontSize: 11, color: TOKENS.textFaint, background: TOKENS.bg, padding: "3px 8px", borderRadius: 4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {buildLink(p.slug)}
                      </code>
                      <button onClick={() => copyLink(p.slug)} title="Copy link" style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.textMuted, display: "flex" }}>
                        <Copy size={13} />
                      </button>
                      <a href={buildLink(p.slug)} target="_blank" rel="noopener noreferrer" style={{ color: TOKENS.textMuted, display: "flex" }}>
                        <ExternalLink size={13} />
                      </a>
                    </div>
                    {copiedSlug === p.slug && <div style={{ fontSize: 11, color: "#4C9E76", marginTop: 4 }}>Copied</div>}
                  </div>
                ) : (
                  <button
                    onClick={() => { setLinkBuilderFor(p.id); setDestination("inquire"); setWebinarId(""); setUtmSource("linkedin"); }}
                    style={{ fontSize: 12, color: TOKENS.gold, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Get tracking link →
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
