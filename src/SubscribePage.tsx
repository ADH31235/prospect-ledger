import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";


export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Optional: pre-fill from a URL param if this link came from a
  // cold-outreach email, e.g. /subscribe?lead_id=xxx
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get("lead_id");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("subscribe", {
        body: { email, full_name: fullName, lead_id: leadId, source: leadId ? "cold_outreach_cta" : "website" },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message ?? "Something went wrong — please try again.");
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: TOKENS.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "sans-serif", padding: 20,
    }}>
      <div style={{
        background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
        padding: 32, width: 380, maxWidth: "100%",
      }}>
        <div style={{ fontSize: 20, color: TOKENS.textPrimary, marginBottom: 6 }}>
          Market commentary
        </div>
        <p style={{ fontSize: 13, color: TOKENS.textMuted, lineHeight: 1.5, marginBottom: 22 }}>
          Occasional notes on markets and wealth planning. No spam, unsubscribe anytime, and you'll get one confirmation email before anything else is sent.
        </p>

        {status === "sent" ? (
          <div style={{ fontSize: 13.5, color: TOKENS.textPrimary, lineHeight: 1.6 }}>
            Almost there — check your inbox for a confirmation link. You won't receive anything further until you click it.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="text" placeholder="Name (optional)" value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={{
                width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`,
                borderRadius: 6, padding: "9px 10px", color: TOKENS.textPrimary, fontSize: 13, marginBottom: 10,
              }}
            />
            <input
              type="email" required placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`,
                borderRadius: 6, padding: "9px 10px", color: TOKENS.textPrimary, fontSize: 13, marginBottom: 14,
              }}
            />
            {status === "error" && (
              <div style={{ color: "#BD5A47", fontSize: 12.5, marginBottom: 12 }}>{errorMsg}</div>
            )}
            <button
              type="submit" disabled={status === "sending"}
              style={{
                width: "100%", background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6,
                padding: "10px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              {status === "sending" ? "Sending…" : "Subscribe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
