import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";


export default function SignupPage() {
  const [form, setForm] = useState({ company_name: "", full_name: "", email: "", password: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | needs_confirmation | done | error
  const [errorMsg, setErrorMsg] = useState("");

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { company_name: form.company_name, full_name: form.full_name } },
      });
      if (error) throw error;

      // Whether a session comes back immediately depends on this
      // Supabase project's email-confirmation setting — either
      // way, ProvisionGate (shown right after login) handles
      // actually creating the tenant, so we don't have to branch
      // logic here.
      if (data.session) {
        setStatus("done");
        window.location.href = "/";
      } else {
        setStatus("needs_confirmation");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message ?? "Something went wrong.");
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
      <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 32, width: 400, maxWidth: "100%" }}>
        <div style={{ fontSize: 21, color: TOKENS.textPrimary, marginBottom: 22 }}>Create your account</div>

        {status === "needs_confirmation" ? (
          <div style={{ fontSize: 13.5, color: TOKENS.textPrimary, lineHeight: 1.6 }}>
            Check your inbox for a confirmation link — once confirmed, sign in and your workspace will be set up automatically.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input required placeholder="Company name" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} style={inputStyle} />
            <input required placeholder="Your name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} style={inputStyle} />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} style={inputStyle} />
            <input required type="password" placeholder="Password" minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} style={inputStyle} />

            {errorMsg && <div style={{ color: "#BD5A47", fontSize: 12.5, marginBottom: 12 }}>{errorMsg}</div>}

            <button
              type="submit"
              disabled={status === "sending"}
              style={{ width: "100%", background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "11px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
            >
              {status === "sending" ? "Creating…" : "Create account"}
            </button>

            <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 14, textAlign: "center" }}>
              Already have an account? <a href="/" style={{ color: TOKENS.gold }}>Sign in</a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
