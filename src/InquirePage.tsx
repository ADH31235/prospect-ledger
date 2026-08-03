import React, { useState } from "react";
import { supabase } from "./supabaseClient";

const TOKENS = {
  bg: "#0E141C", surface: "#161E29", surfaceRaised: "#1C2733",
  border: "#2A3644", textPrimary: "#E7ECF2", textMuted: "#8B98AC", textFaint: "#5C6879", gold: "#C9A227",
};

// Kept deliberately generic — no performance claims, no promised
// returns, nothing promissory. Edit this copy, but keep it in
// mind: once real ad traffic points here, this text is a
// financial promotion and deserves the same compliance review
// as any outreach template before it goes live with real spend.
export default function InquirePage() {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", country_text: "", interest_note: "" });
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source");

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!consented) {
      setErrorMsg("Please confirm you're happy to be contacted before submitting.");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    try {
      const { error } = await supabase.functions.invoke("capture-inquiry", {
        body: { ...form, source: utmSource ? `inbound_ad:${utmSource}` : "inbound_ad" },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message ?? "Something went wrong — please try again.");
    }
  }

  const inputStyle = {
    width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`,
    borderRadius: 6, padding: "10px 12px", color: TOKENS.textPrimary, fontSize: 13.5, marginBottom: 12,
  };

  return (
    <div style={{
      minHeight: "100vh", background: TOKENS.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "sans-serif", padding: 20,
    }}>
      <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 32, width: 440, maxWidth: "100%" }}>
        <div style={{ fontSize: 21, color: TOKENS.textPrimary, marginBottom: 8 }}>
          Get in touch
        </div>
        <p style={{ fontSize: 13, color: TOKENS.textMuted, lineHeight: 1.5, marginBottom: 22 }}>
          Leave your details and I'll reach out to arrange a conversation. No obligation, no cost for an initial discussion.
        </p>

        {status === "sent" ? (
          <div style={{ fontSize: 13.5, color: TOKENS.textPrimary, lineHeight: 1.6 }}>
            Thank you — I've received your details and will be in touch shortly.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input required placeholder="Full name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} style={inputStyle} />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} style={inputStyle} />
            <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
            <input placeholder="Country" value={form.country_text} onChange={(e) => set("country_text", e.target.value)} style={inputStyle} />
            <textarea
              placeholder="What would you like to discuss? (optional)"
              rows={3}
              value={form.interest_note}
              onChange={(e) => set("interest_note", e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
            />

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: TOKENS.textMuted, marginBottom: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>I'm happy to be contacted about this inquiry, and understand my details will be handled in accordance with applicable data protection law.</span>
            </label>

            {(status === "error" || errorMsg) && (
              <div style={{ color: "#BD5A47", fontSize: 12.5, marginBottom: 12 }}>{errorMsg}</div>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              style={{ width: "100%", background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "11px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
            >
              {status === "sending" ? "Sending…" : "Submit"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
