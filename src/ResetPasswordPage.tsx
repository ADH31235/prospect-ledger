import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { TOKENS } from "./theme";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | done | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords don't match.");
      return;
    }
    setStatus("saving");
    setErrorMsg("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("done");
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message ?? "Couldn't update password — the link may have expired.");
    }
  }

  const inputStyle = {
    background: "#F4F1E8", border: `1px solid ${TOKENS.border}`, borderRadius: 6,
    padding: "9px 10px", color: TOKENS.textPrimary, fontSize: 13,
  };

  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: TOKENS.bg, fontFamily: "sans-serif",
    }}>
      <div style={{
        background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
        padding: 28, width: 320,
      }}>
        <div style={{ color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 14 }}>
          Set a new password
        </div>

        {!ready ? (
          <div style={{ fontSize: 13, color: TOKENS.textMuted }}>Verifying your reset link…</div>
        ) : status === "done" ? (
          <div style={{ fontSize: 13, color: TOKENS.textPrimary, lineHeight: 1.6 }}>
            Password updated — taking you to sign in.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="password" placeholder="New password" value={password}
              onChange={(e) => setPassword(e.target.value)} style={inputStyle}
            />
            <input
              type="password" placeholder="Confirm new password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle}
            />
            {errorMsg && <div style={{ color: TOKENS.riskBlocked, fontSize: 12.5 }}>{errorMsg}</div>}
            <button type="submit" disabled={status === "saving"} style={{
              background: TOKENS.gold, border: "none", borderRadius: 6, padding: "9px 0",
              color: "#FFFFFF", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              {status === "saving" ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
