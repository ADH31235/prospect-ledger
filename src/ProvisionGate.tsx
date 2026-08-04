import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";


// Sits between "logged in" and "render the app." Provisioning
// happens here — on first real login — rather than immediately
// after the signup form, because whether signUp() returns a
// usable session right away depends on this project's
// email-confirmation setting. Checking here works correctly
// either way, without the signup page needing to know or care.
export default function ProvisionGate({ session, children }) {
  const [state, setState] = useState("checking"); // checking | needs_company_name | ready
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    checkProfile();
  }, [session?.user?.id]);

  async function checkProfile() {
    const { data } = await supabase.from("profiles").select("id").eq("id", session.user.id).maybeSingle();
    if (data) {
      setState("ready");
    } else {
      // If company_name was already captured at signup, try
      // provisioning immediately without asking again.
      const metaCompanyName = session.user.user_metadata?.company_name;
      if (metaCompanyName) {
        await provision(metaCompanyName);
      } else {
        setState("needs_company_name");
      }
    }
  }

  async function provision(name) {
    setBusy(true);
    setErrorMsg("");
    try {
      const { error } = await supabase.functions.invoke("provision-tenant", {
        body: { company_name: name },
      });
      if (error) throw error;
      setState("ready");
    } catch (err) {
      setErrorMsg(err?.message ?? "Couldn't set up your workspace — please try again.");
      setState("needs_company_name");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") {
    return <div style={{ height: "100%", background: TOKENS.bg }} />;
  }

  if (state === "needs_company_name") {
    return (
      <div style={{ minHeight: "100vh", background: TOKENS.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 20 }}>
        <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 32, width: 380, maxWidth: "100%" }}>
          <div style={{ fontSize: 19, color: TOKENS.textPrimary, marginBottom: 6 }}>One last step</div>
          <p style={{ fontSize: 13, color: TOKENS.textMuted, marginBottom: 18 }}>What's your company name? This sets up your workspace.</p>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company name"
            style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "10px 12px", color: TOKENS.textPrimary, fontSize: 13.5, marginBottom: 12 }}
          />
          {errorMsg && <div style={{ color: "#BD5A47", fontSize: 12.5, marginBottom: 12 }}>{errorMsg}</div>}
          <button
            onClick={() => companyName.trim() && provision(companyName.trim())}
            disabled={busy || !companyName.trim()}
            style={{ width: "100%", background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "11px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer", opacity: busy || !companyName.trim() ? 0.6 : 1 }}
          >
            {busy ? "Setting up…" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  return children;
}
