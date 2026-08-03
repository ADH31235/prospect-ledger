import React, { useEffect, useState } from "react";

const TOKENS = {
  bg: "#0E141C", surface: "#161E29", border: "#2A3644",
  textPrimary: "#E7ECF2", textMuted: "#8B98AC", riskLow: "#4C9E76", riskBlocked: "#BD5A47",
};

export default function NewsletterActionPage() {
  const [state, setState] = useState<"loading" | "confirmed" | "unsubscribed" | "error">("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const token = params.get("token");

    if (!type || !token) {
      setState("error");
      return;
    }

    // Edge Functions called with query params need a direct fetch —
    // supabase.functions.invoke() always POSTs a JSON body, which
    // doesn't fit a simple GET-with-query-string confirmation link.
    const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-action`;
    fetch(`${functionsUrl}?type=${type}&token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.result === "confirmed") setState("confirmed");
        else if (data.ok && data.result === "unsubscribed") setState("unsubscribed");
        else setState("error");
      })
      .catch(() => setState("error"));
  }, []);

  const messages: Record<string, { title: string; body: string; color: string }> = {
    loading: { title: "One moment…", body: "", color: TOKENS.textMuted },
    confirmed: { title: "You're confirmed", body: "You'll now receive occasional market commentary. You can unsubscribe anytime via the link in any email.", color: TOKENS.riskLow },
    unsubscribed: { title: "Unsubscribed", body: "You won't receive any further emails from this list.", color: TOKENS.riskLow },
    error: { title: "Something went wrong", body: "This link may have expired or already been used.", color: TOKENS.riskBlocked },
  };
  const m = messages[state];

  return (
    <div style={{
      minHeight: "100vh", background: TOKENS.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "sans-serif", padding: 20,
    }}>
      <div style={{
        background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
        padding: 32, width: 380, maxWidth: "100%", textAlign: "center",
      }}>
        <div style={{ fontSize: 18, color: m.color, marginBottom: 8 }}>{m.title}</div>
        <p style={{ fontSize: 13, color: TOKENS.textMuted, lineHeight: 1.5 }}>{m.body}</p>
      </div>
    </div>
  );
}
