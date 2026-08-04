import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import { captureAdTracking } from "./adTracking";
import { TOKENS } from "./theme";


const SITUATION_OPTIONS = [
  { value: "liquidity_event", label: "A recent liquidity event", sub: "Exit, inheritance, sale, retirement" },
  { value: "review_existing", label: "Reviewing my existing investments", sub: "Second opinion on what I already have" },
  { value: "general_planning", label: "General wealth planning", sub: "Getting organised for the future" },
  { value: "exploring", label: "Just exploring", sub: "Not sure yet, curious to learn more" },
];

const TIMELINE_OPTIONS = [
  { value: "now", label: "Ready to talk now" },
  { value: "months", label: "In the next few months" },
  { value: "researching", label: "Just researching for later" },
];

export default function InquirePage() {
  const [step, setStep] = useState(0); // 0: situation, 1: timeline, 2: details, 3: done
  const [situation, setSituation] = useState("");
  const [timeline, setTimeline] = useState("");
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", country_text: "", interest_note: "" });
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | sending | error
  const [errorMsg, setErrorMsg] = useState("");

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
      const adTracking = captureAdTracking();
      const situationLabel = SITUATION_OPTIONS.find((o) => o.value === situation)?.label;
      const timelineLabel = TIMELINE_OPTIONS.find((o) => o.value === timeline)?.label;
      const combinedNote = [
        situationLabel ? `Situation: ${situationLabel}` : "",
        timelineLabel ? `Timeline: ${timelineLabel}` : "",
        form.interest_note ? `Message: ${form.interest_note}` : "",
      ].filter(Boolean).join(" — ");

      // ?t=<tenant-slug> identifies which company this page belongs
      // to — omitted, it falls back to the original default tenant,
      // so any links already shared without it keep working.
      const tenantSlug = new URLSearchParams(window.location.search).get("t");

      const { error } = await supabase.functions.invoke("capture-inquiry", {
        body: {
          ...form,
          interest_note: combinedNote,
          source: adTracking.utm_source ? `inbound_ad:${adTracking.utm_source}` : "inbound_ad",
          ad_tracking: Object.keys(adTracking).length ? adTracking : null,
          tenant_slug: tenantSlug,
        },
      });
      if (error) throw error;
      setStep(3);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message ?? "Something went wrong — please try again.");
    }
  }

  const optionStyle = (active) => ({
    display: "block", width: "100%", textAlign: "left",
    background: active ? `${TOKENS.gold}18` : TOKENS.surfaceRaised,
    border: `1px solid ${active ? TOKENS.gold : TOKENS.border}`,
    borderRadius: 8, padding: "13px 16px", marginBottom: 10, cursor: "pointer",
    color: TOKENS.textPrimary, fontSize: 14,
  });

  const inputStyle = {
    width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`,
    borderRadius: 6, padding: "10px 12px", color: TOKENS.textPrimary, fontSize: 13.5, marginBottom: 12,
  };

  const progressPct = step === 3 ? 100 : ((step + 1) / 3) * 100;

  return (
    <div style={{
      minHeight: "100vh", background: TOKENS.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "sans-serif", padding: 20,
    }}>
      <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 32, width: 460, maxWidth: "100%" }}>

        {step < 3 && (
          <div style={{ height: 4, background: TOKENS.surfaceRaised, borderRadius: 2, marginBottom: 24, overflow: "hidden" }}>
            <div style={{ width: `${progressPct}%`, height: "100%", background: TOKENS.gold, transition: "width 0.3s" }} />
          </div>
        )}

        {step === 0 && (
          <div>
            <div style={{ fontSize: 20, color: TOKENS.textPrimary, marginBottom: 6 }}>What would you like help with?</div>
            <p style={{ fontSize: 13, color: TOKENS.textMuted, marginBottom: 20 }}>Just a couple of quick questions first.</p>
            {SITUATION_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => { setSituation(opt.value); setStep(1); }} style={optionStyle(situation === opt.value)}>
                <div>{opt.label}</div>
                <div style={{ fontSize: 12, color: TOKENS.textFaint, marginTop: 2 }}>{opt.sub}</div>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ fontSize: 20, color: TOKENS.textPrimary, marginBottom: 6 }}>What's your timeline?</div>
            <p style={{ fontSize: 13, color: TOKENS.textMuted, marginBottom: 20 }}>No pressure either way.</p>
            {TIMELINE_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => { setTimeline(opt.value); setStep(2); }} style={optionStyle(timeline === opt.value)}>
                {opt.label}
              </button>
            ))}
            <button type="button" onClick={() => setStep(0)} style={{ background: "none", border: "none", color: TOKENS.textFaint, fontSize: 12.5, cursor: "pointer", marginTop: 4 }}>
              ← Back
            </button>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <div style={{ fontSize: 20, color: TOKENS.textPrimary, marginBottom: 6 }}>Almost done — your details</div>
            <p style={{ fontSize: 13, color: TOKENS.textMuted, marginBottom: 20 }}>I'll reach out to arrange a conversation.</p>

            <input required placeholder="Full name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} style={inputStyle} />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} style={inputStyle} />
            <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
            <input placeholder="Country" value={form.country_text} onChange={(e) => set("country_text", e.target.value)} style={inputStyle} />
            <textarea
              placeholder="Anything else you'd like to add? (optional)"
              rows={2}
              value={form.interest_note}
              onChange={(e) => set("interest_note", e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
            />

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: TOKENS.textMuted, marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} style={{ marginTop: 2 }} />
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
            <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: "none", color: TOKENS.textFaint, fontSize: 12.5, cursor: "pointer", marginTop: 10 }}>
              ← Back
            </button>
          </form>
        )}

        {step === 3 && (
          <div style={{ fontSize: 13.5, color: TOKENS.textPrimary, lineHeight: 1.6 }}>
            Thank you — I've received your details and will be in touch shortly.
          </div>
        )}
      </div>
    </div>
  );
}
