import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { captureAdTracking } from "./adTracking";

const TOKENS = {
  bg: "#0E141C", surface: "#161E29", surfaceRaised: "#1C2733",
  border: "#2A3644", textPrimary: "#E7ECF2", textMuted: "#8B98AC", textFaint: "#5C6879", gold: "#C9A227",
};

export default function WebinarSignupPage() {
  const [webinar, setWebinar] = useState(null);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | not_found
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", country_text: "" });
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  const params = new URLSearchParams(window.location.search);
  const webinarId = params.get("id");

  useEffect(() => {
    if (!webinarId) {
      setLoadState("not_found");
      return;
    }
    supabase
      .from("webinars")
      .select("*")
      .eq("id", webinarId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setLoadState("not_found");
        else {
          setWebinar(data);
          setLoadState("ready");
        }
      });
  }, [webinarId]);

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
      const { error } = await supabase.functions.invoke("register-webinar", {
        body: { ...form, webinar_id: webinarId, ad_tracking: captureAdTracking() },
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

  const wrapperStyle = {
    minHeight: "100vh", background: TOKENS.bg, display: "flex", alignItems: "center",
    justifyContent: "center", fontFamily: "sans-serif", padding: 20,
  };

  if (loadState === "loading") {
    return <div style={wrapperStyle} />;
  }

  if (loadState === "not_found") {
    return (
      <div style={wrapperStyle}>
        <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 32, width: 420, maxWidth: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 16, color: TOKENS.textMuted }}>This event couldn't be found.</div>
        </div>
      </div>
    );
  }

  const eventDate = new Date(webinar.scheduled_at).toLocaleString("en-GB", {
    weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div style={wrapperStyle}>
      <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 32, width: 460, maxWidth: "100%" }}>
        <div style={{ fontSize: 21, color: TOKENS.textPrimary, marginBottom: 6 }}>{webinar.title}</div>
        <div style={{ fontSize: 13, color: TOKENS.gold, marginBottom: 10 }}>{eventDate}</div>
        {webinar.description && (
          <p style={{ fontSize: 13, color: TOKENS.textMuted, lineHeight: 1.5, marginBottom: 22 }}>{webinar.description}</p>
        )}

        {status === "sent" ? (
          <div style={{ fontSize: 13.5, color: TOKENS.textPrimary, lineHeight: 1.6 }}>
            You're registered — check your inbox for the confirmation and joining details.
          </div>
        ) : webinar.status !== "upcoming" ? (
          <div style={{ fontSize: 13.5, color: TOKENS.textFaint }}>
            Registration for this event is no longer open.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input required placeholder="Full name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} style={inputStyle} />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} style={inputStyle} />
            <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
            <input placeholder="Country" value={form.country_text} onChange={(e) => set("country_text", e.target.value)} style={inputStyle} />

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: TOKENS.textMuted, marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} style={{ marginTop: 2 }} />
              <span>I'm happy to be contacted about this event, and understand my details will be handled in accordance with applicable data protection law.</span>
            </label>

            {(status === "error" || errorMsg) && (
              <div style={{ color: "#BD5A47", fontSize: 12.5, marginBottom: 12 }}>{errorMsg}</div>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              style={{ width: "100%", background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "11px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
            >
              {status === "sending" ? "Registering…" : "Register"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
