import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { TOKENS } from "./theme";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // Force a clean reload rather than a client-side transition —
    // otherwise data fetched once on the app's first load (like
    // whether you're a platform admin, or which tenant you belong
    // to) can keep showing stale results from whoever was
    // previously signed in in this same browser tab.
    window.location.href = "/";
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setResetSent(true);
    setBusy(false);
  }

  return (
    <div style={{
      height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: TOKENS.bg, fontFamily: "sans-serif",
    }}>
      <form onSubmit={showReset ? handleResetRequest : handleSubmit} style={{
        background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
        padding: 28, width: 300, display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Trivara Hub</div>

        {showReset ? (
          resetSent ? (
            <div style={{ fontSize: 13, color: TOKENS.textPrimary, lineHeight: 1.6 }}>
              Check your inbox for a link to reset your password.
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: TOKENS.textMuted, margin: "0 0 4px" }}>
                Enter your email and we'll send you a reset link.
              </p>
              <input
                type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
                style={{ background: "#F4F1E8", border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "9px 10px", color: TOKENS.textPrimary, fontSize: 13 }}
              />
              {error && <div style={{ color: TOKENS.riskBlocked, fontSize: 12.5 }}>{error}</div>}
              <button type="submit" disabled={busy} style={{
                background: TOKENS.gold, border: "none", borderRadius: 6, padding: "9px 0",
                color: "#FFFFFF", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4,
              }}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </>
          )
        ) : (
          <>
            <input
              type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ background: "#F4F1E8", border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "9px 10px", color: TOKENS.textPrimary, fontSize: 13 }}
            />
            <input
              type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ background: "#F4F1E8", border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "9px 10px", color: TOKENS.textPrimary, fontSize: 13 }}
            />
            {error && <div style={{ color: TOKENS.riskBlocked, fontSize: 12.5 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{
              background: TOKENS.gold, border: "none", borderRadius: 6, padding: "9px 0",
              color: "#FFFFFF", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4,
            }}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}

        <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: showReset ? 0 : 14, textAlign: "center" }}>
          {showReset ? (
            <button type="button" onClick={() => { setShowReset(false); setResetSent(false); setError(null); }} style={{ background: "none", border: "none", color: TOKENS.gold, cursor: "pointer", fontSize: 12.5, padding: 0 }}>
              ← Back to sign in
            </button>
          ) : (
            <>
              <button type="button" onClick={() => { setShowReset(true); setError(null); }} style={{ background: "none", border: "none", color: TOKENS.gold, cursor: "pointer", fontSize: 12.5, padding: 0, display: "block", marginBottom: 8 }}>
                Forgot password?
              </button>
              New here? <a href="/signup" style={{ color: TOKENS.gold }}>Create an account</a>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
